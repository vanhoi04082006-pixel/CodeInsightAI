// CodeInsight AI — PDF Font Loader
//
// Loads Be Vietnam Pro TTF at runtime (client-side) for Unicode Vietnamese
// support in jsPDF. The font is fetched from a CDN on first PDF export and
// cached in memory for subsequent exports.
//
// Fallback: if the font fails to load (offline, CDN down), PDF generation
// falls back to Helvetica (English only, Vietnamese will mojibake).

const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bevietnampro/BeVietnamPro%5Bwght%5D.ttf";

let cachedFontBase64: string | null = null;
let loadingPromise: Promise<string | null> | null = null;

/**
 * Fetch the Be Vietnam Pro TTF and return it as a base64 string.
 * Cached after first successful load. Returns null if fetch fails.
 */
export async function loadVietnameseFont(): Promise<string | null> {
  if (cachedFontBase64) return cachedFontBase64;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const res = await fetch(FONT_URL);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      // ArrayBuffer → base64
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
      }
      cachedFontBase64 = btoa(binary);
      return cachedFontBase64;
    } catch {
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** Clear the cached font (for testing or if the font needs to be re-fetched). */
export function clearFontCache(): void {
  cachedFontBase64 = null;
}
