// functions/api/admin/cleanup.js
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  const CRON_SECRET = "RahasiaSapuBersih123";

  if (secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
  }

  try {
    // ==========================================
    // 1. CARI VIDEO YANG GAGAL TARGET (< 100 view)
    // Pake IFNULL biar file baru yg datanya kosong tetep kehitung dari tanggal upload
    // ==========================================
    const queryFailed = `
      SELECT id FROM videos 
      WHERE IFNULL(last_reset_at, created_at) <= datetime('now', '-30 days') 
      AND IFNULL(period_views, 0) < 100
    `;
    const failedVideos = await env.DB.prepare(queryFailed).all();

    let deletedCount = 0;
    
    if (failedVideos.results && failedVideos.results.length > 0) {
      const S3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const idsToDelete = [];

      // A. Hapus file fisiknya dari R2
      for (const row of failedVideos.results) {
        try {
          await S3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: row.id }));
          idsToDelete.push(row.id); // Simpan ID yang berhasil dihapus
          deletedCount++;
        } catch (e) { 
          console.error("R2 Delete Error:", e); 
          idsToDelete.push(row.id); // Tetap simpan ID biar ampasnya di D1 ikut terhapus
        }
      }

      // B. Hapus ID dari Database D1 menggunakan BATCH (Anti Nyangkut)
      if (idsToDelete.length > 0) {
        // Kumpulkan semua perintah hapus
        const deleteStatements = idsToDelete.map(id => 
          env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id)
        );
        // Tembak hapus sekalian bareng-bareng!
        await env.DB.batch(deleteStatements);
      }
    }

    // ==========================================
    // 2. RESET VIDEO YANG LULUS TARGET (>= 100 view)
    // ==========================================
    const querySuccess = `
      UPDATE videos 
      SET period_views = 0, last_reset_at = CURRENT_TIMESTAMP 
      WHERE IFNULL(last_reset_at, created_at) <= datetime('now', '-30 days') 
      AND IFNULL(period_views, 0) >= 100
    `;
    await env.DB.prepare(querySuccess).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Proses Selesai! Menghapus ${deletedCount} file gagal dari R2 dan Database. Dan mereset nyawa file yang lulus target.`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
