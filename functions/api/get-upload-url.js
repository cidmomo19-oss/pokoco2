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
  const fileSizeStr = url.searchParams.get("size");

  if (!fileSizeStr || isNaN(fileSizeStr)) {
    return new Response(JSON.stringify({ success: false, message: "Invalid size" }), { status: 400 });
  }

  const fileSize = parseInt(fileSizeStr, 10);
  if (fileSize > 500 * 1024 * 1024) {
    return new Response(JSON.stringify({ success: false, message: "Max 500MB" }), { status: 413 });
  }

  const videoId = generateVideoId();

  try {
    // Dipangkas! Isi NULL/Default agar tidak error di Database D1 kamu sebelumnya
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, password, user_id, file_name) VALUES (?, 0, ?, NULL, NULL, NULL)"
    ).bind(videoId, contentType).run();

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });

    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
      ContentType: contentType,
      ContentLength: fileSize,
    });

    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });

    return new Response(JSON.stringify({ success: true, uploadUrl: signedUrl, videoId: videoId }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Error" }), { status: 500 });
  }
}
