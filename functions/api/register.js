export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, password } = await request.json();

  if (!email || !password) return new Response("Missing data", { status: 400 });

  try {
    // Simpan user ke D1
    await env.DB.prepare("INSERT INTO users (email, password) VALUES (?, ?)")
      .bind(email, password)
      .run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "Email already exists" }), { status: 400 });
  }
}
