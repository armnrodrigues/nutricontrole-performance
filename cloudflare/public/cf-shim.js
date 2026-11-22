/* NutriControle na Cloudflare: oferece ao app as mesmas peças que o Claude oferece no artefato
   (banco "db", IA "sample", arquivos "assets", usuário "user"), falando com as rotas /api deste site.
   O app em si não muda: ele continua chamando window.claude.use(nome). */
(function () {
  if (window.claude && window.claude.use) return; // dentro do Claude, não interfere
  const API = '/api';
  const CACHE_KEY = 'ncperf_cf_cache', OUTBOX_KEY = 'ncperf_cf_outbox';
  const err = (code, message) => ({ code, message });

  const SESSION_MSG = 'Sessão expirada: recarregue a página e entre de novo.';
  async function call(method, url, body, headers) {
    let r;
    // limite de tempo: rede presa conta como "sem conexão" (envio de foto/vídeo tem prazo maior)
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), url.startsWith('/assets') && method === 'POST' ? 180000 : url === '/ping' ? 8000 : 25000);
    try {
      try { r = await fetch(API + url, { method, body, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal: ac.signal }); }
      catch (e) { throw err('offline', 'Sem conexão com o servidor'); }
      // Sessão do Cloudflare Access vencida: as rotas respondem com redirecionamento para o login (ou 401 da checagem do site).
      if (r.type === 'opaqueredirect' || r.status === 401 || (r.status >= 300 && r.status < 400)) { S.authErr = true; throw err('session_expired', SESSION_MSG); }
      S.authErr = false;
      let j = null;
      // o limite de tempo vale também para a leitura do corpo: resposta que para no meio conta como "sem conexão"
      try { j = await r.json(); } catch (e) { if (ac.signal.aborted) throw err('offline', 'Sem conexão com o servidor'); }
      if (!r.ok || !j) throw err((j && j.code) || 'http_' + r.status, (j && j.message) || ('Erro ' + r.status));
      return j;
    } finally { clearTimeout(tm); }
  }

  /* ---------------- banco ----------------
     Regras (QA 4, dados reais):
     - "pronto" só depois de LER o servidor com sucesso. Erro ou banco vazio nunca contam como sincronizado.
     - Com cópia no aparelho e servidor fora (sem rede, erro 5xx, sessão vencida), abre a cópia marcada como "desatualizada".
     - Nada é enviado ao servidor antes da primeira leitura bem-sucedida da sessão: as gravações ficam na fila.
     - A fila de envio vive na memória e é copiada para o aparelho; se não couber, o cache é descartado para dar lugar a ela
       e, se ainda assim não couber, o app avisa. */
  const S = { docs: {}, ver: {}, since: 0, ready: false, synced: false, stale: false, authErr: false, srvErr: '', quota: false, noCache: false, listeners: new Set(), timer: null };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  let HAD_CACHE = false;
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.docs) { S.docs = c.docs; S.since = c.since || 0; S.ver = c.ver || {}; HAD_CACHE = Object.keys(S.docs).length > 0; } } catch (e) {}
  let OUT = {};
  try { const o = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}'); if (o && typeof o === 'object') OUT = o; } catch (e) {}
  // o que está na fila é a versão mais nova deste aparelho: vale sobre o cache (que pode ter sido descartado)
  Object.entries(OUT).forEach(([p, v]) => { if (v === null) delete S.docs[p]; else S.docs[p] = clone(v); });
  const queued = () => Object.keys(OUT).length;
  const GONE = new Set(); // caminhos que esta aba acabou de enviar: saem do aparelho
  function persistOut() {
    // preserva o que outra aba deixou na fila do aparelho e esta aba não conhece
    let all = OUT;
    try { const ls = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}'); if (ls && typeof ls === 'object') { all = Object.assign({}, OUT); Object.keys(ls).forEach(k => { if (!(k in OUT) && !GONE.has(k)) all[k] = ls[k]; }); } } catch (e) {}
    GONE.clear();
    const txt = JSON.stringify(all);
    try { localStorage.setItem(OUTBOX_KEY, txt); S.quota = false; return; } catch (e) { console.warn('fila de envio não coube no aparelho; descartando o cache local', e); }
    try { S.noCache = true; localStorage.removeItem(CACHE_KEY); localStorage.setItem(OUTBOX_KEY, txt); S.quota = false; }
    catch (e) { S.quota = true; console.warn('fila de envio sem espaço no aparelho', e); }
  }
  let saveT = null;
  function saveCache() {
    if (S.noCache) return;
    clearTimeout(saveT); saveT = setTimeout(() => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ docs: S.docs, since: S.since, ver: S.ver })); }
      catch (e) { console.warn('cache local cheio; a fila de envio tem prioridade', e); S.noCache = true; try { localStorage.removeItem(CACHE_KEY); } catch (_) {} persistOut(); }
    }, 800);
  }

  function emit() { S.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }

  async function pull() {
    const j = await call('GET', '/docs?since=' + S.since);
    if (!j || !Array.isArray(j.docs)) throw err('bad_response', 'Resposta inesperada do servidor');
    let changed = false;
    for (const d of j.docs) {
      if ((S.ver[d.path] || 0) > d.updated) continue; // já temos versão mais nova (gravada daqui)
      if (OUT[d.path] !== undefined) continue;        // edição local ainda não enviada vence
      S.ver[d.path] = d.updated;
      if (d.data == null) delete S.docs[d.path]; else S.docs[d.path] = d.data;
      changed = true;
      if (d.updated > S.since) S.since = d.updated;
    }
    if (changed) saveCache();
    return changed;
  }

  async function flushOutbox() {
    for (const path of Object.keys(OUT)) {
      const v = OUT[path]; if (v === undefined) continue;
      const sent = JSON.stringify(v);
      try {
        const j = v === null ? await call('DELETE', '/docs?path=' + encodeURIComponent(path))
          : await call('PUT', '/docs?path=' + encodeURIComponent(path), sent, { 'Content-Type': 'application/json' });
        S.ver[path] = j.updated;
        if (JSON.stringify(OUT[path]) === sent) { delete OUT[path]; GONE.add(path); persistOut(); }
      } catch (e) {
        if (e.code !== 'invalid_argument') throw e;
        // o servidor recusou este registro (caminho inválido ou grande demais): sai da fila, mas o usuário é avisado
        if (JSON.stringify(OUT[path]) === sent) { delete OUT[path]; GONE.add(path); persistOut(); }
        console.warn('registro recusado pelo servidor', path, e);
        try { if (typeof toast === 'function') toast('O servidor recusou um registro (' + path + '): ' + (e.message || 'inválido'), 7000); } catch (_) {}
      }
    }
    saveCache();
  }

  let syncing = null;
  function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      let pulled = false, changed = false, bad = null;
      // só envia depois de já ter lido o servidor com sucesso nesta sessão
      if (S.synced) { try { await flushOutbox(); } catch (e) { bad = e; } }
      try { changed = await pull(); pulled = true; } catch (e) { bad = e; console.warn('sync', e); }
      if (pulled && !S.synced) { S.synced = true; bad = null; try { await flushOutbox(); } catch (e) { bad = e; } }
      S.srvErr = bad ? (bad.code || 'erro') : '';
      if (pulled) { const was = S.stale; S.stale = false; if (changed || !S.ready || was) { S.ready = true; emit(); } }
      else if (!S.ready && Object.keys(S.docs).length) { S.ready = true; S.stale = true; emit(); } // servidor fora: abre a cópia do aparelho, avisando
      paint();
    })().finally(() => { syncing = null; });
    return syncing;
  }
  let started = false;
  function schedule() { started = true; clearInterval(S.timer); S.timer = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 12000); }
  document.addEventListener('visibilitychange', () => { if (started && document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => { if (started) sync(); });
  window.addEventListener('focus', () => { if (started) sync(); });

  /* Aviso na barra de sincronização do app (#syncBar). Só fala quando há problema; some sozinho quando normaliza. */
  function message() {
    const n = queued(); const pend = n ? ' ' + n + (n === 1 ? ' alteração guardada' : ' alterações guardadas') + ' neste aparelho, aguardando envio.' : '';
    if (S.authErr) return { text: 'Sessão expirada. Entre de novo para sincronizar.' + pend, act: 'Entrar de novo', fn: () => location.reload() };
    if (S.quota) return { text: 'Este aparelho está sem espaço para guardar as alterações pendentes (' + n + '). Não feche esta página até a sincronização voltar.' };
    if (S.srvErr === 'offline') return { text: (S.ready ? 'Sem conexão: usando a cópia deste aparelho.' : 'Sem conexão com o servidor: seus dados ainda não foram carregados.') + pend, act: 'Tentar de novo', fn: () => sync() };
    if (S.srvErr) return { text: (S.ready ? 'Servidor fora do ar: usando a cópia deste aparelho.' : 'Servidor fora do ar: não foi possível ler seus dados. Nada será gravado até voltar.') + pend, act: 'Tentar de novo', fn: () => sync() };
    return null;
  }
  function paint() {
    try {
      const bar = document.getElementById('syncBar'), txt = document.getElementById('syncTxt'); if (!bar || !txt) return;
      const m = message(); let a = document.getElementById('syncAct');
      if (!m) {
        if (bar.dataset.cf) { delete bar.dataset.cf; if (a) a.remove(); bar.className = 'ok'; txt.textContent = 'Sincronizado na nuvem'; setTimeout(() => { if (!bar.dataset.cf) bar.hidden = true; }, 3000); }
        return;
      }
      bar.dataset.cf = '1'; bar.hidden = false; bar.className = 'warn'; txt.textContent = m.text;
      if (m.act) { if (!a) { a = document.createElement('button'); a.id = 'syncAct'; a.type = 'button'; a.className = 'btn xs'; bar.appendChild(a); } a.textContent = m.act; a.onclick = m.fn; }
      else if (a) a.remove();
    } catch (e) {}
  }
  const NCS = { problem: () => !!message(), paint, localMsg: '', state: () => ({ ready: S.ready, synced: S.synced, stale: S.stale, authErr: S.authErr, srvErr: S.srvErr, quota: S.quota, queued: queued(), docs: Object.keys(S.docs).length, hadCache: HAD_CACHE }) };
  window.ncSync = NCS;
  window.addEventListener('DOMContentLoaded', () => paint());

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
        if (S.ready) setTimeout(fn, 0);
        return () => S.listeners.delete(fn);
      }
    };
  }

  function docRef(path) {
    return {
      async set(data) {
        S.docs[path] = clone(data);
        OUT[path] = clone(data); persistOut(); saveCache();
        // Sem internet (ou antes da primeira leitura do servidor) a gravação fica na fila do aparelho e sai sozinha depois.
        await sync();
        if (OUT[path] !== undefined && !S.srvErr && !S.authErr) await sync(); // a sincronização em curso já tinha passado da etapa de envio
        paint();
      },
      async delete() {
        delete S.docs[path];
        OUT[path] = null; persistOut(); saveCache();
        await sync();
        if (OUT[path] !== undefined && !S.srvErr && !S.authErr) await sync();
        paint();
      },
      async get() { await sync(); const d = S.docs[path]; return { exists: d !== undefined, id: path.split('/').pop(), data: () => clone(d) }; },
      onSnapshot(cb) {
        const fn = () => { const d = S.docs[path]; cb({ exists: d !== undefined, id: path.split('/').pop(), data: () => clone(d) }); };
        S.listeners.add(fn);
        if (S.ready) setTimeout(fn, 0);
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
      r = await fetch(API + '/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', redirect: 'manual', signal: opts.signal,
        body: JSON.stringify({ messages, images, tier: opts.modelTier || 'default', json }) });
    } catch (e) { if (e.name === 'AbortError') throw err('aborted', 'Cancelado'); throw err('offline', 'Sem conexão com o servidor'); }
    if (r.type === 'opaqueredirect' || r.status === 401 || (r.status >= 300 && r.status < 400)) { S.authErr = true; paint(); throw err('session_expired', SESSION_MSG); }
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
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, maxInputBytes: 3.5 * 1024 * 1024, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });

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
      try { await call('GET', '/ping'); }
      catch (e) {
        // Site sem as rotas /api (cópia estática) e nada guardado deste site no aparelho: o app segue no modo local.
        if (e.code === 'http_404' && !Object.keys(S.docs).length && !queued()) {
          console.warn('Cloudflare indisponível', e);
          NCS.localMsg = 'Modo local: este endereço não tem o banco do site. Os dados ficam só neste navegador.';
          return false;
        }
        // Qualquer outra falha (sem rede, erro do servidor, sessão vencida): continua no banco do site.
        // Com cópia no aparelho, abre a cópia avisando; sem cópia, espera o servidor. Nunca cai no modo local por erro.
        S.srvErr = e.code || 'erro';
      }
      schedule(); sync(); return true;
    })();
    return online;
  }
  // Mensagens do app que falam do Claude passam a falar deste site
  window.addEventListener('DOMContentLoaded', () => {
    try {
      AI_COPY.sampling_disabled = 'A IA ainda não está ligada neste site: falta cadastrar a chave da Anthropic no Cloudflare.';
      AI_COPY.not_granted = SESSION_MSG;
      AI_COPY.session_expired = SESSION_MSG;
    } catch (e) {}
  });

  const NS = { db, sample, assets, user };
  window.claude = Object.freeze({ use: async name => (NS[name] && await check()) ? NS[name] : null });
})();
