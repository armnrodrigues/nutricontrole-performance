export async function onRequestGet({ params, env }) {
  const id = String(params.id || '');
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response('Não encontrado', { status: 404 });
  const { value, metadata } = await env.MEDIA.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!value) return new Response('Não encontrado', { status: 404 });
  return new Response(value, { headers: { 'Content-Type': metadata?.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable' } });
}
