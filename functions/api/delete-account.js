import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { userId } = await request.json();

    if (!userId) {
      return new Response(JSON.stringify({ success: false, message: "Missing userId" }), { status: 400 });
    }

    // Cari semua file milik user
    const { results } = await env.DB.prepare("SELECT id FROM videos WHERE user_id = ?").bind(userId).all();

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Hapus seluruh filenya dari Storage R2
    for (const file of results) {
      await S3.send(new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: file.id,
      }));
    }

    // Hapus seluruh history di Database D1
    await env.DB.prepare("DELETE FROM videos WHERE user_id = ?").bind(userId).run();

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "Internal server error" }), { status: 500 });
  }
}
