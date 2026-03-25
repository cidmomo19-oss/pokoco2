import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id");

  if (!videoId) {
    return new Response(JSON.stringify({ success: false, message: "ID parameter is missing" }), { status: 400 });
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
    // 1. Cek Metadata file dari R2 (biar tahu ini video atau gambar, dan cek keberadaan file)
    const headCommand = new HeadObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const metadata = await S3.send(headCommand);
    const contentType = metadata.ContentType || "application/octet-stream";

    // 2. UPDATE VIEW COUNT DI DATABASE D1
    // (Akan dibuat di Langkah 3, tapi kodenya sudah disiapkan)
    await env.DB.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").bind(videoId).run();

    // 3. Buat Pre-signed URL. Kadaluarsa: 3 jam (10800 detik)
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
    });
    const signedUrl = await getSignedUrl(S3, getCommand, { expiresIn: 10800 });

    return new Response(JSON.stringify({
      success: true,
      playUrl: signedUrl,
      contentType: contentType // Kirim info tipe file ke Frontend
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Error in get-video-url:", error);
    if (error.name === "NotFound") {
      return new Response(JSON.stringify({ success: false, message: "File not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ success: false, message: "Failed to retrieve file URL", error: error.message }), { status: 500 });
  }
}
