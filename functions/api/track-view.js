// functions/api/track-view.js

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    // Ambil ID video dari kiriman Frontend
    const { id } = await request.json();

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: "ID missing" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // UPDATE Database D1: Tambahkan view +1
    // Pastikan nama tabel abang adalah 'videos'
    await env.DB.prepare(
      "UPDATE videos SET views = views + 1, period_views = period_views + 1, last_viewed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run();

    return new Response(JSON.stringify({ success: true }), { 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Jaga-jaga agar tidak kena CORS
      } 
    });

  } catch (error) {
    console.error("Error updating views:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Tambahkan handle OPTIONS untuk CORS (Penting agar fetch POST lancar)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
