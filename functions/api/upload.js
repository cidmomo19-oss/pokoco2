// functions/api/upload.js
// Endpoint API khusus BOT untuk mendapatkan Pre-signed URL
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function generateVideoId(length = 9) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // Ambil data dari body JSON yang dikirim bot
    const body = await request.json();
    const contentType = body.type || "application/octet-stream";
    const adLink = body.ad_link || null;

    const videoId = generateVideoId();

    // 1. Simpan data awal ke D1 Database
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, ad_link, created_at, last_viewed_at) VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(videoId, contentType, adLink).run();

    // 2. Inisialisasi S3Client
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // 3. Buat Pre-signed URL untuk Upload (berlaku 3 jam)
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });

    const domain = new URL(request.url).origin;

    // 4. Kembalikan URL tersebut ke Bot
    return new Response(JSON.stringify({
      success: true,
      message: "Gunakan 'uploadUrl' ini untuk melakukan PUT request file mentah.",
      videoId: videoId,
      uploadUrl: signedUrl,
      viewUrl: `${domain}/v?id=${videoId}`
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Bot API Upload Error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: "Invalid request. Make sure to send a JSON body with 'type'." 
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
