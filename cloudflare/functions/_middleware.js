// Só deixa passar quem entrou pelo Cloudflare Access.
// O Access já bloqueia o site inteiro; esta checagem garante que as rotas de dados
// (/api e /_blob) também recusem acessos por endereços de prévia ou sem login.
// Sem ACCESS_AUD configurado, as rotas de dados ficam fechadas.

let CERTS = null, CERTS_AT = 0;

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function verifyAccess(request, env) {
  // atalho de teste: só vale em endereço local, nunca no site publicado
  if (env.DEV_BYPASS === '1' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(request.url).hostname)) return { email: 'dev@local' };
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;
  const [h, p, sig] = token.split('.');
  if (!sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD) || payload.exp < now) return null;
  if (payload.iss !== 'https://' + env.ACCESS_TEAM_DOMAIN) return null;
  if (!CERTS || Date.now() - CERTS_AT > 3600e3) {
    const r = await fetch('https://' + env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');
    CERTS = (await r.json()).keys || []; CERTS_AT = Date.now();
  }
  let jwk = (CERTS || []).find(k => k.kid === header.kid);
  // a Cloudflare trocou a chave do Access: recarrega os certificados (no máximo uma vez por minuto) em vez de recusar por até 1 h
  if (!jwk && Date.now() - CERTS_AT > 60e3) {
    const r = await fetch('https://' + env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');
    CERTS = (await r.json()).keys || []; CERTS_AT = Date.now();
    jwk = CERTS.find(k => k.kid === header.kid);
  }
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(h + '.' + p));
  return ok ? { email: payload.email || '' } : null;
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  // Gravações e IA só aceitam pedidos feitos pelas páginas deste site (outro site não consegue gastar a chave da IA nem gravar).
  // Navegadores sempre mandam Origin em POST/PUT/DELETE; ferramentas sem Origin continuam passando pela checagem do Access.
  if (url.pathname.startsWith('/api/') && ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    const o = ctx.request.headers.get('Origin');
    let same = true; if (o) { try { same = new URL(o).host === url.host; } catch (e) { same = false; } }
    if (!same) return Response.json({ code: 'not_granted', message: 'Origem recusada' }, { status: 403 });
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_blob/')) {
    let who = null;
    try { who = await verifyAccess(ctx.request, ctx.env); } catch (e) { who = null; }
    if (!who) return Response.json({ code: 'not_granted', message: 'Entre pelo login do site para acessar os dados.' }, { status: 401 });
    ctx.data.user = who;
  }
  const res = await ctx.next();
  if (url.pathname.startsWith('/api/')) {
    const r = new Response(res.body, res);
    r.headers.set('Cache-Control', 'no-store');
    return r;
  }
  return res;
}
