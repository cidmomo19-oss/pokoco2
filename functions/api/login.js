export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: "Missing credentials" }), { status: 400 });
    }

    // Hash Password inputan untuk dicocokkan dengan DB
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Cari user di DB
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE username = ? AND password_hash = ?").bind(username, passwordHash).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Invalid username or password" }), { status: 401 });
    }

    // Jika sukses, kembalikan data user
    return new Response(JSON.stringify({ success: true, userId: user.id, username: user.username }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Server Error" }), { status: 500 });
  }
}
