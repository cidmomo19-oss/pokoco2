import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) return new Response(JSON.stringify({ success: false }), { status: 400 });

  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) return response; 

  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });

  try {
    // Tanpa cek password dll, langsung sikat load URL
    const videoData = await env.DB.prepare("SELECT content_type FROM videos WHERE id = ?").bind(videoId).first();
    if (!videoData) throw new Error("Not found");

    const getCommand = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: videoId });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 604800 }); 

    response = new Response(JSON.stringify({ success: true, playUrl: signedUrl, contentType: videoData.content_type }), { 
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=518400' } 
    });

    waitUntil(cache.put(cacheKey, response.clone()));
    return response;

  } catch (error) {
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  }
}
