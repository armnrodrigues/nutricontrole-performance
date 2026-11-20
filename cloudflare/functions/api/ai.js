// POST /api/ai  { messages:[{role,content}], images:[{type,data(base64)}], tier, json }
// Chama a API da Anthropic com a chave guardada como segredo (ANTHROPIC_API_KEY).
// A chave nunca chega ao navegador.

const MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
const JSON_RULE = 'Responda somente com JSON válido, sem texto antes ou depois e sem cercas de código.';

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return Response.json({ code: 'sampling_disabled', message: 'A chave da IA ainda não foi cadastrada no Cloudflare.' }, { status: 503 });
  let b;
  try { b = await request.json(); } catch (e) { return Response.json({ code: 'invalid_argument', message: 'Pedido inválido' }, { status: 400 }); }
  const msgs = (b.messages || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'text', text: String(m.content || '') }] }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return Response.json({ code: 'invalid_argument', message: 'A conversa precisa terminar com o usuário' }, { status: 400 });
  const imgs = (b.images || []).slice(0, 20).filter(i => /^image\/(jpeg|png|webp|gif)$/.test(i.type) && i.data);
  const last = msgs[msgs.length - 1];
  last.content = imgs.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })).concat(last.content);
  const tier = MODELS[b.tier] ? b.tier : 'default';
  const model = env['MODEL_' + tier.toUpperCase()] || MODELS[tier];
  const body = { model, max_tokens: tier === 'quick' ? 8000 : 16000, messages: msgs };
  if (b.json) body.system = JSON_RULE;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = out?.error?.message || ('HTTP ' + r.status);
    const code = r.status === 401 || r.status === 403 ? 'sampling_disabled'
      : r.status === 429 || r.status === 529 ? 'rate_limited'
      : /image/i.test(msg) ? 'image_rejected'
      : /too long|too large|context/i.test(msg) ? 'prompt_too_large'
      : 'ai_error';
    return Response.json({ code, message: msg }, { status: r.status === 529 ? 503 : r.status });
  }
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return Response.json({ text, truncated: out.stop_reason === 'max_tokens', model: out.model, usage: out.usage });
}
