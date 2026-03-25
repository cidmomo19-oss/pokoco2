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
  const contentType = url.searchParams.get("type") || "video/mp4";
  const fileName = url.searchParams.get("name") || "Untitled";

  // Cek ID User dari Cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/pokoco_user_id=(\d+)/);
  const userId = match ? parseInt(match[1]) : 0; // 0 jika Guest

  const videoId = generateVideoId();

  // Simpan data ke Database
  await env.DB.prepare("INSERT INTO videos (id, user_id, file_name, content_type) VALUES (?, ?, ?, ?)")
    .bind(videoId, userId, fileName, contentType)
    .run();

  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: videoId,
    ContentType: contentType,
  });

  const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });
  return new Response(JSON.stringify({ success: true, uploadUrl: signedUrl, videoId: videoId }));
}
