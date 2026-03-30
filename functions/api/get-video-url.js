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
  // 1. CEK CACHE TERLEBIH DAHULU
  // ==========================================
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  let response = await cache.match(cacheKey);

  if (response) {
    // Jika ada di cache, langsung kirim (Sangat Cepat & Hemat Database)
    return response;
  }

  // ==========================================
  // 2. JIKA CACHE KOSONG, AMBIL DATA
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
    // Ambil data content_type dan ad_link
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      throw new Error("File not found in database or has been deleted.");
    }

    // --- BAGIAN UPDATE VIEW SUDAH DIHAPUS DARI SINI ---
    // (Karena sudah dipindah ke /api/track-view agar lebih akurat)

    // Buat Pre-signed URL R2 berlaku 24 JAM (86400 detik)
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
        // Cache hasil ini di Edge Cloudflare selama 24 jam
        'Cache-Control': 'public, max-age=86400' 
      } 
    });

    // Simpan ke cache untuk user berikutnya
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
