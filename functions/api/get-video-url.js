import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
  }

  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_key_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    // 1. Ambil data dari D1 (termasuk content_type dan ad_link)
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      // Jika video tidak ditemukan di DB, mungkin sudah dihapus oleh worker cleanup
      throw new Error("File not found in database or has been deleted.");
    }

    // 2. Update View Count DAN Last Viewed Timestamp di D1
    // Ini krusial untuk logika retensi video 30 hari
    await env.DB.prepare(
      "UPDATE videos SET views = views + 1, last_viewed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(videoId).run();

    // 3. Buat Pre-signed URL R2 dengan expiresIn (3 jam = 10800 detik)
    // URL ini bersifat sementara, tetapi frontend akan otomatis meminta URL baru
    // jika yang ini kadaluarsa, sehingga video tetap dapat ditonton.
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 10800 }); // 3 jam

    return new Response(JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: videoData.content_type,
      adLink: videoData.ad_link // Kirim link iklan ke frontend
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(`Error fetching URL for video ID ${videoId}:`, error);
    // Mengembalikan 404 jika tidak ditemukan atau sudah dihapus, 500 untuk error lainnya
    return new Response(JSON.stringify({ success: false, message: "File not found or an error occurred." }), { status: error.message.includes("not found") || error.message.includes("deleted") ? 404 : 500 });
  }
}
