export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: "Username dan Password wajib diisi" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' } // Tambahan header
      });
    }

    // Enkripsi Password
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Generate ID User Unik
    const userId = crypto.randomUUID();

    // Cek apakah username sudah ada
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, message: "Username sudah dipakai!" }), { 
        status: 409,
        headers: { 'Content-Type': 'application/json' } // Tambahan header
      });
    }

    // Masukkan ke database
    await env.DB.prepare("INSERT INTO users (id, username, password) VALUES (?, ?, ?)").bind(userId, username, hashedPassword).run();

    return new Response(JSON.stringify({ success: true, userId, username }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error("Register Error:", error);
    return new Response(JSON.stringify({ success: false, message: "Terjadi kesalahan server" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } // Tambahan header
    });
  }
}
