import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
  }

  // ==========================================
  // SISTEM CACHE CLOUDFLARE
  // ==========================================
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  
  // Cek apakah data API ini sudah ada di memori Cache Edge Cloudflare
  let response = await cache.match(cacheKey);
  if (response) {
    return response; // Langsung kirim dari cache, tidak hit Database D1 / R2 sama sekali
  }

  // Jika belum ada di cache, buat baru
  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    // 1. Ambil data dari D1 (Hanya jalan 1x setiap 6 hari per video)
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      throw new Error("File not found in database or has been deleted.");
    }

    // (UPDATE VIEW DIHAPUS DARI SINI SESUAI PERMINTAAN)

    // 2. Buat Pre-signed URL R2 maksimal 7 Hari (604800 detik)
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 604800 }); 

    // 3. Susun Response Data
    const responseData = JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: videoData.content_type,
      adLink: videoData.ad_link 
    });

    // 4. Bikin Response dengan Header Cache
    response = new Response(responseData, { 
      headers: { 
        'Content-Type': 'application/json',
        // Simpan di cache Browser dan Edge Cloudflare selama 6 Hari (518400 detik)
        'Cache-Control': 'public, max-age=518400, s-maxage=518400' 
      } 
    });

    // 5. Simpan ke Cache Cloudflare di latar belakang
    waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    console.error(`Error fetching URL for video ID ${videoId}:`, error);
    return new Response(JSON.stringify({ success: false, message: "File not found or an error occurred." }), { 
      status: error.message.includes("not found") || error.message.includes("deleted") ? 404 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
