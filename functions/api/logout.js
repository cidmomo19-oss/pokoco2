export async function onRequestGet() {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `pokoco_user_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    }
  });
}
