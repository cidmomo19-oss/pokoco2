import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Fungsi untuk generate ID acak (misal: jvzmAEuW1)
function generateVideoId(length = 9) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Ambil tipe file dari frontend (misal image/png atau video/mp4)
  const contentType = url.searchParams.get("type") || "application/octet-stream"; // Default jika tidak ada type

  const videoId = generateVideoId();
  // Nama file di R2 akan jadi ID saja, tanpa ekstensi biar fleksibel (gambar/video)
  const fileName = videoId; 

  try {
    // SIMPAN ID FILE KE DATABASE D1
    // (Akan dibuat di Langkah 3, tapi kodenya sudah disiapkan)
    await env.DB.prepare("INSERT INTO videos (id, views, content_type) VALUES (?, 0, ?)").bind(videoId, contentType).run();

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
      ContentType: contentType, // Menggunakan tipe file asli dari frontend
    });

    // Membuat Pre-signed URL. Kadaluarsa: 3 jam (10800 detik)
    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });

    return new Response(JSON.stringify({
      success: true,
      uploadUrl: signedUrl,
      videoId: videoId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Error in get-upload-url:", error);
    return new Response(JSON.stringify({
      success: false,
      message: "Failed to generate upload URL",
      error: error.message
    }), { status: 500 });
  }
}
