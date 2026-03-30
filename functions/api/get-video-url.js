import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  // Tambahkan waitUntil dari context untuk proses background caching
  const { request, env, waitUntil } = context; 
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
  }

  // ==========================================
  // 1. CEK CACHE TERLEBIH DAHULU
  // ==========================================
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  let response = await cache.match(cacheKey);

  if (response) {
    // Jika sudah ada di cache (dari orang pertama), langsung kembalikan!
    // Tidak akan hit database D1 atau R2 S3 sama sekali.
    return response;
  }

  // ==========================================
  // 2. JIKA CACHE KOSONG, PROSES SEPERTI BIASA
  // ==========================================
  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      throw new Error("File not found in database or has been deleted.");
    }

    // UPDATE DATABASE (Hanya berjalan oleh orang pertama yang nge-hit)
    await env.DB.prepare(
      "UPDATE videos SET views = views + 1, period_views = period_views + 1, last_viewed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(videoId).run();

    // Buat Pre-signed URL R2 dengan expiresIn 24 JAM (86400 detik)
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 86400 }); 

    // Buat response API
    response = new Response(JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: videoData.content_type,
      adLink: videoData.ad_link 
    }), { 
      headers: { 
        'Content-Type': 'application/json',
        // Set Header Cache-Control agar disimpan selama 24 jam (86400 detik)
        'Cache-Control': 'public, max-age=86400' 
      } 
    });

    // Simpan response ke dalam cache untuk pengunjung selanjutnya
    // Gunakan response.clone() karena response body hanya bisa dibaca sekali
    waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    console.error(`Error fetching URL for video ID ${videoId}:`, error);
    return new Response(
      JSON.stringify({ success: false, message: "File not found or an error occurred." }), 
      { status: error.message.includes("not found") || error.message.includes("deleted") ? 404 : 500 }
    );
  }
}
