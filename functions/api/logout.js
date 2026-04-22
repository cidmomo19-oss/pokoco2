export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { username, password } = await request.json();
    if (!username || !password) return new Response(JSON.stringify({ success: false, message: "Username dan Password wajib diisi" }), { status: 400 });

    // Enkripsi input password untuk dicocokkan
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Cek database
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE username = ? AND password = ?").bind(username, hashedPassword).first();
    
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Username atau Password salah!" }), { status: 401 });
    }

    return new Response(JSON.stringify({ success: true, userId: user.id, username: user.username }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Terjadi kesalahan server" }), { status: 500 });
  }
}
