import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function generateVideoId(length = 9) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const contentType = url.searchParams.get("type") || "application/octet-stream";
  const adLink = url.searchParams.get("ad_link") || null; // Ambil link iklan dari frontend
  
  const videoId = generateVideoId();
  const fileName = videoId; 

  try {
    // SIMPAN SEMUA DATA KE DATABASE D1
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, ad_link) VALUES (?, 0, ?, ?)"
    ).bind(videoId, contentType, adLink).run();

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: fileName,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });

    return new Response(JSON.stringify({
      success: true,
      uploadUrl: signedUrl,
      videoId: videoId
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Upload URL Error:", error);
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }
}
