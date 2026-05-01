import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export async function onRequestGet(context) {
  const { request, env, params, waitUntil } = context;
  
  // Mengambil (namafile) dari URL /x/(namafile)
  const fileId = params.id;

  if (!fileId) {
    return new Response("File ID is missing", { status: 400 });
  }

  // Cek cache Cloudflare supaya nggak buang-buang kuota R2 kalau sering diload
  const cacheKey = new Request(request.url, request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  
  if (response) {
    return response;
  }

  // Inisialisasi S3 Client
  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    // Ambil content-type dari database biar formatnya (JPEG/PNG/dsb) akurat
    const fileData = await env.DB.prepare(
      "SELECT content_type FROM videos WHERE id = ?"
    ).bind(fileId).first();

    if (!fileData) {
      return new Response("File not found", { status: 404 });
    }

    // Ambil file langsung dari R2 (Bukan presigned URL)
    const getCommand = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: fileId,
    });

    const s3Object = await S3.send(getCommand);

    // Bikin response yang isinya langsung BODY file tersebut (stream data)
    response = new Response(s3Object.Body, {
      headers: {
        "Content-Type": fileData.content_type || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable", // Cache 1 tahun biar kenceng
        "Access-Control-Allow-Origin": "*", // Penting biar bisa di-embed di website lain (CORS)
      },
    });

    // Simpan ke Cache Cloudflare edge
    waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    console.error(`Error fetching file ${fileId}:`, error);
    return new Response("File not found or an error occurred", { status: 404 });
  }
}
