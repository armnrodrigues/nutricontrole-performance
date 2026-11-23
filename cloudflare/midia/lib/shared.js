export const TOK = /^[A-Za-z0-9_-]{32}$/;
export const SEC = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};
export async function loadShare(env, token) {
  if (!TOK.test(token)) return null;
  const raw = await env.MEDIA.get('share:' + token);
  if (!raw) return null;
  let rec; try { rec = JSON.parse(raw); } catch (e) { return null; }
  if (!rec || !rec.exp || rec.exp <= Date.now() || !Array.isArray(rec.items)) return null;
  return rec;
}
export function gone() {
  return new Response('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Link expirado</title><style>body{font:16px -apple-system,system-ui,sans-serif;margin:0;padding:48px 20px;color:#111;background:#fff;text-align:center}p{color:#555}</style></head><body><h1 style="font-size:20px">Este link expirou ou foi cancelado</h1><p>As fotos e os vídeos ficam disponíveis por 2 dias. Peça um relatório novo a quem enviou.</p></body></html>',
    { status: 410, headers: { ...SEC, 'Content-Type': 'text/html; charset=utf-8' } });
}
