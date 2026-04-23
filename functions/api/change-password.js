export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { userId, oldPassword, newPassword } = await request.json();
    
    if (!userId || !oldPassword || !newPassword) {
        return new Response(JSON.stringify({ success: false, message: "Semua kolom wajib diisi!" }), { status: 400 });
    }

    // Fungsi Pembantu untuk Enkripsi Password (SHA-256) agar sama dengan Login/Register
    const hashPassword = async (pwd) => {
        const msgUint8 = new TextEncoder().encode(pwd);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // 1. Hash Password Lama dan Cek kecocokannya di Database
    const hashedOld = await hashPassword(oldPassword);
    const user = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND password = ?").bind(userId, hashedOld).first();
    
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Password lama salah!" }), { status: 401 });
    }

    // 2. Jika cocok, Hash Password Baru dan Update Database
    const hashedNew = await hashPassword(newPassword);
    await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hashedNew, userId).run();

    return new Response(JSON.stringify({ success: true, message: "Password berhasil diubah" }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Terjadi kesalahan server" }), { status: 500 });
  }
}
