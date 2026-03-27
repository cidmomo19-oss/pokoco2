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
    // =====================================================================
    // [PERBAIKAN PALING STABIL] HITUNG BATAS WAKTU 30 HARI DI SINI SEKALI
    // =====================================================================
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - 30);
    // Ubah ke format 'YYYY-MM-DD HH:MM:SS' yang 100% kompatibel dengan D1
    const thirtyDaysAgoISO = dateCutoff.toISOString().replace('T', ' ').substring(0, 19);


    // ==========================================
    // 1. CARI VIDEO YANG GAGAL TARGET (< 100 view)
    // ==========================================
    const queryFailed = `
      SELECT id FROM videos 
      WHERE IFNULL(last_reset_at, created_at) <= ? 
      AND IFNULL(period_views, 0) < 100
    `;
    const failedVideos = await env.DB.prepare(queryFailed).bind(thirtyDaysAgoISO).all();

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

      const idsToDelete = failedVideos.results.map(row => row.id);

      // A. Hapus file fisik dari R2
      for (const id of idsToDelete) {
        try {
          await S3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: id }));
          deletedCount++;
        } catch (e) { 
          console.error(`R2 Delete Error untuk ID ${id}:`, e);
        }
      }

      // B. Hapus ID dari Database D1 menggunakan BATCH (Anti Nyangkut)
      if (idsToDelete.length > 0) {
        const deleteStatements = idsToDelete.map(id => 
          env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id)
        );
        await env.DB.batch(deleteStatements);
      }
    }

    // ==========================================
    // 2. RESET VIDEO YANG LULUS TARGET (>= 100 view)
    // ==========================================
    const querySuccess = `
      UPDATE videos 
      SET period_views = 0, last_reset_at = CURRENT_TIMESTAMP 
      WHERE IFNULL(last_reset_at, created_at) <= ? 
      AND IFNULL(period_views, 0) >= 100
    `;
    await env.DB.prepare(querySuccess).bind(thirtyDaysAgoISO).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Proses Selesai! Berhasil menghapus ${deletedCount} file dari R2 dan Database. Dan mereset timer file yang lulus target.`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Cleanup Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
