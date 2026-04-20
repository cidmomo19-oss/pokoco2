import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { videoId, userId } = await request.json();

    if (!videoId || !userId) {
        return new Response(JSON.stringify({ success: false, message: "Missing data" }), { status: 400 });
    }

    // 1. CEK KEPEMILIKAN DI DATABASE (Keamanan)
    const video = await env.DB.prepare("SELECT user_id FROM videos WHERE id = ?").bind(videoId).first();
    
    if (!video) {
        return new Response(JSON.stringify({ success: false, message: "Media not found" }), { status: 404 });
    }

    // Pastikan yang menghapus adalah pemilik aslinya
    if (video.user_id !== userId) {
        return new Response(JSON.stringify({ success: false, message: "Unauthorized: You don't own this file" }), { status: 403 });
    }

    // 2. HAPUS FILE FISIK DARI CLOUDFLARE R2
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    
    await S3.send(command);

    // 3. HAPUS DATA DARI DATABASE D1
    await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();

    return new Response(JSON.stringify({ success: true, message: "Media successfully deleted" }), {
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Delete Error:", error);
    return new Response(JSON.stringify({ success: false, message: "Internal server error" }), { status: 500 });
  }
}
