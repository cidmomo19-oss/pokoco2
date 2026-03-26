import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export default {
  async scheduled(event, env, ctx) {
    console.log("Running video cleanup job at", new Date());

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

    // Hitung tanggal 30 hari yang lalu
    const thirtyDaysAgo = new Date(Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    try {
      // 1. Cari video yang memenuhi kriteria penghapusan dari D1
      // Kriteria:
      // - (created_at lebih dari 30 hari yang lalu OR last_viewed_at lebih dari 30 hari yang lalu)
      //   (Ini memastikan video baru yang tidak populer bisa dihapus, dan video lama yang tidak dilihat lagi juga dihapus)
      // - DAN jumlah views-nya kurang dari MIN_VIEWS (30 views)
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
          console.log(`Deleted video ${video.id} from R2.`);
        } catch (r2Error) {
          console.error(`Failed to delete video ${video.id} from R2:`, r2Error);
          // Lanjutkan ke video berikutnya meskipun ada error saat menghapus di R2
          // (mungkin file sudah tidak ada, atau ada masalah permissions)
        }
      }

      // 3. Hapus entri video dari D1 Database
      // Ini dilakukan setelah mencoba menghapus dari R2
      const idsToDelete = videosToDelete.map(v => v.id);
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(','); // Untuk membuat query DELETE IN (...)
        await env.DB.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).bind(...idsToDelete).run();
        console.log(`Deleted ${idsToDelete.length} video entries from D1.`);
      }

    } catch (error) {
      console.error("Error during video cleanup job:", error);
    }
  }
};
