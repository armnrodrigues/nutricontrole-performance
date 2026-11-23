// Links de fotos e vídeos de um relatório (só o dono, atrás do login do site).
// POST   /api/share              {title, de, ate, items:[{id,label}]} -> {token, url, expiresAt}
// GET    /api/share              -> {links:[{token,url,title,expiresAt,n}]} (só os ativos)
// DELETE /api/share?token=<t>    -> cancela o link na hora
// O link vale 2 dias e mostra só as mídias listadas nele, no endereço público SHARE_HOST.

const TTL = 2 * 24 * 3600; // 2 dias, em segundos
const TOK = /^[A-Za-z0-9_-]{32}$/;
const ID = /^[0-9a-f]{32}$/;
const host = env => env.SHARE_HOST || 'nutricontrole-midia.pages.dev';
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n);

export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch (e) { body = null; }
  const raw = Array.isArray(body?.items) ? body.items : [];
  const seen = new Set(), items = [];
  for (const it of raw) {
    const id = String(it?.id || '').replace(/^\/_blob\//, '');
    if (!ID.test(id) || seen.has(id)) continue;
    const meta = await env.MEDIA.getWithMetadata(id, { type: 'stream' });
    if (!meta.value) continue;
    try { await meta.value.cancel(); } catch (e) {}
    const type = meta.metadata?.type || '';
    if (!/^(image|video)\//.test(type)) continue;
    seen.add(id); items.push({ id, type, label: clean(it.label, 120) });
    if (items.length >= 200) break;
  }
  if (!items.length) return Response.json({ code: 'invalid_argument', message: 'Nenhuma foto ou vídeo encontrado neste relatório.' }, { status: 400 });
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Date.now() + TTL * 1000;
  const title = clean(body?.title, 120) || 'Fotos e vídeos do relatório';
  const rec = { v: 1, title, de: clean(body?.de, 10), ate: clean(body?.ate, 10), exp, items };
  await env.MEDIA.put('share:' + token, JSON.stringify(rec), { expirationTtl: TTL, metadata: { exp, title, n: items.length, de: rec.de, ate: rec.ate } });
  return Response.json({ token, url: 'https://' + host(env) + '/m/' + token, expiresAt: exp, n: items.length });
}

export async function onRequestGet({ env }) {
  const links = []; let cursor;
  do {
    const r = await env.MEDIA.list({ prefix: 'share:', cursor });
    for (const k of r.keys) {
      const m = k.metadata || {};
      if (!m.exp || m.exp <= Date.now()) continue;
      const token = k.name.slice(6);
      links.push({ token, url: 'https://' + host(env) + '/m/' + token, title: m.title || '', de: m.de || '', ate: m.ate || '', expiresAt: m.exp, n: m.n || 0 });
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  links.sort((a, b) => b.expiresAt - a.expiresAt);
  return Response.json({ links });
}

export async function onRequestDelete({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!TOK.test(token)) return Response.json({ code: 'invalid_argument' }, { status: 400 });
  await env.MEDIA.delete('share:' + token);
  return Response.json({ ok: true });
}
