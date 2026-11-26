// v58 · GET /api/hist?col=workouts  -> versões anteriores dos registros dessa coleção nos últimos 30 dias (mais recentes primeiro).
// v60 · P8: até 12 versões por caminho (as mais recentes) e até 600 no total; antes eram as 300 mais recentes de todos juntos, o que cobria poucos dias.
// A tela agrupa por treino e mostra a melhor versão de cada um.
// Alimenta "Recuperar treino apagado ou alterado" em Ajustes. Só leitura; a restauração é uma gravação normal (PUT /api/docs), que por sua vez
// guarda no histórico a versão que estava antes.
const COL_RE = /^[a-z_]{2,40}$/;
const KEEP_MS = 30 * 24 * 3600 * 1000;

export async function onRequestGet({ request, env }) {
  const col = new URL(request.url).searchParams.get('col') || '';
  if (!COL_RE.test(col)) return Response.json({ code: 'invalid_argument', message: 'Coleção inválida' }, { status: 400 });
  let results = [];
  try {
    ({ results } = await env.DB.prepare('SELECT path, col, data, updated, saved FROM docs_hist h WHERE col = ?1 AND saved > ?2 AND json_valid(data) '
      + 'AND (SELECT COUNT(*) FROM docs_hist h2 WHERE h2.path = h.path AND h2.saved > h.saved AND h2.saved > ?2) < 12 ORDER BY saved DESC LIMIT 600')
      .bind(col, Date.now() - KEEP_MS).all());
  } catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
  }
  const body = '{"versions":[' + results.map(r => '{"path":' + JSON.stringify(r.path) + ',"col":' + JSON.stringify(r.col) + ',"data":' + r.data
    + ',"updated":' + Number(r.updated) + ',"saved":' + Number(r.saved) + '}').join(',') + ']}';
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
