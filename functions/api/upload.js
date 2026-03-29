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

// ==========================================
// 1. INI UNTUK BOT (METHOD POST)
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const contentType = body.type || "application/octet-stream";
    const adLink = body.ad_link || null;
    const fileSizeBytes = body.size || null; // Opsional: Bisa dikirim oleh BOT, bisa tidak

    // --- VALIDASI LIMIT 5 GB ---
    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB dalam bytes

    // Kalau bot ngirim ukuran, cek apakah melebihi 5 GB
    if (fileSizeBytes && fileSizeBytes > MAX_SIZE) {
      return new Response(JSON.stringify({ 
        success: false, message: "File exceeds the 5GB maximum limit for Cloudflare R2." 
      }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    // -----------------------------

    const videoId = generateVideoId();

    // Simpan data ke Database D1
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, ad_link, created_at, last_viewed_at) VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(videoId, contentType, adLink).run();

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Setup Parameter untuk R2 S3
    const commandParams = {
      Bucket: env.R2_BUCKET_NAME,
      Key: videoId,
      ContentType: contentType,
    };

    // Kunci URL S3 kalau bot memberikan info ukuran file
    if (fileSizeBytes) {
      commandParams.ContentLength = fileSizeBytes;
    }

    const command = new PutObjectCommand(commandParams);

    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 10800 });
    const domain = new URL(request.url).origin;

    return new Response(JSON.stringify({
      success: true,
      message: "Gunakan 'uploadUrl' ini untuk melakukan PUT request file mentah.",
      videoId: videoId,
      uploadUrl: signedUrl,
      viewUrl: `${domain}/v?id=${videoId}`
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, message: "Invalid request. Ensure your JSON body is correct." 
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}

// ==========================================
// 2. INI UNTUK BROWSER (METHOD GET)
// ==========================================
export async function onRequestGet(context) {
  // Kalau ada yang iseng buka link ini di browser, kasih pesan ini:
  return new Response(JSON.stringify({
    success: false,
    message: "Halo! API Upload Bot aktif. Tapi kamu tidak bisa membukanya lewat browser (GET). Gunakan metode POST dengan body JSON untuk mendapatkan Pre-signed URL."
  }), { 
    status: 405, // 405 artinya Method Not Allowed
    headers: { 'Content-Type': 'application/json' } 
  });
}
