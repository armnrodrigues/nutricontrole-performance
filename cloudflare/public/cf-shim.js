/* NutriControle na Cloudflare: oferece ao app as mesmas peças que o Claude oferece no artefato
   (banco "db", IA "sample", arquivos "assets", usuário "user"), falando com as rotas /api deste site.
   O app em si não muda: ele continua chamando window.claude.use(nome). */
(function () {
  if (window.claude && window.claude.use) return; // dentro do Claude, não interfere
  const API = '/api';
  const CACHE_KEY = 'ncperf_cf_cache', OUTBOX_KEY = 'ncperf_cf_outbox';
  const err = (code, message) => ({ code, message });

  async function call(method, url, body, headers) {
    let r;
    try { r = await fetch(API + url, { method, body, headers, credentials: 'same-origin', cache: 'no-store' }); }
    catch (e) { throw err('offline', 'Sem conexão com o servidor'); }
    if (r.redirected && /cloudflareaccess/.test(r.url)) throw err('not_granted', 'Sessão expirada: recarregue a página e entre de novo.');
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw err((j && j.code) || 'http_' + r.status, (j && j.message) || ('Erro ' + r.status));
    return j;
  }

  /* ---------------- banco ---------------- */
  const S = { docs: {}, ver: {}, since: 0, ready: false, listeners: new Set(), timer: null };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.docs) { S.docs = c.docs; S.since = c.since || 0; S.ver = c.ver || {}; } } catch (e) {}
  let saveT = null;
  function saveCache() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ docs: S.docs, since: S.since, ver: S.ver })); } catch (e) {} }, 800); }
  const outbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}'); } catch (e) { return {}; } };
  const setOutbox = o => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(o)); } catch (e) {} };

  function emit() { S.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }

  async function pull() {
    const j = await call('GET', '/docs?since=' + S.since);
    let changed = false;
    for (const d of j.docs) {
      if ((S.ver[d.path] || 0) > d.updated) continue; // já temos versão mais nova (gravada daqui)
      if (outbox()[d.path] !== undefined) continue;   // edição local ainda não enviada vence
      S.ver[d.path] = d.updated;
      if (d.data == null) delete S.docs[d.path]; else S.docs[d.path] = d.data;
      changed = true;
      if (d.updated > S.since) S.since = d.updated;
    }
    if (changed) saveCache();
    return changed;
  }

  async function flushOutbox() {
    const o = outbox();
    for (const [path, v] of Object.entries(o)) {
      try {
        const j = v === null ? await call('DELETE', '/docs?path=' + encodeURIComponent(path))
          : await call('PUT', '/docs?path=' + encodeURIComponent(path), JSON.stringify(v), { 'Content-Type': 'application/json' });
        S.ver[path] = j.updated;
        const cur = outbox(); if (JSON.stringify(cur[path]) === JSON.stringify(v)) { delete cur[path]; setOutbox(cur); }
      } catch (e) { if (e.code === 'invalid_argument') { const cur = outbox(); delete cur[path]; setOutbox(cur); } else throw e; }
    }
    saveCache();
  }

  let syncing = null;
  function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      try { await flushOutbox(); } catch (e) {}
      let changed = false;
      try { changed = await pull(); } catch (e) { console.warn('sync', e); }
      if (changed || !S.ready) { S.ready = true; emit(); }
    })().finally(() => { syncing = null; });
    return syncing;
  }
  function schedule() { clearInterval(S.timer); S.timer = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 12000); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => sync());
  window.addEventListener('focus', () => sync());

  function snapOf(col, order, lim) {
    let list = Object.entries(S.docs).filter(([p]) => p.startsWith(col + '/') && p.indexOf('/', col.length + 1) < 0)
      .map(([p, d]) => ({ id: p.slice(col.length + 1), d }));
    if (order) list.sort((a, b) => String((b.d || {})[order.f] ?? '').localeCompare(String((a.d || {})[order.f] ?? '')) * (order.dir === 'asc' ? -1 : 1));
    if (lim) list = list.slice(0, lim);
    return { docs: list.map(x => ({ id: x.id, data: () => clone(x.d) })), size: list.length, empty: !list.length };
  }

  function query(col, order, lim) {
    return {
      orderBy(f, dir) { return query(col, { f, dir: dir || 'asc' }, lim); },
      limit(n) { return query(col, order, n); },
      async get() { await sync(); return snapOf(col, order, lim); },
      onSnapshot(cb) {
        const fn = () => cb(snapOf(col, order, lim));
        S.listeners.add(fn);
        if (S.ready || Object.keys(S.docs).length) setTimeout(fn, 0);
        return () => S.listeners.delete(fn);
      }
    };
  }

  function docRef(path) {
    return {
      async set(data) {
        S.docs[path] = clone(data);
        const o = outbox(); o[path] = clone(data); setOutbox(o); saveCache();
        // Sem internet a gravação fica guardada no aparelho e sai sozinha quando a conexão voltar.
        await sync();
      },
      async delete() {
        delete S.docs[path];
        const o = outbox(); o[path] = null; setOutbox(o); saveCache();
        await sync();
      },
      async get() { await sync(); const d = S.docs[path]; return { exists: d !== undefined, id: path.split('/').pop(), data: () => clone(d) }; },
      onSnapshot(cb) {
        const fn = () => { const d = S.docs[path]; cb({ exists: d !== undefined, id: path.split('/').pop(), data: () => clone(d) }); };
        S.listeners.add(fn);
        if (S.ready || Object.keys(S.docs).length) setTimeout(fn, 0);
        return () => S.listeners.delete(fn);
      }
    };
  }

  const db = Object.freeze({
    collection: name => query(name),
    doc: path => docRef(path)
  });

  /* ---------------- IA ---------------- */
  const toB64 = async blob => {
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  async function ask(input, opts, json) {
    opts = opts || {};
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const images = await Promise.all((opts.images || []).map(async b => ({ type: b.type || 'image/jpeg', data: await toB64(b) })));
    let r;
    try {
      r = await fetch(API + '/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: opts.signal,
        body: JSON.stringify({ messages, images, tier: opts.modelTier || 'default', json }) });
    } catch (e) { if (e.name === 'AbortError') throw err('aborted', 'Cancelado'); throw err('offline', 'Sem conexão com o servidor'); }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw err((j && j.code) || 'ai_error', (j && j.message) || ('Erro ' + r.status));
    if (opts.onText) try { opts.onText({ text: j.text, delta: j.text }); } catch (e) {}
    return j;
  }
  function parseJSON(t) {
    const s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch (e) {}
    const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
    throw Object.assign(err('invalid_json', 'A resposta veio fora do formato esperado.'), { text: t });
  }
  const sample = async (input, opts) => { const j = await ask(input, opts, false); return { text: j.text, truncated: j.truncated }; };
  sample.json = async (input, opts) => parseJSON((await ask(input, opts, true)).text);
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, maxInputBytes: 20 * 1024 * 1024, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });

  /* ---------------- arquivos ---------------- */
  const assets = {
    async upload(blob) {
      if (blob.size > 20 * 1024 * 1024) throw err('too_large', 'O limite é 20 MB por arquivo');
      return call('POST', '/assets', blob, { 'Content-Type': blob.type || 'application/octet-stream' });
    },
    async delete(id) { await call('DELETE', '/assets?id=' + encodeURIComponent(id)); },
    async list() { return { assets: [], usage: {} }; }
  };

  /* ---------------- usuário ---------------- */
  const user = { id: async () => 'owner', me: async () => ({ id: 'owner', name: '' }), isOwner: () => true, canEdit: () => true, can: () => true, profiles: async () => ({}) };

  /* ---------------- entrada ---------------- */
  let online = null;
  function check() {
    if (!online) online = (async () => {
      try { await call('GET', '/ping'); schedule(); sync(); return true; }
      catch (e) {
        // sem servidor mas com cópia no aparelho: abre com o que tem e tenta de novo depois
        if (Object.keys(S.docs).length && e.code === 'offline') { schedule(); setTimeout(() => emit(), 0); return true; }
        console.warn('Cloudflare indisponível', e); return false;
      }
    })();
    return online;
  }
  // Mensagens do app que falam do Claude passam a falar deste site
  window.addEventListener('DOMContentLoaded', () => {
    try {
      AI_COPY.sampling_disabled = 'A IA ainda não está ligada neste site: falta cadastrar a chave da Anthropic no Cloudflare.';
      AI_COPY.not_granted = 'Sessão expirada: recarregue a página e entre de novo.';
      AI_COPY.session_expired = 'Sessão expirada: recarregue a página e entre de novo.';
    } catch (e) {}
  });

  const NS = { db, sample, assets, user };
  window.claude = Object.freeze({ use: async name => (NS[name] && await check()) ? NS[name] : null });
})();
