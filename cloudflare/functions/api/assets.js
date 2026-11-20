// POST   /api/assets            -> guarda o arquivo (corpo binário, Content-Type do arquivo)
// DELETE /api/assets?id=<id>    -> apaga
// Os arquivos são servidos em /_blob/<id>, o mesmo endereço usado no artefato.

const MAX = 20 * 1024 * 1024;
const OK_TYPE = /^(image|video)\//;

export async function onRequestPost({ request, env }) {
  const type = request.headers.get('Content-Type') || 'application/octet-stream';
  if (!OK_TYPE.test(type)) return Response.json({ code: 'invalid_argument', message: 'Só fotos e vídeos' }, { status: 415 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX) return Response.json({ code: 'too_large', message: 'O limite é 20 MB por arquivo' }, { status: 413 });
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.MEDIA.put(id, buf, { metadata: { type, size: buf.byteLength, at: Date.now() } });
  return Response.json({ id, url: '/_blob/' + id, sizeBytes: buf.byteLength, contentType: type });
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f]{32}$/.test(id)) return Response.json({ code: 'invalid_argument' }, { status: 400 });
  await env.MEDIA.delete(id);
  return Response.json({ ok: true });
}
