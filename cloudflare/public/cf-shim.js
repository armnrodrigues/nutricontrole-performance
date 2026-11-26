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
      if (r.ok && !j) throw err('not_json', 'Resposta inesperada do site');
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
  /* QA 7 (P-01, P-02, C-04): base de cada edição na fila = o documento como este aparelho o tinha ANTES de mexer. Com ela, o que outro
     aparelho gravou no mesmo documento é juntado campo a campo (o que este aparelho não mexeu fica com o valor do servidor), em vez de
     ser apagado. Até dois níveis abaixo do documento (ex.: muscleConfirm por exercício, session por campo, meals por refeição).
     Listas (itens de uma refeição, atividades) contam como um valor só. Campo mexido nos dois lados: vale o deste aparelho, como antes. */
  const BASE_KEY = 'ncperf_cf_base';
  let BASE = {};
  try { const b = JSON.parse(localStorage.getItem(BASE_KEY) || '{}'); if (b && typeof b === 'object') BASE = b; } catch (e) {}
  Object.keys(BASE).forEach(p => { if (!(p in OUT)) delete BASE[p]; });
  const saveBase = () => {
    try {
      // preserva a base que outra aba guardou para um registro que ainda está na fila do aparelho
      let all = BASE;
      try { const lb = JSON.parse(localStorage.getItem(BASE_KEY) || '{}'), lo = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}'); if (lb && typeof lb === 'object') { all = Object.assign({}, BASE); Object.keys(lb).forEach(k => { if (!(k in BASE) && !(k in OUT) && lo && k in lo) all[k] = lb[k]; }); } } catch (e) {}
      localStorage.setItem(BASE_KEY, JSON.stringify(all));
    } catch (e) {}
  };
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  // vazio (null, 0, '', [], {}) e ausente contam como a mesma coisa: o app cria o documento com esses valores-padrão ao gravar
  const nz = v => (v == null || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length)) ? null : v;
  const same = (a, b) => JSON.stringify(nz(a)) === JSON.stringify(nz(b));
  // lista (itens de uma refeição, atividades, pendências): fica o que o outro aparelho tem, menos o que este aparelho tirou, mais o que este aparelho pôs
  const jk = v => JSON.stringify(v);
  // QA 8 (C2-01): conta repetições (dois itens iguais são dois lançamentos); o que os dois aparelhos acrescentaram igual entra uma vez
  const ak = x => (x && x.src === 'Apple' && x.start) ? 'A|' + x.start + '|' + (x.min || 0) + '|' + (x.kcal || 0) : null; // mesma leitura do Apple
  function mergeArr(b, m, t) {
    b = Array.isArray(b) ? b : [];
    const cnt = a => { const c = new Map(); a.forEach(x => { const k = jk(x); c.set(k, (c.get(k) || 0) + 1); }); return c; };
    const cb = cnt(b), cm = cnt(m), ct = cnt(t), want = new Map();
    new Set([...cb.keys(), ...cm.keys(), ...ct.keys()]).forEach(k => { const nb = cb.get(k) || 0, nm = cm.get(k) || 0, nt = ct.get(k) || 0;
      want.set(k, Math.max(0, nb - Math.max(0, nb - nm) - Math.max(0, nb - nt)) + Math.max(0, nm - nb, nt - nb)); });
    // mesma atividade do Apple mudada nos dois aparelhos: vale a deste aparelho (como antes do QA 8), sem contar duas vezes
    const mAdd = new Set(m.filter(x => (cm.get(jk(x)) || 0) > (cb.get(jk(x)) || 0)).map(ak).filter(Boolean));
    const out = [], take = (x, mine) => { const k = jk(x), w = want.get(k) || 0; if (w <= 0) return; if (!mine && mAdd.has(ak(x)) && !cm.has(k)) return; out.push(x); want.set(k, w - 1); };
    t.forEach(x => take(x, false)); m.forEach(x => take(x, true));
    return out;
  }
  // QA 9 (P-01) · treino digitado em dois aparelhos: a lista de exercícios é juntada por exercício (nome do protocolo ou nome).
  // O que só um aparelho mexeu fica; exercício mexido nos dois: fica o que tem mais séries lançadas (empate: o deste aparelho).
  const exKey = e => String((e && (e.protoName || e.name)) || '').trim().toLowerCase();
  const nSets = e => ((e && e.sets) || []).filter(x => x && (x.kg != null || x.reps != null)).length;
  function mergeEx(b, m, t) {
    b = Array.isArray(b) ? b : []; const bm = new Map(b.map(e => [exKey(e), e])), tm = new Map(t.map(e => [exKey(e), e])), seen = new Set(), out = [];
    m.forEach(e => { const k = exKey(e), o = tm.get(k), bb = bm.get(k); seen.add(k);
      if (!o) { if (!bb || !same(e, bb)) out.push(e); return; }            // o outro aparelho tirou: só fica se este mexeu nele
      out.push(bb && same(e, bb) ? o : bb && same(o, bb) ? e : (nSets(o) > nSets(e) ? o : e)); });
    t.forEach(e => { const k = exKey(e); if (!seen.has(k) && !(bm.has(k) && same(e, bm.get(k)))) out.push(e); }); // o outro pôs ou mexeu e este não tem
    return out;
  }
  function merge3(base, mine, theirs, depth, lists) {
    if (!isObj(mine) || !isObj(theirs)) return mine;
    base = isObj(base) ? base : {}; const out = {};
    new Set(Object.keys(mine).concat(Object.keys(theirs))).forEach(k => {
      const m = mine[k], t = theirs[k], b = base[k];
      if (same(m, b)) { if (k in theirs) out[k] = t; }                                   // este aparelho não mexeu: vale o servidor
      else if (same(t, b)) { if (k in mine) out[k] = m; }                                 // só este aparelho mexeu
      else if (depth > 0 && isObj(m) && isObj(t)) out[k] = merge3(b, m, t, depth - 1, lists);    // os dois mexeram: desce um nível
      else if (lists && (Array.isArray(m) || m === undefined) && (Array.isArray(t) || t === undefined) && (Array.isArray(m) || Array.isArray(t))) { const r = mergeArr(b, m || [], t || []); if (r.length || k in mine) out[k] = r; } // lista: junta item a item
      else if (lists === 'wk' && k === 'exercises' && Array.isArray(m) && Array.isArray(t)) out[k] = mergeEx(b, m, t); // treino: junta por exercício
      else if (k in mine) out[k] = m;                                                     // mesmo campo nos dois: vale o deste aparelho (como antes)
    });
    return out;
  }
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

  function emit() {
    S.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
    Object.keys(VIEW).forEach(p => { if (!BUSY[p]) delete VIEW[p]; }); // sem gravação em curso, o app aceitou a versão juntada
  }

  const MERGED = new Set();
  /* QA 7, 2ª passada (C2-01): o app ignora o que chega do banco enquanto tem gravação em curso no mesmo documento. Se nesse meio-tempo
     houve junção, a gravação seguinte do app ainda vem SEM os campos do outro aparelho e os apagaria. VIEW guarda o documento como o app o
     conhecia; a gravação seguinte é rebaseada sobre o documento juntado (só o que o app mudou desde VIEW entra por cima). */
  const VIEW = {}, BUSY = {};
  async function pull() {
    const j = await call('GET', '/docs?since=' + S.since);
    if (!j || !Array.isArray(j.docs)) throw err('bad_response', 'Resposta inesperada do servidor');
    let changed = false;
    for (const d of j.docs) {
      if ((S.ver[d.path] || 0) > d.updated) continue; // já temos versão mais nova (gravada daqui)
      if (OUT[d.path] !== undefined) {                // edição local ainda não enviada: junta com o que o servidor tem de novo
        S.ver[d.path] = d.updated;                    // versão do servidor que este aparelho leu: vai como "base" no envio (C2-02)
        if (OUT[d.path] !== null && d.data != null && d.path in BASE && !same(d.data, BASE[d.path])) {
          const m = merge3(BASE[d.path], OUT[d.path], d.data, 2, /^days\//.test(d.path) || (/^workouts\//.test(d.path) && 'wk'));
          if (!(d.path in VIEW)) VIEW[d.path] = clone(OUT[d.path]);
          OUT[d.path] = m; S.docs[d.path] = clone(m); BASE[d.path] = clone(d.data); persistOut(); saveBase(); changed = true; MERGED.add(d.path);
        }
        continue;
      }
      S.ver[d.path] = d.updated;
      if (d.data == null) delete S.docs[d.path]; else S.docs[d.path] = d.data;
      changed = true;
      if (d.updated > S.since) S.since = d.updated;
    }
    if (changed) saveCache();
    return changed;
  }

  /* QA 7, 2ª passada (C2-02): o envio leva a versão do servidor que este aparelho leu ("base"). Se outro aparelho gravou entre a leitura
     e o envio, o servidor recusa (409 "conflict") sem gravar; o aparelho lê de novo, junta e reenvia. Depois de duas recusas seguidas do
     mesmo registro o envio vai sem "base" (como antes), para a fila nunca ficar presa. */
  const CONFL = {};
  async function flushOutbox() {
    let conflict = false;
    for (const path of Object.keys(OUT)) {
      const v = OUT[path]; if (v === undefined) continue;
      const sent = JSON.stringify(v);
      try {
        const j = v === null ? await call('DELETE', '/docs?path=' + encodeURIComponent(path))
          : await call('PUT', '/docs?path=' + encodeURIComponent(path) + ((CONFL[path] || 0) < 2 ? '&base=' + (S.ver[path] || 0) : ''), sent, { 'Content-Type': 'application/json' });
        S.ver[path] = j.updated; delete CONFL[path];
        if (JSON.stringify(OUT[path]) === sent) { delete OUT[path]; delete BASE[path]; GONE.add(path); persistOut(); saveBase(); }
        else if (OUT[path] !== undefined && v !== null) { BASE[path] = JSON.parse(sent); saveBase(); } // editado de novo durante o envio: a base passa a ser o que o servidor acabou de aceitar
      } catch (e) {
        if (e.code === 'conflict') { CONFL[path] = (CONFL[path] || 0) + 1; conflict = true; continue; }
        if (e.code !== 'invalid_argument') throw e;
        // o servidor recusou este registro (caminho inválido ou grande demais): sai da fila, mas o usuário é avisado
        if (JSON.stringify(OUT[path]) === sent) { delete OUT[path]; delete BASE[path]; GONE.add(path); persistOut(); saveBase(); }
        console.warn('registro recusado pelo servidor', path, e);
        try { if (typeof toast === 'function') toast('O servidor recusou um registro (' + path + '): ' + (e.message || 'inválido'), 7000); } catch (_) {}
      }
    }
    saveCache();
    return conflict;
  }

  let syncing = null;
  function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      let pulled = false, changed = false, bad = null;
      // QA 7 (P-02): sempre LÊ o servidor antes de enviar. O que outro aparelho gravou entra na junção e não é apagado pelo envio;
      // se a leitura falhar, nada é enviado nesta volta (a fila continua guardada no aparelho).
      try { changed = await pull(); pulled = true; } catch (e) { bad = e; console.warn('sync', e); }
      if (pulled) { S.synced = true; try { for (let i = 0; i < 3 && await flushOutbox(); i++) { if (await pull()) changed = true; } } catch (e) { bad = e; } }
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
    if (S.srvErr === 'not_json') return { text: 'O site respondeu com uma página no lugar dos dados (login vencido ou Wi-Fi pedindo aceite). Entre de novo ou aceite o Wi-Fi.' + pend, act: 'Abrir de novo', fn: () => location.reload() };
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
  Object.defineProperty(NCS, 'aiTimeout', { get: () => AI_TIMEOUT, set: v => { AI_TIMEOUT = Math.max(50, Number(v) || 180000); } });
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
        BUSY[path] = (BUSY[path] || 0) + 1;
        try {
          if (path in VIEW) { const raw = clone(data); if (S.docs[path] !== undefined) data = merge3(VIEW[path], data, S.docs[path], 2, /^days\//.test(path) || (/^workouts\//.test(path) && 'wk')); VIEW[path] = raw; MERGED.add(path); }
          if (OUT[path] === undefined) { BASE[path] = S.docs[path] === undefined ? null : clone(S.docs[path]); saveBase(); }
          S.docs[path] = clone(data);
          OUT[path] = clone(data); persistOut(); saveCache();
          // Sem internet (ou antes da primeira leitura do servidor) a gravação fica na fila do aparelho e sai sozinha depois.
          await sync();
          if (OUT[path] !== undefined && !S.srvErr && !S.authErr) await sync(); // a sincronização em curso já tinha passado da etapa de envio
        } finally { BUSY[path]--; }
        if (MERGED.delete(path)) setTimeout(emit, 0); // o documento foi juntado com o do servidor: o app recebe a versão juntada assim que esta gravação termina
        paint();
      },
      async delete() {
        delete S.docs[path]; delete BASE[path]; delete VIEW[path]; saveBase();
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
  let AI_TIMEOUT = 180000; // 3 min por pedido à IA (um lote de até 4 páginas); o laboratório encurta por ncSync.aiTimeout
  async function ask(input, opts, json) {
    opts = opts || {};
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const images = await Promise.all((opts.images || []).map(async b => ({ type: b.type || 'image/jpeg', data: await toB64(b) })));
    let r, j, late = false;
    // QA 7 (P-06): limite de tempo, como nas rotas do banco. Pedido preso (ou resposta que para no meio) conta como "sem conexão" e o app tenta de novo.
    const ac = new AbortController(); const tm = setTimeout(() => { late = true; ac.abort(); }, AI_TIMEOUT);
    if (opts.signal) { if (opts.signal.aborted) ac.abort(); else opts.signal.addEventListener('abort', () => ac.abort(), { once: true }); }
    try {
      try {
        r = await fetch(API + '/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', redirect: 'manual', signal: ac.signal,
          body: JSON.stringify({ messages, images, tier: opts.modelTier || 'default', json }) });
      } catch (e) { if (e.name === 'AbortError' && !late) throw err('aborted', 'Cancelado'); throw err('offline', 'Sem conexão com o servidor'); }
      if (r.type === 'opaqueredirect' || r.status === 401 || (r.status >= 300 && r.status < 400)) { S.authErr = true; paint(); throw err('session_expired', SESSION_MSG); }
      j = await r.json().catch(() => null);
      if (!j && late) throw err('offline', 'Sem conexão com o servidor');
    } finally { clearTimeout(tm); }
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
      // QA 8 (C2-06): arquivo sem tipo (app Arquivos, AirDrop) ganha o tipo pela extensão; senão o /api/assets recusa
      const nm = String(blob.name || '').toLowerCase();
      const ty = blob.type || (/\.mov$/.test(nm) ? 'video/quicktime' : /\.(mp4|m4v)$/.test(nm) ? 'video/mp4' : /\.webm$/.test(nm) ? 'video/webm' : /\.(jpe?g)$/.test(nm) ? 'image/jpeg' : /\.png$/.test(nm) ? 'image/png' : /\.(heic|heif)$/.test(nm) ? 'image/heic' : 'application/octet-stream');
      return call('POST', '/assets', blob, { 'Content-Type': ty });
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
      AI_COPY.offline = 'Sem conexão: a leitura por IA precisa de internet. Tente de novo quando a rede voltar.';
    } catch (e) {}
  });

  const NS = { db, sample, assets, user };
  window.claude = Object.freeze({ use: async name => (NS[name] && await check()) ? NS[name] : null });
})();
