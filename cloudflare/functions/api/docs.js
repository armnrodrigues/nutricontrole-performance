// GET    /api/docs?since=<ms>         -> documentos alterados depois de "since" (inclui exclusões)
// PUT    /api/docs?path=<col>/<id>    -> grava o documento (corpo JSON)
// DELETE /api/docs?path=<col>/<id>    -> marca como excluído

const PATH_RE = /^[a-z_]{2,40}\/[A-Za-z0-9_\-:.|]{1,200}$/;

export async function onRequestGet({ request, env }) {
  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  const { results } = await env.DB.prepare('SELECT path, col, data, updated FROM docs WHERE updated > ?1 AND (data IS NULL OR json_valid(data)) ORDER BY updated').bind(since).all();
  const now = Date.now();
  // O campo data já foi gravado como JSON válido (conferido no PUT): vai cru, sem reprocessar o banco inteiro a cada leitura.
  const body = '{"now":' + now + ',"docs":[' + results.map(r => '{"path":' + JSON.stringify(r.path) + ',"col":' + JSON.stringify(r.col) + ',"data":' + (r.data == null ? 'null' : r.data) + ',"updated":' + Number(r.updated) + '}').join(',') + ']}';
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function onRequestPut({ request, env }) {
  const path = new URL(request.url).searchParams.get('path') || '';
  if (!PATH_RE.test(path)) return Response.json({ code: 'invalid_argument', message: 'Caminho inválido' }, { status: 400 });
  const body = await request.text();
  if (body.length > 1_800_000) return Response.json({ code: 'invalid_argument', message: 'Documento grande demais' }, { status: 413 });
  try { JSON.parse(body); } catch (e) { return Response.json({ code: 'invalid_argument', message: 'JSON inválido' }, { status: 400 }); }
  // QA 7, 2ª passada (C2-02): gravação condicional. "base" = versão do servidor que o aparelho leu antes de enviar. Se o servidor já tem
  // versão mais nova (outro aparelho gravou entre a leitura e o envio), nada é gravado: o aparelho lê de novo, junta e reenvia.
  const baseTxt = new URL(request.url).searchParams.get('base');
  const base = baseTxt == null || baseTxt === '' ? NaN : Number(baseTxt);
  const up = Number.isFinite(base)
    ? env.DB.prepare(STAMP_SQL('?3', '?5')).bind(path, path.split('/')[0], body, Date.now(), base)
    : env.DB.prepare(STAMP_SQL('?3')).bind(path, path.split('/')[0], body, Date.now());
  // v60 · P8: treino que perde séries guarda a versão de antes mesmo dentro da janela de 10 min
  let force = 0;
  if (path.split('/')[0] === 'workouts') {
    try { const old = await env.DB.prepare('SELECT data FROM docs WHERE path = ?1').bind(path).first(); if (old && old.data && setCount(JSON.parse(old.data)) > setCount(JSON.parse(body))) force = 1; } catch (e) {}
  }
  const row = await withHist(env, path, up, Number.isFinite(base) ? base : null, force);
  if (!row) return Response.json({ code: 'conflict', message: 'O servidor tem uma versão mais nova deste registro' }, { status: 409 });
  return Response.json({ ok: true, updated: row.updated });
}

export async function onRequestDelete({ request, env }) {
  const path = new URL(request.url).searchParams.get('path') || '';
  if (!PATH_RE.test(path)) return Response.json({ code: 'invalid_argument', message: 'Caminho inválido' }, { status: 400 });
  const row = await withHist(env, path, env.DB.prepare(STAMP_SQL('NULL')).bind(path, path.split('/')[0], null, Date.now()), null, 1); // exclusão: sempre guarda a versão de antes
  return Response.json({ ok: true, updated: row ? row.updated : Date.now() });
}

// v58 · histórico (regra R-02 de qa/REGRAS.md): antes de gravar ou excluir, a versão que estava no banco vai para docs_hist, no mesmo lote
// (atômico). Guardado por 30 dias.
// v60 · P8 (decisão do Antonio, 26/11): treino guarda no máximo uma versão a cada 10 min por caminho (antes: toda versão, uma a cada número
// digitado); demais registros: uma a cada 30 min. SEMPRE guarda (?4 = 1) antes de uma exclusão e quando a gravação tira séries do treino.
// Gravação condicional recusada (409, ?3 = base mais velha que o banco) não guarda nada (antes entrava uma versão a mais sem ter gravado).
// Parâmetros: ?1 caminho, ?2 agora, ?3 base (ou NULL), ?4 forçar (1 ou 0).
const HIST_SQL = 'INSERT INTO docs_hist(path, col, data, updated, saved) SELECT path, col, data, updated, ?2 FROM docs WHERE path = ?1 AND data IS NOT NULL '
  + 'AND (?3 IS NULL OR updated <= ?3) '
  + "AND (?4 = 1 OR NOT EXISTS (SELECT 1 FROM docs_hist h WHERE h.path = ?1 AND h.saved > ?2 - (CASE WHEN docs.col = 'workouts' THEN 600000 ELSE 1800000 END)))";
const KEEP_MS = 30 * 24 * 3600 * 1000;
const setCount = w => ((w && w.exercises) || []).reduce((n, e) => n + ((e && e.sets) || []).filter(s => s && (s.kg != null || s.reps != null)).length, 0);
async function withHist(env, path, upStmt, base, force) {
  const now = Date.now();
  try {
    const stmts = [env.DB.prepare(HIST_SQL).bind(path, now, base == null ? null : base, force ? 1 : 0), upStmt];
    if (Math.random() < 0.02) stmts.push(env.DB.prepare('DELETE FROM docs_hist WHERE saved < ?1').bind(now - KEEP_MS));
    const res = await env.DB.batch(stmts);
    return (res[1] && res[1].results && res[1].results[0]) || null;
  } catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
    return await upStmt.first(); // tabela ainda não criada: grava sem histórico (o publicar.sh cria pelo schema.sql)
  }
}

// Marca de tempo sempre crescente, calculada DENTRO do próprio INSERT (um comando só é atômico no D1):
// duas gravações simultâneas nunca recebem a mesma marca nem ficam fora de ordem, e nenhuma escapa da sincronização.
// Parâmetros: ?1 caminho, ?2 coleção, ?3 dados (ou NULL na exclusão), ?4 hora do servidor.
const STAMP_SQL = (dataExpr, baseExpr) => 'INSERT INTO docs(path, col, data, updated) VALUES(?1, ?2, ' + dataExpr + ', (SELECT MAX(?4, COALESCE(MAX(updated), 0) + 1) FROM docs)) '
  + 'ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated' + (baseExpr ? ' WHERE docs.updated <= ' + baseExpr : '') + ' RETURNING updated';
