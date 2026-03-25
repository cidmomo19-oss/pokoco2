export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, password } = await request.json();

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? AND password = ?")
    .bind(email, password)
    .first();

  if (user) {
    // Set Cookie sederhana (Nama: pokoco_session, Isi: user_id)
    return new Response(JSON.stringify({ success: true, user: { email: user.email } }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `pokoco_user_id=${user.id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
      }
    });
  } else {
    return new Response(JSON.stringify({ success: false, message: "Wrong email or password" }), { status: 401 });
  }
}
