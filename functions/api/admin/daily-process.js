// functions/api/admin/daily-process.js
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { pw } = body;

    // Password Admin untuk keamanan
    const HARDCODED_PASSWORD = "KopiHitamKupuKupu";
    if (pw !== HARDCODED_PASSWORD) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
    }

    // =======================================================
    // BAGIAN 1: CARI DAN HAPUS SEMUA VIDEO YANG GAGAL TARGET
    // =======================================================
    const queryFailed = `
      SELECT id FROM videos 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views < 100
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

      for (const row of failedVideos.results) {
        // Hapus dari R2 dan D1
        try {
          await S3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: row.id }));
        } catch (e) { console.error(`R2 Delete Error for ${row.id}:`, e); }
        await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(row.id).run();
        deletedCount++;
      }
    }

    // =======================================================
    // BAGIAN 2: CARI DAN RESET SEMUA VIDEO YANG LULUS TARGET
    // =======================================================
    const querySuccess = `
      UPDATE videos 
      SET period_views = 0, last_reset_at = CURRENT_TIMESTAMP 
      WHERE last_reset_at <= datetime('now', '-30 days') 
      AND period_views >= 100
    `;
    const resetResult = await env.DB.prepare(querySuccess).run();
    const resetCount = resetResult.changes; // D1 akan memberitahu berapa baris yang di-update

    // =======================================================
    // BAGIAN 3: KIRIM LAPORAN HASILNYA
    // =======================================================
    if (deletedCount === 0 && resetCount === 0) {
        return new Response(JSON.stringify({
            success: true,
            message: "Aman Bang! Tidak ada file yang mencapai batas waktu 30 hari untuk diproses hari ini."
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Proses Harian Selesai!\n\n- Dihapus: ${deletedCount} file (gagal target).\n- Direset: ${resetCount} file (lulus target).`,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }
}
