// Site público de leitura: só GET/HEAD em /m/<token>…; o resto é recusado.
export async function onRequest(ctx) {
  const m = ctx.request.method;
  if (m !== 'GET' && m !== 'HEAD') return new Response('Método não permitido', { status: 405 });
  return ctx.next();
}
