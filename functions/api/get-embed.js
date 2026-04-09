import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");
  const pwd = url.searchParams.get("pwd") || null;

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
  }

  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) return response;

  try {
    const videoData = await env.DB.prepare(
      "SELECT content_type, password FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) throw new Error("Link not found.");

    // --- LOGIKA PASSWORD SAMA PERSIS SEPERTI UTAMA ---
    if (videoData.password) {
      if (!pwd) {
        return new Response(JSON.stringify({ success: true, requiresPassword: true }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } else if (pwd !== videoData.password) {
        return new Response(JSON.stringify({ success: false, message: "Incorrect password." }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Ambil JSON file dari R2
    const getCommand = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: videoId });
    const s3Response = await S3.send(getCommand);
    
    // Convert Stream ke String JSON
    const jsonString = await s3Response.Body.transformToString();
    const embedData = JSON.parse(jsonString);

    const responseData = JSON.stringify({
      success: true,
      embedUrl: embedData.embedUrl,
      downloadUrl: embedData.downloadUrl,
      contentType: videoData.content_type
    });

    response = new Response(responseData, { 
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=518400, s-maxage=518400' } 
    });

    waitUntil(cache.put(cacheKey, response.clone()));
    return response;

  } catch (error) {
    console.error("Error fetching embed:", error);
    return new Response(JSON.stringify({ success: false, message: "File not found." }), { 
      status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}
