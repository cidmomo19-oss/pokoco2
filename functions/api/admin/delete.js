// functions/api/admin/delete.js
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { id, pw } = body;

    // =========================================================
    // PASTIKAN PASSWORD INI SAMA DENGAN YANG DI videos.js
    // =========================================================
    const HARDCODED_PASSWORD = "KopiHitamKupuKupu";

    if (pw !== HARDCODED_PASSWORD) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
    }

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: "ID is required" }), { status: 400 });
    }

    // 1. HAPUS DARI DATABASE D1
    await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();

    // 2. HAPUS FILE FISIK DARI R2 BUCKET
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const deleteCommand = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: id,
    });

    try {
      await S3.send(deleteCommand);
    } catch (r2Error) {
      // Kita log aja kalau gagal di R2 (misal filenya udah keburu abang hapus manual duluan)
      // Yang penting data di D1 udah bersih
      console.error("Gagal hapus di R2 (Mungkin file sudah tidak ada):", r2Error);
    }

    return new Response(JSON.stringify({ success: true, message: "Video dan Data berhasil dihapus permanen!" }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }
}
