// functions/api/cleanup.js
// Ini adalah Pages Function yang akan dipicu oleh layanan cron eksternal via HTTP request.

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestGet(context) { // Kita pakai onRequestGet untuk memudahkan pemicuan dari cron eksternal
  const { request, env, waitUntil } = context; // Tambah waitUntil untuk background task

  // --- KEAMANAN: Verifikasi API Key ---
  // Ini SANGAT PENTING agar tidak sembarang orang bisa memicu cleanup
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("key");

  if (apiKey !== env.CLEANUP_API_KEY) { // env.CLEANUP_API_KEY akan diatur di Pages Secrets
    return new Response(JSON.stringify({ success: false, message: "Unauthorized: Invalid API Key." }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  // --- Akhir Verifikasi API Key ---

  console.log("Running video cleanup job (triggered by HTTP) at", new Date().toISOString());

  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const THRESHOLD_DAYS = 30; // Video dianggap "lama" jika created_at atau last_viewed_at sudah lewat 30 hari
  const MIN_VIEWS = 30;     // Minimum views yang dibutuhkan agar video tidak dihapus

  const thirtyDaysAgo = new Date(Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Memakai waitUntil agar Cloudflare tidak menutup koneksi
  // sebelum semua operasi S3 dan D1 selesai, meskipun respon sudah dikirim.
  waitUntil(async () => {
    try {
      // 1. Cari video yang memenuhi kriteria penghapusan dari D1
      const { results: videosToDelete } = await env.DB.prepare(
        `SELECT id FROM videos
         WHERE (created_at < ? OR last_viewed_at < ?)
           AND views < ?`
      ).bind(thirtyDaysAgo, thirtyDaysAgo, MIN_VIEWS).all();

      if (videosToDelete.length === 0) {
        console.log("No videos found to delete.");
        return;
      }

      console.log(`Found ${videosToDelete.length} videos to delete.`);

      // 2. Hapus video dari R2 Bucket
      for (const video of videosToDelete) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: video.id,
          });
          await S3.send(deleteCommand);
          console.log(`Deleted video ${video.id} from R2: ${video.id}`);
        } catch (r2Error) {
          console.error(`Failed to delete video ${video.id} from R2:`, r2Error);
        }
      }

      // 3. Hapus entri video dari D1 Database
      const idsToDelete = videosToDelete.map(v => v.id);
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        await env.DB.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).bind(...idsToDelete).run();
        console.log(`Deleted ${idsToDelete.length} video entries from D1.`);
      }

    } catch (error) {
      console.error("Error during HTTP-triggered cleanup job:", error);
    }
  });

  // Beri respons cepat ke pemicu cron eksternal bahwa job sudah diterima dan sedang diproses
  return new Response(JSON.stringify({ success: true, message: "Cleanup job initiated." }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
