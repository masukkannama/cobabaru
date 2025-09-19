// worker-missav.ts
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // usage: /missav/<slug>
      if (parts[0] === "missav" && parts[1]) {
        const slug = parts.slice(1).join("/");
        
        // Coba beberapa domain dan path pattern
        const targets = [
          `https://missav.com/en/${slug}`,
          `https://missav.com/cn/${slug}`,
          `https://missav.com/jp/${slug}`,
          `https://missav.ws/en/${slug}`,
          `https://missav.org/en/${slug}`,
          `https://missav.net/en/${slug}`,
          `https://www.missav.com/en/${slug}`
        ];

        let finalHtml = "";
        let finalUrl = "";
        let lastError = "";

        // Coba setiap target sampai berhasil
        for (const target of targets) {
          try {
            const headers = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept-Encoding": "gzip, deflate, br",
              "Referer": "https://missav.com/",
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
              
              // Jika redirect terjadi, dapatkan URL akhir
              if (resp.redirected) {
                finalUrl = resp.url;
              }
              
              break;
            } else {
              lastError = `Target ${target} returned ${resp.status}`;
            }
          } catch (error) {
            lastError = `Target ${target} error: ${error.message}`;
          }
          
          // Tunggu sebentar sebelum mencoba target berikutnya
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!finalHtml) {
          return new Response(JSON.stringify({
            error: `All targets failed. Last error: ${lastError}`,
            tried_targets: targets
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
  // Extract title - cari pattern yang lebih spesifik untuk konten video
  let title = extractTitle(html);
  
  // Extract m3u8 URLs dengan berbagai metode
  const m3u8Urls = extractM3u8Urls(html);
  
  // Jika tidak ditemukan m3u8, coba cari di data JSON yang tersembunyi
  let additionalUrls: string[] = [];
  if (m3u8Urls.length === 0) {
    additionalUrls = findHiddenUrls(html);
  }

  const allUrls = [...m3u8Urls, ...additionalUrls];
  const uniqueUrls = [...new Set(allUrls)];

  return new Response(JSON.stringify({
    page: targetUrl,
    title: title,
    m3u8: uniqueUrls,
    success: uniqueUrls.length > 0,
    html_length: html.length,
    debug_info: {
      title_found: !!title,
      urls_found: uniqueUrls.length,
      target_domain: new URL(targetUrl).hostname
    }
  }, null, 2), {
    headers: { 
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    }
  });
}

// Fungsi khusus untuk extract title
function extractTitle(html: string): string | null {
  const titlePatterns = [
    // Pattern untuk h1 dengan class spesifik
    /<h1[^>]*class=["'][^"']*(title|heading|video-title)[^"']*["'][^>]*>(.*?)<\/h1>/i,
    
    // Pattern untuk div dengan class title
    /<div[^>]*class=["'][^"']*(title|heading)[^"']*["'][^>]*>(.*?)<\/div>/i,
    
    // Pattern untuk meta og:title
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
    
    // Pattern untuk JSON-LD data
    /"name"\s*:\s*"([^"]+)"/i,
    
    // Pattern untuk tag title biasa
    /<title[^>]*>(.*?)<\/title>/i
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      const title = match[1] || match[2];
      if (title && !title.includes('ThisAV') && !title.includes('世界最高')) {
        return cleanText(title);
      }
    }
  }

  return cleanText(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || null);
}

// Fungsi untuk extract m3u8 URLs
function extractM3u8Urls(html: string): string[] {
  const patterns = [
    // URL langsung
    /https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/gi,
    
    // Dalam quotes
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Dalam JavaScript variables
    /(?:var|let|const|src|href)\s*[=:]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Dalam JSON objects
    /(?:file|url|source|src)\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Base64 encoded (mungkin perlu decode)
    /(?:src|href)=["']data:text\/plain;base64,([^"']+)["']/gi
  ];

  const urls: string[] = [];
  
  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (let url of matches) {
        // Clean the URL
        url = url.replace(/^["']|["']$/g, '')
                 .replace(/^.*=/, '')
                 .replace(/\\\//g, '/')
                 .trim();
        
        if (url.startsWith('http')) {
          urls.push(url);
        }
      }
    }
  }

  return [...new Set(urls)];
}

// Fungsi untuk mencari URL tersembunyi dalam JavaScript
function findHiddenUrls(html: string): string[] {
  const urls: string[] = [];
  
  // Cari semua script tags
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const scriptContent = scriptMatch[1];
    
    // Cari object configurations
    const configPatterns = [
      /player\.setup\((\{[\s\S]*?\})\)/,
      /var\s+options\s*=\s*(\{[\s\S]*?\})/,
      /const\s+config\s*=\s*(\{[\s\S]*?\})/,
      /sources\s*:\s*(\[[\s\S]*?\])/
    ];
    
    for (const pattern of configPatterns) {
      const match = scriptContent.match(pattern);
      if (match) {
        const jsonLike = match[1];
        // Cari URL dalam object/array
        const urlMatches = jsonLike.match(/https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/g);
        if (urlMatches) {
          urls.push(...urlMatches);
        }
      }
    }
    
    // Cari URL dalam variable assignments
    const varPattern = /(?:var|let|const)\s+[^=]+=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/g;
    const varMatches = scriptContent.match(varPattern);
    if (varMatches) {
      urls.push(...varMatches.map(url => url.replace(/^.*["']|["']$/g, '')));
    }
  }
  
  return [...new Set(urls)];
}

// Fungsi untuk membersihkan text
function cleanText(text: string | null): string | null {
  if (!text) return null;
  
  return text.replace(/&amp;/g, '&')
             .replace(/&quot;/g, '"')
             .replace(/&#039;/g, "'")
             .replace(/&#x27;/g, "'")
             .replace(/<[^>]*>/g, '')
             .replace(/\s+/g, ' ')
             .trim();
}
