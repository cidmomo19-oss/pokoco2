export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { username, password } = await request.json();

    if (!username || !password || username.length < 3 || password.length < 4) {
      return new Response(JSON.stringify({ success: false, message: "Username/Password too short!" }), { status: 400 });
    }

    // Cek apakah username sudah ada
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, message: "Username already exists!" }), { status: 409 });
    }

    // Hash Password menggunakan WebCrypto (SHA-256) agar aman
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Bikin UUID unik untuk User ID
    const userId = crypto.randomUUID();

    // Simpan ke Database
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
    ).bind(userId, username, passwordHash).run();

    return new Response(JSON.stringify({ success: true, userId, username }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Server Error" }), { status: 500 });
  }
}
