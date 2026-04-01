import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");
  const pwd = url.searchParams.get("pwd") || null; // Ambil password dari URL jika penonton masukin

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
  }

  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  
  let response = await cache.match(cacheKey);
  if (response) {
    return response; 
  }

  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    // Ambil data video, termasuk password
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link, password FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      throw new Error("File not found in database or has been deleted.");
    }

    // --- LOGIKA PASSWORD ---
    if (videoData.password) {
      if (!pwd) {
        // Minta password (JANGAN DI-CACHE)
        return new Response(JSON.stringify({ success: true, requiresPassword: true }), { 
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } 
        });
      } else if (pwd !== videoData.password) {
        // Salah password (JANGAN DI-CACHE)
        return new Response(JSON.stringify({ success: false, message: "Incorrect password." }), { 
          status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } 
        });
      }
    }
    // -----------------------

    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 604800 }); 

    const responseData = JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: videoData.content_type,
      adLink: videoData.ad_link 
    });

    response = new Response(responseData, { 
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=518400, s-maxage=518400' 
      } 
    });

    waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    console.error(`Error fetching URL for video ID ${videoId}:`, error);
    return new Response(JSON.stringify({ success: false, message: "File not found or an error occurred." }), { 
      status: error.message.includes("not found") || error.message.includes("deleted") ? 404 : 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}
