import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function generateVideoId(length = 9) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const { embedUrl, downloadUrl, password } = body;

    if (!embedUrl) {
      return new Response(JSON.stringify({ success: false, message: "Embed URL is required." }), { status: 400 });
    }

    const videoId = generateVideoId();
    const contentType = "embed"; // Penanda rahasia agar kita tahu ini bukan file fisik

    // 1. Simpan ke database D1
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, password) VALUES (?, 0, ?, ?)"
    ).bind(videoId, contentType, password || null).run();

    // 2. Simpan Data JSON ke R2
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const embedData = JSON.stringify({ embedUrl, downloadUrl: downloadUrl || null });

    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
      ContentType: "application/json",
      Body: embedData,
    });

    await S3.send(command);

    return new Response(JSON.stringify({
      success: true,
      videoId: videoId
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Create Embed Error:", error);
    return new Response(JSON.stringify({ success: false, message: "Failed to create secret link." }), { 
      status: 500, headers: { 'Content-Type': 'application/json' } 
    });
  }
}
