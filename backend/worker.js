/**
 * Shokyuu Sensei — Cloudflare Worker (proxy AI dengan streaming)
 *
 * Variabel di Cloudflare (Settings → Variables and Secrets):
 *   ACCESS_TOKEN      (secret)  token pribadi, sama dengan isian "Token akses" di aplikasi
 *   ANTHROPIC_API_KEY (secret)  kalau pakai Claude
 *   GEMINI_API_KEY    (secret)  kalau pakai Gemini
 *   ALLOWED_ORIGINS   (text)    contoh: https://prihatinp.github.io  (pisahkan dengan koma bila lebih dari satu)
 *   CLAUDE_MODEL      (text, opsional)  default: claude-haiku-5-5
 *   GEMINI_MODEL      (text, opsional)  default: gemini-flash-latest
 *
 * Endpoint:
 *   GET  /        → cek hidup
 *   POST /chat    → { provider, system, messages:[{role,content}], max_tokens }
 *                   balasan: text/plain yang mengalir potongan demi potongan
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const originOk = !origin || allowed.length === 0 || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk && origin ? origin : (allowed[0] || "*"),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Token",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, app: "shokyuu-sensei" });
    if (!originOk) return json({ error: "Origin tidak diizinkan." }, 403);
    if (request.method !== "POST" || url.pathname !== "/chat") return json({ error: "Not found" }, 404);
    if (!env.ACCESS_TOKEN || request.headers.get("X-Access-Token") !== env.ACCESS_TOKEN) return json({ error: "Token akses salah." }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Body bukan JSON." }, 400); }
    const provider = body.provider === "gemini" ? "gemini" : "claude";
    const system = String(body.system || "").slice(0, 20000);
    const maxTokens = Math.min(Number(body.max_tokens) || 700, 1500);
    // Rapikan riwayat: hanya user/assistant, tidak kosong, harus dimulai dari user
    let messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) return json({ error: "Pesan kosong." }, 400);

    try {
      const upstream = provider === "claude"
        ? await callClaude(env, system, messages, maxTokens)
        : await callGemini(env, system, messages, maxTokens);
      if (!upstream.ok) {
        const detail = await upstream.text();
        return json({ error: `${provider} error ${upstream.status}: ${detail.slice(0, 300)}` }, 502);
      }
      const stream = sseToText(upstream.body, provider);
      return new Response(stream, {
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }
      });
    } catch (e) {
      return json({ error: "Gagal menghubungi AI: " + e.message }, 502);
    }
  }
};

function callClaude(env, system, messages, maxTokens) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY belum diisi di Worker.");
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || "claude-haiku-5-5",
      max_tokens: maxTokens,
      system,
      messages,
      stream: true
    })
  });
}

function callGemini(env, system, messages, maxTokens) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diisi di Worker.");
  const model = env.GEMINI_MODEL || "gemini-flash-latest";
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 }
    })
  });
}

// Ubah aliran SSE dari penyedia AI menjadi teks biasa yang langsung bisa ditampilkan
function sseToText(src, provider) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  return new ReadableStream({
    async start(controller) {
      const reader = src.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let ev; try { ev = JSON.parse(data); } catch { continue; }
            let text = "";
            if (provider === "claude") {
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") text = ev.delta.text;
              if (ev.type === "error") text = "\n[Error: " + (ev.error && ev.error.message) + "]";
            } else {
              const parts = ev.candidates && ev.candidates[0] && ev.candidates[0].content && ev.candidates[0].content.parts;
              if (parts) text = parts.map(p => p.text || "").join("");
            }
            if (text) controller.enqueue(enc.encode(text));
          }
        }
      } catch (e) {
        controller.enqueue(enc.encode("\n[Koneksi terputus]"));
      } finally {
        controller.close();
      }
    }
  });
}
