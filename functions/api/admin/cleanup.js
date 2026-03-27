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
    // 1. CARI VIDEO YANG GAGAL TARGET
    // ==========================================
    const queryFailed = `
      SELECT id FROM videos 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views < 100
    `;
    const failedVideos = await env.DB.prepare(queryFailed).all();

    let deletedCount = 0;
    
    // Jika ada video yang gagal target
    if (failedVideos.results && failedVideos.results.length > 0) {
      const S3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      // A. Hapus file fisiknya dari R2
      for (const row of failedVideos.results) {
        try {
          await S3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: row.id }));
        } catch (e) { 
          console.error("R2 Delete Error:", e); 
        }
        deletedCount++;
      }

      // B. [PERBAIKAN] Hapus permanen ID-nya dari Database D1 (Sekali tebas)
      const deleteQuery = `
        DELETE FROM videos 
        WHERE last_reset_at <= datetime('now', '-30 days') 
        AND period_views < 100
      `;
      await env.DB.prepare(deleteQuery).run();
    }

    // ==========================================
    // 2. RESET VIDEO YANG LULUS TARGET
    // ==========================================
    const querySuccess = `
      UPDATE videos 
      SET period_views = 0, last_reset_at = CURRENT_TIMESTAMP 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views >= 100
    `;
    await env.DB.prepare(querySuccess).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Proses Selesai! Menghapus ${deletedCount} file & ID data yang gagal. Serta mereset timer yang lulus.`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
