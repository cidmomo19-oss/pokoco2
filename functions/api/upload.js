function generateVideoId(length = 9) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // Pastikan request adalah multipart/form-data
    const contentTypeHeader = request.headers.get("Content-Type");
    if (!contentTypeHeader || !contentTypeHeader.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ success: false, message: "Invalid Content-Type. Expected 'multipart/form-data'." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Parse form data dari request
    const formData = await request.formData();
    const file = formData.get("file"); // Ambil file dari field 'file'
    let contentType = formData.get("content_type") || file.type; // Ambil content_type dari form atau dari file itu sendiri
    const adLink = formData.get("ad_link") || null; // Ambil link iklan dari field 'ad_link'

    if (!file) {
      return new Response(JSON.stringify({ success: false, message: "No file uploaded. Please send a file in the 'file' field." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Pastikan content_type tidak kosong
    if (!contentType || contentType === "application/octet-stream") {
      // Jika content_type masih generik, coba infer dari ekstensi atau biarkan default
      // Ini penting agar R2 dan browser bisa mengidentifikasi jenis file dengan benar
      const fileName = file.name;
      const fileExtension = fileName.split('.').pop();
      switch (fileExtension.toLowerCase()) {
        case 'mp4': contentType = 'video/mp4'; break;
        case 'mov': contentType = 'video/quicktime'; break;
        case 'mkv': contentType = 'video/x-matroska'; break;
        case 'avi': contentType = 'video/x-msvideo'; break;
        case 'jpg': case 'jpeg': contentType = 'image/jpeg'; break;
        case 'png': contentType = 'image/png'; break;
        case 'gif': contentType = 'image/gif'; break;
        case 'webp': contentType = 'image/webp'; break;
        case 'avif': contentType = 'image/avif'; break;
        case 'mp3': contentType = 'audio/mpeg'; break;
        case 'wav': contentType = 'audio/wav'; break;
        case 'ogg': contentType = 'audio/ogg'; break;
        case 'aac': contentType = 'audio/aac'; break;
        case 'flac': contentType = 'audio/flac'; break;
        default: contentType = 'application/octet-stream'; // Fallback
      }
    }

    // Generate ID unik untuk video
    const videoId = generateVideoId();

    // 1. Upload file ke R2
    // env.R2_BUCKET adalah binding ke R2 yang didefinisikan di wrangler.toml
    // Kita gunakan file.stream() untuk efisiensi memori pada file besar
    await env.R2_BUCKET.put(videoId, file.stream(), {
      httpMetadata: { contentType: contentType },
      customMetadata: {
        originalFileName: file.name, // Simpan nama asli file sebagai metadata R2 opsional
      },
    });

    // 2. Simpan metadata ke D1
    await env.DB.prepare(
      "INSERT INTO videos (id, views, content_type, ad_link, created_at, last_viewed_at) VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(videoId, contentType, adLink).run();

    // Berikan respons sukses
    return new Response(JSON.stringify({
      success: true,
      message: "File uploaded successfully.",
      videoId: videoId,
      viewUrl: `${new URL(request.url).origin}/v?id=${videoId}` // URL untuk melihat file
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Direct Upload API Error:", error);
    return new Response(JSON.stringify({ success: false, message: error.message || "An unknown error occurred during upload." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
