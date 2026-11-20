// GET    /api/docs?since=<ms>         -> documentos alterados depois de "since" (inclui exclusões)
// PUT    /api/docs?path=<col>/<id>    -> grava o documento (corpo JSON)
// DELETE /api/docs?path=<col>/<id>    -> marca como excluído

const PATH_RE = /^[a-z_]{2,40}\/[A-Za-z0-9_\-:.|]{1,200}$/;

export async function onRequestGet({ request, env }) {
  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  const { results } = await env.DB.prepare('SELECT path, col, data, updated FROM docs WHERE updated > ?1 ORDER BY updated').bind(since).all();
  const now = Date.now();
  return Response.json({ now, docs: results.map(r => ({ path: r.path, col: r.col, data: r.data == null ? null : JSON.parse(r.data), updated: r.updated })) });
}

export async function onRequestPut({ request, env }) {
  const path = new URL(request.url).searchParams.get('path') || '';
  if (!PATH_RE.test(path)) return Response.json({ code: 'invalid_argument', message: 'Caminho inválido' }, { status: 400 });
  const body = await request.text();
  if (body.length > 1_800_000) return Response.json({ code: 'invalid_argument', message: 'Documento grande demais' }, { status: 413 });
  try { JSON.parse(body); } catch (e) { return Response.json({ code: 'invalid_argument', message: 'JSON inválido' }, { status: 400 }); }
  const updated = await stamp(env);
  await env.DB.prepare('INSERT INTO docs(path, col, data, updated) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated')
    .bind(path, path.split('/')[0], body, updated).run();
  return Response.json({ ok: true, updated });
}

export async function onRequestDelete({ request, env }) {
  const path = new URL(request.url).searchParams.get('path') || '';
  if (!PATH_RE.test(path)) return Response.json({ code: 'invalid_argument', message: 'Caminho inválido' }, { status: 400 });
  const updated = await stamp(env);
  await env.DB.prepare('INSERT INTO docs(path, col, data, updated) VALUES(?1, ?2, NULL, ?3) ON CONFLICT(path) DO UPDATE SET data = NULL, updated = excluded.updated')
    .bind(path, path.split('/')[0], updated).run();
  return Response.json({ ok: true, updated });
}

// Marca de tempo sempre crescente, para nenhuma alteração escapar da sincronização
async function stamp(env) {
  const row = await env.DB.prepare('SELECT MAX(updated) AS m FROM docs').first();
  return Math.max(Date.now(), (row?.m || 0) + 1);
}
