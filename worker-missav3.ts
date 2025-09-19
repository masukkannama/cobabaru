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

        // Headers yang lebih natural untuk menghindari deteksi bot
        const headers = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Referer": "https://missav.ws/",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0"
        };

        const resp = await fetch(target, {
          method: "GET",
          headers: headers,
          // Tambahkan redirect handling
          redirect: "follow"
        });

        if (!resp.ok) {
          // Coba alternatif domain jika utama diblokir
          const altTarget = `https://missav.com/en/${slug}`;
          const altResp = await fetch(altTarget, {
            method: "GET",
            headers: headers,
            redirect: "follow"
          });
          
          if (!altResp.ok) {
            return new Response(JSON.stringify({
              error: `Both requests failed: ${resp.status} and ${altResp.status}`,
              target: target,
              altTarget: altTarget
            }, null, 2), {
              status: 502,
              headers: { "content-type": "application/json" }
            });
          }
          
          const html = await altResp.text();
          return processHtml(html, altTarget);
        }

        const html = await resp.text();
        return processHtml(html, target);
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

// Fungsi terpisah untuk memproses HTML
function processHtml(html: string, targetUrl: string): Response {
  // Extract title
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                     html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Extract m3u8 URLs dengan pattern yang lebih komprehensif
  const m3u8Patterns = [
    /https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/g,
    /(?:src|href)=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    /(?:file|url):\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi
  ];

  let m3u8Urls: string[] = [];
  m3u8Patterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      m3u8Urls = m3u8Urls.concat(matches.map(url => 
        url.replace(/^(src|href)=["']|["']$/g, '')
      ));
    }
  });

  const uniqueM3u8 = [...new Set(m3u8Urls)];

  return new Response(JSON.stringify({
    page: targetUrl,
    title,
    m3u8: uniqueM3u8,
    success: true
  }, null, 2), {
    headers: { 
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    }
  });
}
