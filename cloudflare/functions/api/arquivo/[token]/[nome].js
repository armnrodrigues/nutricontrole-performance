// GET /api/arquivo/<token>/<nome> -> o arquivo guardado por POST /api/arquivo (15 minutos, só com login).
export async function onRequestGet({ params, env }) {
  const token = String(params.token || '');
  const gone = () => new Response('Este arquivo expirou. Gere de novo no app.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!/^[0-9a-f]{32}$/.test(token)) return gone();
  const { value, metadata } = await env.MEDIA.getWithMetadata('tmp:' + token, { type: 'arrayBuffer' });
  if (!value || !metadata || metadata.exp <= Date.now() || metadata.name !== String(params.nome || '')) return gone();
  return new Response(value, { headers: { 'Content-Type': metadata.type, 'Content-Disposition': 'inline; filename="' + metadata.name + '"', 'Content-Length': String(value.byteLength), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
