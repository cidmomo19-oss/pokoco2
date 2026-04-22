export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ success: false, message: "Missing userId" }), { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, file_name, content_type, views FROM videos WHERE user_id = ? ORDER BY id DESC"
    ).bind(userId).all();

    return new Response(JSON.stringify({ success: true, files: results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Database error" }), { status: 500 });
  }
}
