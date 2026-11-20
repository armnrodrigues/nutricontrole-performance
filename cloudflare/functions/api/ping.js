export async function onRequestGet({ data, env }) {
  return Response.json({ ok: true, email: data.user?.email || '', ai: !!env.ANTHROPIC_API_KEY });
}
