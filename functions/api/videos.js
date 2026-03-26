export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const password = url.searchParams.get("pw");

  // Mengambil password dari Environment Variables Cloudflare. 
  // Jika belum diset di Cloudflare, defaultnya "admin123"
  const expectedPassword = env.ADMIN_PASSWORD || "admin123";

  if (password !== expectedPassword) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    // Ambil semua video, urutkan berdasarkan views terbanyak (DESC)
    const { results } = await env.DB.prepare(
      "SELECT id, views, content_type, created_at, ad_link FROM videos ORDER BY views DESC"
    ).all();

    return new Response(JSON.stringify({ success: true, videos: results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
