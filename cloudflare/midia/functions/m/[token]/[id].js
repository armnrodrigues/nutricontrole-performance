import { SEC, loadShare, gone } from '../../../lib/shared.js';

// Serve só as mídias listadas no link, com suporte a pedaços (Range) para o vídeo tocar no iPhone.
export async function onRequestGet({ params, env, request }) {
  const token = String(params.token || ''), id = String(params.id || '');
  const rec = await loadShare(env, token);
  if (!rec) return gone();
  const it = rec.items.find(x => x.id === id);
  if (!it) return new Response('Não encontrado', { status: 404, headers: SEC });
  const { value, metadata } = await env.MEDIA.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!value) return new Response('Não encontrado', { status: 404, headers: SEC });
  const type = metadata?.type || it.type || 'application/octet-stream';
  const size = value.byteLength;
  // QA 8 (C-11/P-06): só foto e vídeo; nada que rode script na origem pública
  if (!/^(image\/(jpeg|png|webp|gif|heic|heif)|video\/[a-z0-9.+-]+)$/i.test(type)) return new Response('Não encontrado', { status: 404, headers: SEC });
  const base = { ...SEC, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start, end;
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    return new Response(value.slice(start, end + 1), { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(value, { headers: { ...base, 'Content-Length': String(size) } });
}

// QA 8 (P-05): HEAD responde como o GET (410 para link vencido), em vez de cair na página estática
export const onRequestHead = onRequestGet;
