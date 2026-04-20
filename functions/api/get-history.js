export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId || userId === "anonymous") {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
  }

  try {
    // Tarik history dari D1, urutkan dari yang paling baru
    const { results } = await env.DB.prepare(
      "SELECT id, file_name as name, content_type as type, DATE(created_at) as date FROM videos WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(userId).all();

    return new Response(JSON.stringify({ success: true, history: results }), {
        headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Error fetching history" }), { status: 500 });
  }
}
