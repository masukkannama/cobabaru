// worker-missav.ts
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // usage: /missav/<slug>
      if (parts[0] === "missav" && parts[1]) {
        const slug = parts.slice(1).join("/");
        
        // Gunakan header yang lebih spesifik untuk menghindari redirect
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
          "Cache-Control": "max-age=0",
          "Cookie": "locale=en" // Coba set cookie untuk bahasa Inggris
        };

        const target = `https://missav.com/en/${slug}`;
        
        const resp = await fetch(target, {
          method: "GET",
          headers: headers,
          redirect: "manual" // Handle redirect manually
        });

        // Handle redirect
        let finalUrl = target;
        let finalHtml = "";

        if (resp.status >= 300 && resp.status < 400) {
          // Jika redirect, coba ikuti redirect
          const location = resp.headers.get("location");
          if (location) {
            const redirectUrl = new URL(location, target).href;
            const redirectResp = await fetch(redirectUrl, {
              method: "GET",
              headers: headers
            });
            
            if (redirectResp.ok) {
              finalHtml = await redirectResp.text();
              finalUrl = redirectUrl;
            }
          }
        } else if (resp.ok) {
          finalHtml = await resp.text();
        }

        if (!finalHtml) {
          // Jika masih gagal, coba direct fetch tanpa redirect handling
          const directResp = await fetch(target, {
            method: "GET",
            headers: headers
          });
          
          if (directResp.ok) {
            finalHtml = await directResp.text();
            finalUrl = target;
          } else {
            return new Response(JSON.stringify({
              error: `Failed to fetch page: ${directResp.status}`,
              target: target,
              redirected: resp.redirected
            }, null, 2), {
              status: 502,
              headers: { "content-type": "application/json" }
            });
          }
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
  // Extract title dari meta og:title secara spesifik
  let title = extractOgTitle(html);
  
  // Extract m3u8 URLs - khusus mencari pattern surrit.com
  const m3u8Urls = extractM3u8Urls(html);

  return new Response(JSON.stringify({
    page: targetUrl,
    title: title,
    m3u8: m3u8Urls,
    success: m3u8Urls.length > 0,
    html_length: html.length,
    debug_info: {
      title_found: !!title,
      urls_found: m3u8Urls.length,
      target_domain: new URL(targetUrl).hostname,
      has_og_title: html.includes('og:title'),
      has_surrit: html.includes('surrit.com')
    }
  }, null, 2), {
    headers: { 
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS"
    }
  });
}

// Fungsi khusus untuk extract og:title
function extractOgTitle(html: string): string | null {
  // Cari meta og:title secara spesifik
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    return cleanText(ogTitleMatch[1]);
  }
  
  // Fallback ke title biasa
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch ? cleanText(titleMatch[1]) : null;
}

// Fungsi untuk extract m3u8 URLs dengan focus pada surrit.com
function extractM3u8Urls(html: string): string[] {
  const patterns = [
    // Pattern khusus untuk surrit.com
    /https?:\/\/surrit\.com\/[^\s'"]+\.m3u8[^\s'"]*/gi,
    
    // Pattern umum untuk m3u8
    /https?:\/\/[^\s'"]+\.m3u8[^\s'"]*/gi,
    
    // Pattern untuk URLs dalam quotes
    /["'](https?:\/\/surrit\.com\/[^"']+\.m3u8[^"']*)["']/gi,
    
    // Pattern untuk URLs dalam JavaScript
    /(?:var|let|const|src|href)\s*[=:]\s*["'](https?:\/\/surrit\.com\/[^"']+\.m3u8[^"']*)["']/gi
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
        
        if (url.startsWith('http') && url.includes('.m3u8')) {
          urls.push(url);
        }
      }
    }
  }

  // Jika tidak ditemukan, cari secara manual dalam script
  if (urls.length === 0) {
    const manualSearch = findUrlsInScripts(html);
    urls.push(...manualSearch);
  }

  return [...new Set(urls)];
}

// Fungsi untuk mencari URLs dalam script tags
function findUrlsInScripts(html: string): string[] {
  const urls: string[] = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const scriptContent = scriptMatch[1];
    
    // Cari surrit.com patterns
    const surritPatterns = [
      /surrit\.com\/[a-f0-9-]+\/playlist\.m3u8/gi,
      /https?:\/\/surrit\.com\/[^'"]+\.m3u8/gi
    ];
    
    for (const pattern of surritPatterns) {
      const matches = scriptContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (match.startsWith('surrit.com')) {
            urls.push(`https://${match}`);
          } else if (!match.startsWith('http')) {
            urls.push(`https://${match}`);
          } else {
            urls.push(match);
          }
        });
      }
    }
  }
  
  return urls;
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
