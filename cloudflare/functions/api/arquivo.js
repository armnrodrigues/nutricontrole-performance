// Entrega de arquivo gerado no aparelho (PDF do relatório, backup, CSV) quando o navegador não entrega direto.
// POST /api/arquivo?nome=<nome.ext>  (corpo = o arquivo)  -> {token, url, expiresAt}
// O arquivo fica 15 minutos no depósito, atrás do login do site, e abre em /api/arquivo/<token>/<nome>.
const TTL = 15 * 60, MAX = 20 * 1024 * 1024;
const TYPES = { pdf: 'application/pdf', csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8' };
export async function onRequestPost({ request, env }) {
  const nome = (new URL(request.url).searchParams.get('nome') || '').slice(0, 120);
  const m = /^[A-Za-z0-9._-]+\.(pdf|csv|json|txt)$/.exec(nome);
  if (!m) return Response.json({ code: 'invalid_argument', message: 'Nome de arquivo não aceito' }, { status: 400 });
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return Response.json({ code: 'invalid_argument', message: 'Arquivo vazio' }, { status: 400 });
  if (buf.byteLength > MAX) return Response.json({ code: 'too_large', message: 'O limite é 20 MB por arquivo' }, { status: 413 });
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const exp = Date.now() + TTL * 1000;
  await env.MEDIA.put('tmp:' + token, buf, { expirationTtl: TTL, metadata: { type: TYPES[m[1]], name: nome, exp } });
  return Response.json({ token, url: '/api/arquivo/' + token + '/' + nome, expiresAt: exp });
}
