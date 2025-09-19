// worker-missav.ts
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // usage: /missav/<slug>
      if (parts[0] === "missav" && parts[1]) {
        const slug = parts.slice(1).join("/");
        const target = `https://missav.ws/en/${slug}`;

        // decoded headers from your input:
        const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
        const referer = target; // or "https://missav.ws/en/fsdss-232-uncensored-leak" specifically

        const resp = await fetch(target, {
          method: "GET",
          headers: {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer,
            "Origin": "https://missav.ws",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        });

        if (!resp.ok) {
          // return status & body from remote for debugging
          return new Response(JSON.stringify({
            error: `Fetch failed ${resp.status}`,
            status: resp.status,
          }, null, 2), {
            status: 502,
            headers: { "content-type": "application/json" }
          });
        }

        const html = await resp.text();

        // extract title (h1, meta og:title, or <title>)
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                           html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                           html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : null;

        // extract all .m3u8 URLs from HTML (scripts or attributes)
        const m3u8Matches = html.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/g) || [];
        const uniqueM3u8 = [...new Set(m3u8Matches)];

        return new Response(JSON.stringify({
          page: target,
          title,
          m3u8: uniqueM3u8
        }, null, 2), {
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("Usage: /missav/<slug>", { status: 400 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }
};
