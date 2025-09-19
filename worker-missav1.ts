// worker-missav.ts

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // Format endpoint: /missav/<kode>
      // contoh: /missav/fsdss-232-uncensored-leak
      if (parts[0] === "missav" && parts[1]) {
        const slug = parts.slice(1).join("/"); // fsdss-232-uncensored-leak
        const target = `https://missav.ws/en/${slug}`;

        // fetch halaman MissAV
        const resp = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
            "Referer": target,
          },
        });
        if (!resp.ok) {
          return new Response(
            JSON.stringify({ error: `Fetch failed ${resp.status}` }),
            { status: resp.status, headers: { "content-type": "application/json" } }
          );
        }

        const html = await resp.text();

        // ambil title
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                           html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : null;

        // cari .m3u8
        const m3u8Matches = html.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/g) || [];
        const uniqueM3u8 = [...new Set(m3u8Matches)];

        const result = {
          page: target,
          title,
          m3u8: uniqueM3u8,
        };

        return new Response(JSON.stringify(result, null, 2), {
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("Usage: /missav/<slug>", { status: 400 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
