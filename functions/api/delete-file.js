import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { id, userId } = await request.json();

    if (!id || !userId) {
      return new Response(JSON.stringify({ success: false, message: "Missing data" }), { status: 400 });
    }

    // Pastikan user pemilik asli dari file tersebut
    const video = await env.DB.prepare("SELECT id FROM videos WHERE id = ? AND user_id = ?").bind(id, userId).first();
    if (!video) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 403 });
    }

    // 1. Hapus dari R2 Storage
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    await S3.send(new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: id,
    }));

    // 2. Hapus dari Database D1
    await env.DB.prepare("DELETE FROM videos WHERE id = ? AND user_id = ?").bind(id, userId).run();

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Internal server error" }), { status: 500 });
  }
}
