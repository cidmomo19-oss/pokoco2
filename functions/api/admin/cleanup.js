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
    // KONDISI 1: CARI VIDEO YANG GAGAL TARGET (< 100 view dalam 30 hari)
    const queryFailed = `
      SELECT id FROM videos 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views < 100
    `;
    const failedVideos = await env.DB.prepare(queryFailed).all();

    let deletedCount = 0;
    
    // Jika ada video yang gagal target, hapus dari R2 dan D1
    if (failedVideos.results && failedVideos.results.length > 0) {
      const S3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      for (const row of failedVideos.results) {
        // Hapus file fisik di R2
        try {
          await S3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: row.id }));
        } catch (e) { console.error("R2 Delete Error:", e); }

        // Hapus dari D1
        await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(row.id).run();
        deletedCount++;
      }
    }

    // KONDISI 2: CARI VIDEO YANG LULUS TARGET (>= 100 view)
    // Beri "nyawa" 30 hari lagi dan reset view bulanannya jadi 0
    const querySuccess = `
      UPDATE videos 
      SET period_views = 0, last_reset_at = CURRENT_TIMESTAMP 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views >= 100
    `;
    const updatedVideos = await env.DB.prepare(querySuccess).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Proses Selesai! Menghapus ${deletedCount} video gagal. Dan mereset ulang siklus video yang lulus target.`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
