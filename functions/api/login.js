export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: "Missing credentials" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash Password inputan untuk dicocokkan dengan DB
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // PERBAIKAN: Ubah password_hash menjadi password agar sesuai dengan D1 saat registrasi
    const user = await env.DB.prepare("SELECT id, username FROM users WHERE username = ? AND password = ?")
                             .bind(username, passwordHash)
                             .first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Invalid username or password" }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Jika sukses, kembalikan data user
    return new Response(JSON.stringify({ success: true, userId: user.id, username: user.username }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Login Error:", error); 
    return new Response(JSON.stringify({ success: false, message: "Server Error", details: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
