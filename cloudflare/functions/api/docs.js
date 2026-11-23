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
  const row = Number.isFinite(base)
    ? await env.DB.prepare(STAMP_SQL('?3', '?5')).bind(path, path.split('/')[0], body, Date.now(), base).first()
    : await env.DB.prepare(STAMP_SQL('?3')).bind(path, path.split('/')[0], body, Date.now()).first();
  if (!row) return Response.json({ code: 'conflict', message: 'O servidor tem uma versão mais nova deste registro' }, { status: 409 });
  return Response.json({ ok: true, updated: row.updated });
}

export async function onRequestDelete({ request, env }) {
  const path = new URL(request.url).searchParams.get('path') || '';
  if (!PATH_RE.test(path)) return Response.json({ code: 'invalid_argument', message: 'Caminho inválido' }, { status: 400 });
  const row = await env.DB.prepare(STAMP_SQL('NULL')).bind(path, path.split('/')[0], null, Date.now()).first();
  return Response.json({ ok: true, updated: row.updated });
}

// Marca de tempo sempre crescente, calculada DENTRO do próprio INSERT (um comando só é atômico no D1):
// duas gravações simultâneas nunca recebem a mesma marca nem ficam fora de ordem, e nenhuma escapa da sincronização.
// Parâmetros: ?1 caminho, ?2 coleção, ?3 dados (ou NULL na exclusão), ?4 hora do servidor.
const STAMP_SQL = (dataExpr, baseExpr) => 'INSERT INTO docs(path, col, data, updated) VALUES(?1, ?2, ' + dataExpr + ', (SELECT MAX(?4, COALESCE(MAX(updated), 0) + 1) FROM docs)) '
  + 'ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated' + (baseExpr ? ' WHERE docs.updated <= ' + baseExpr : '') + ' RETURNING updated';
