import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID is missing" }), { status: 400 });
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
    // 1. Ambil data dari D1 (termasuk ad_link)
    const videoData = await env.DB.prepare(
      "SELECT content_type, ad_link FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!videoData) {
      throw new Error("File not found in database");
    }

    // 2. Update View Count
    await env.DB.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").bind(videoId).run();

    // 3. Buat Pre-signed URL R2
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 10800 });

    return new Response(JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: videoData.content_type,
      adLink: videoData.ad_link // Kirim link iklan ke frontend
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Get URL Error:", error);
    return new Response(JSON.stringify({ success: false, message: "File not found" }), { status: 404 });
  }
}
