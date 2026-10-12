const DEFAULT_SITE_TITLE = "亮亮专属欧金金";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function authorized(request, expectedKey) {
  const authorization = request.headers.get("Authorization") || "";
  const suppliedKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expectedKey || !suppliedKey || suppliedKey.length > 512) return false;

  const encoder = new TextEncoder();
  const [expectedDigest, suppliedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expectedKey)),
    crypto.subtle.digest("SHA-256", encoder.encode(suppliedKey))
  ]);
  const expected = new Uint8Array(expectedDigest);
  const supplied = new Uint8Array(suppliedDigest);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/title") return jsonResponse({ error: "Not found." }, 404);

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT site_title FROM desktop_site_title WHERE id = 1"
      ).first();
      return jsonResponse({ siteTitle: row?.site_title || DEFAULT_SITE_TITLE });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }
    if (!await authorized(request, env.TITLE_SYNC_ADMIN_KEY)) {
      return jsonResponse({ error: "此设备没有共享标题管理权限。" }, 403);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "请求内容必须是有效的 JSON。" }, 400);
    }
    const siteTitle = typeof payload?.siteTitle === "string" ? payload.siteTitle.trim() : "";
    if (!siteTitle || Array.from(siteTitle).length > 60 || /[\u0000-\u001f\u007f]/.test(siteTitle)) {
      return jsonResponse({ error: "桌面端标题需要为 1–60 个字符。" }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO desktop_site_title (id, site_title, updated_at)
      VALUES (1, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        site_title = excluded.site_title,
        updated_at = excluded.updated_at
    `).bind(siteTitle).run();
    return jsonResponse({ siteTitle });
  }
};
