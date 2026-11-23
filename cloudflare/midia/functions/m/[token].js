import { SEC, loadShare, gone } from '../../lib/shared.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (t) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ',');
const dBR = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';

export async function onRequestGet({ params, env }) {
  const token = String(params.token || '');
  const rec = await loadShare(env, token);
  if (!rec) return gone();
  const per = rec.de && rec.ate ? `Período ${dBR(rec.de)} a ${dBR(rec.ate)} · ` : '';
  const items = rec.items.map((it, i) => {
    const src = `/m/${token}/${it.id}`;
    const media = /^video\//.test(it.type)
      ? `<video controls playsinline preload="metadata" src="${src}"></video>`
      : `<a href="${src}"><img loading="lazy" alt="${esc(it.label || 'Foto')}" src="${src}"></a>`;
    return `<figure>${media}<figcaption>${esc(it.label || (/^video\//.test(it.type) ? 'Vídeo' : 'Foto') + ' ' + (i + 1))}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${esc(rec.title)}</title>
<style>
:root{--ink:#111;--muted:#555;--line:#ddd;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#eee;--muted:#aaa;--line:#333;--bg:#111}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;padding:24px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left))}
main{max-width:960px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
figure{margin:0;border-top:1px solid var(--line);padding-top:10px}img,video{display:block;width:100%;max-height:70vh;object-fit:contain;background:#000;border-radius:4px}
figcaption{font-size:14px;margin-top:6px}
</style></head><body><main><h1>${esc(rec.title)}</h1><p class="sub">${per}${rec.items.length} ${rec.items.length === 1 ? 'arquivo' : 'arquivos'} · disponível até ${br(rec.exp)} (horário de Brasília)</p><div class="grid">${items}</div></main></body></html>`;
  return new Response(html, { headers: { ...SEC, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" } });
}

// QA 8 (P-05): HEAD responde como o GET
export const onRequestHead = onRequestGet;
