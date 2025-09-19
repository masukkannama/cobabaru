// worker-missav.ts
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // usage: /missav/<slug>
      if (parts[0] === "missav" && parts[1]) {
        const slug = parts.slice(1).join("/");
        
        // Coba beberapa domain yang mungkin
        const domains = [
          "https://missav.com",
          "https://missav.ws", 
          "https://missav.org",
          "https://missav.net"
        ];

        let finalHtml = "";
        let finalUrl = "";
        let lastError = "";

        // Coba setiap domain sampai berhasil
        for (const domain of domains) {
          const target = `${domain}/en/${slug}`;
          try {
            const headers = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
              "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              "Referer": `${domain}/`,
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
              redirect: "follow"
            });

            if (resp.ok) {
              finalHtml = await resp.text();
              finalUrl = target;
              break;
            } else {
              lastError = `Domain ${domain} returned ${resp.status}`;
            }
          } catch (error) {
            lastError = `Domain ${domain} error: ${error.message}`;
          }
          
          // Tunggu sebentar sebelum mencoba domain berikutnya
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!finalHtml) {
          return new Response(JSON.stringify({
            error: `All domains failed. Last error: ${lastError}`,
            tried_domains: domains
          }, null, 2), {
            status: 502,
            headers: { "content-type": "application/json" }
          });
        }

        return processHtml(finalHtml, finalUrl);
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

// Fungsi untuk memproses HTML
function processHtml(html: string, targetUrl: string): Response {
  // Extract title dalam bahasa Inggris - cari pattern yang lebih spesifik
  let title = null;
  
  // Pattern 1: Cari di tag h1 dengan class tertentu
  const h1Match = html.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>(.*?)<\/h1>/i);
  if (h1Match) title = h1Match[1].trim();
  
  // Pattern 2: Cari meta og:title
  if (!title) {
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch) title = ogTitleMatch[1].trim();
  }
  
  // Pattern 3: Cari tag title biasa
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();
  }

  // Bersihkan title dari karakter khusus
  if (title) {
    title = title.replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"')
                 .replace(/&#039;/g, "'")
                 .replace(/<[^>]*>/g, '');
  }

  // Extract m3u8 URLs dengan pattern yang lebih komprehensif
  const m3u8Patterns = [
    // Pattern untuk URL langsung
    /https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/gi,
    
    // Pattern untuk JSON data yang mungkin berisi m3u8
    /(?:src|href|file|url)=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Pattern untuk data JSON yang di-encode
    /(?:[\\"'])(https?:\/\/[^"']+\.m3u8[^"']*)(?:[\\"'])/gi,
    
    // Pattern untuk variabel JavaScript
    /(?:var|let|const)\s+[^=]+=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Pattern untuk player configuration
    /(?:source|sources)\s*:\s*\[[^\]]*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi
  ];

  let m3u8Urls: string[] = [];
  
  for (const pattern of m3u8Patterns) {
    const matches = html.match(pattern);
    if (matches) {
      const cleanedUrls = matches.map(url => {
        // Bersihkan URL dari quotes dan karakter escape
        return url.replace(/^(src|href|file|url)=["']|["']$|^[\\"']|[\\"']$/g, '')
                  .replace(/\\\//g, '/') // Unescape forward slashes
                  .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => 
                    String.fromCharCode(parseInt(hex, 16))); // Decode Unicode
      });
      m3u8Urls = [...m3u8Urls, ...cleanedUrls];
    }
  }

  // Jika tidak ditemukan m3u8, coba cari di JavaScript variables
  if (m3u8Urls.length === 0) {
    const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      const scriptContent = scriptMatch[1];
      
      // Cari variabel yang mungkin berisi URL video
      const varPatterns = [
        /(?:var|let|const)\s+[^=]+=\s*(\[[\s\S]*?\]|\{[\s\S]*?\})/g,
        /sources\s*:\s*(\[[\s\S]*?\])/g,
        /player\.setup\((\{[\s\S]*?\})\)/g
      ];
      
      for (const varPattern of varPatterns) {
        const varMatches = scriptContent.match(varPattern);
        if (varMatches) {
          for (const varMatch of varMatches) {
            // Cari URL m3u8 dalam object/array JavaScript
            const urlMatches = varMatch.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/g);
            if (urlMatches) {
              m3u8Urls = [...m3u8Urls, ...urlMatches];
            }
          }
        }
      }
    }
  }

  const uniqueM3u8 = [...new Set(m3u8Urls)];

  return new Response(JSON.stringify({
    page: targetUrl,
    title: title || "Title not found in English",
    m3u8: uniqueM3u8,
    success: uniqueM3u8.length > 0,
    html_length: html.length,
    debug: m3u8Urls.length > 0 ? "Found potential URLs" : "No m3u8 URLs found"
  }, null, 2), {
    headers: { 
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    }
  });
}
