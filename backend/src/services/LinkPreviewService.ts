import { config } from '../config/index.js';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  type?: string;
}

interface CacheEntry {
  data: LinkPreviewData;
  timestamp: number;
}

/**
 * Service for extracting and caching link preview metadata from URLs
 * Supports Open Graph, Twitter Card, and basic HTML meta tags
 */
export class LinkPreviewService {
  private static previewCache: Map<string, CacheEntry> = new Map();
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Fetch and parse link preview data for a given URL
   * @param url - The URL to extract preview data from
   * @returns Promise resolving to link preview metadata
   */
  static async fetchPreview(url: string): Promise<LinkPreviewData | null> {
    // Validate URL format
    if (!(await this.isValidUrl(url))) {
      return null;
    }

    // Check cache first
    const cached = this.previewCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      let currentUrl = url;

      // Manually follow redirects so we can re-validate each hop and prevent
      // SSRF through a redirect that ends at a private/reserved address.
      for (let redirects = 0; redirects < 5; redirects++) {
        if (!(await this.isValidUrl(currentUrl))) {
          return null;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Aether-LinkPreview/1.0 (+https://aether-messaging.app/bot)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
          },
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) return null;
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }

        if (!response.ok) {
          console.warn(`[LinkPreview] HTTP ${response.status} for ${currentUrl}`);
          return null;
        }

        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          console.warn(`[LinkPreview] Non-HTML content for ${currentUrl}: ${contentType}`);
          return null;
        }

        // Get response size limit (5MB max)
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        if (contentLength > 5 * 1024 * 1024) {
          console.warn(`[LinkPreview] Response too large for ${currentUrl}: ${contentLength} bytes`);
          return null;
        }

        const html = await response.text();

        // Parse HTML for meta tags
        const previewData = this.parseHtmlForPreview(html, currentUrl);

      // Cache the result
      if (previewData) {
        this.previewCache.set(url, {
          data: previewData,
          timestamp: Date.now()
        });

        // Periodic cache cleanup
        this.cleanupCache();
      }

        return previewData;
      }

      return null;
    } catch (error) {
      console.error(`[LinkPreview] Error fetching preview for ${url}:`, error);
      return null;
    }
  }

  /**
   * Validate URL format and prevent SSRF attacks
   * @param url - URL to validate
   * @returns Promise resolving to true if URL is valid and safe
   */
  private static async isValidUrl(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);

      // Only allow http and https schemes
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Only allow standard ports (80 for http, 443 for https)
      if (urlObj.port) {
        const parsedPort = parseInt(urlObj.port, 10);
        if (urlObj.protocol === 'https:' && parsedPort !== 443) return false;
        if (urlObj.protocol === 'http:' && parsedPort !== 80) return false;
      }

      const hostname = urlObj.hostname.toLowerCase();
      if (!this.isValidHostname(hostname)) {
        return false;
      }

      // Fail closed: if DNS resolution fails or resolves to a private/reserved
      // address, treat the URL as unsafe (SSRF guard).
      return !(await this.hostnameResolvesToPrivate(hostname));
    } catch {
      return false;
    }
  }

  private static isValidHostname(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower.endsWith('.localhost')) return false;
    if (isIP(lower) !== 0) {
      return !this.isPrivateIp(lower);
    }
    return true;
  }

  private static isPrivateIp(ip: string): boolean {
    if (isIP(ip) === 4) {
      const octets = ip.split('.').map(Number);
      const [a, b] = octets;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true; // link-local
      if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
      if (a === 192 && b === 168) return true; // private 192.168/16
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
      if (a >= 224) return true; // multicast/reserved
      return false;
    }
    if (isIP(ip) === 6) {
      const lower = ip.toLowerCase();
      if (lower === '::1' || lower === '::') return true;
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
      if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
      return false;
    }
    return false;
  }

  private static async hostnameResolvesToPrivate(hostname: string): Promise<boolean> {
    try {
      const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
      return addresses.some((addr) => this.isPrivateIp(addr.address));
    } catch {
      // Fail closed on DNS failure.
      return true;
    }
  }
  /**
   * Parse HTML string to extract Open Graph, Twitter Card, and basic meta tags.
   *
   * Implemented with targeted regexes rather than a DOM parser on purpose. The
   * browser's DOMParser does not exist in Node, so the previous implementation
   * threw on every request and link previews silently never resolved; adding a
   * full HTML parser dependency is not warranted just to read <meta>, <title>
   * and <link> tags.
   *
   * @param html - Raw HTML content
   * @param url - Original URL for fallback values
   * @returns Extracted preview data or null if insufficient data
   */
  private static parseHtmlForPreview(html: string, url: string): LinkPreviewData | null {
    const previewData: LinkPreviewData = { url };

    // Index every <meta> tag by its property/name key. The first occurrence
    // wins, matching the precedence consumers expect for repeated og:* tags.
    const metaTags = new Map<string, string>();
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const attributes = this.parseHtmlAttributes(tag);
      const key = (attributes.property || attributes.name || '').toLowerCase();
      if (!key || !('content' in attributes)) {
        continue;
      }
      if (!metaTags.has(key)) {
        metaTags.set(key, attributes.content);
      }
    }

    const readMeta = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = metaTags.get(key);
        if (value && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    // Open Graph tags (priority), then Twitter Card, then plain HTML.
    previewData.title = readMeta('og:title', 'twitter:title');
    previewData.description = readMeta('og:description', 'twitter:description');
    previewData.imageUrl = readMeta(
      'og:image',
      'og:image:url',
      'twitter:image',
      'twitter:image:src'
    );
    previewData.siteName = readMeta('og:site_name', 'application-name');
    previewData.type = readMeta('og:type');

    if (!previewData.title) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        previewData.title = this.decodeHtmlEntities(titleMatch[1]).trim();
      }
    }

    if (!previewData.description) {
      previewData.description = readMeta('description');
    }

    // Favicon: preserve the previous precedence (icon, shortcut icon, then any
    // icon-ish rel such as apple-touch-icon).
    const linkTags = (html.match(/<link\b[^>]*>/gi) ?? []).map((tag) =>
      this.parseHtmlAttributes(tag)
    );
    const relOf = (attributes: Record<string, string>) => (attributes.rel || '').toLowerCase();
    const iconLink =
      linkTags.find((attributes) => relOf(attributes) === 'icon') ??
      linkTags.find((attributes) => relOf(attributes) === 'shortcut icon') ??
      linkTags.find((attributes) => relOf(attributes).includes('icon'));

    if (iconLink?.href) {
      previewData.faviconUrl = iconLink.href;
    }

    // Try to resolve relative URLs
    try {
      const baseUrl = new URL(url);
      if (previewData.imageUrl && !previewData.imageUrl.startsWith('http')) {
        previewData.imageUrl = new URL(previewData.imageUrl, baseUrl).toString();
      }
      if (previewData.faviconUrl && !previewData.faviconUrl.startsWith('http')) {
        previewData.faviconUrl = new URL(previewData.faviconUrl, baseUrl).toString();
      }
    } catch {
      // Ignore URL resolution errors
    }

    // Remove empty fields
    Object.keys(previewData).forEach(key => {
      if (previewData[key as keyof LinkPreviewData] === undefined ||
          previewData[key as keyof LinkPreviewData] === null ||
          previewData[key as keyof LinkPreviewData] === '') {
        delete previewData[key as keyof LinkPreviewData];
      }
    });

    // Return null if we barely got anything useful
    if (!previewData.title && !previewData.description && !previewData.imageUrl) {
      return null;
    }

    return previewData;
  }

  /**
   * Extract the attributes from a single HTML tag string.
   * Handles double-quoted, single-quoted and unquoted attribute values.
   */
  private static parseHtmlAttributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attributeRegex =
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

    let match: RegExpExecArray | null;
    while ((match = attributeRegex.exec(tag)) !== null) {
      const name = match[1].toLowerCase();
      const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
      attributes[name] = this.decodeHtmlEntities(rawValue);
    }

    return attributes;
  }

  /**
   * Decode the HTML entities that commonly appear in meta tag content.
   */
  private static decodeHtmlEntities(value: string): string {
    if (!value.includes('&')) {
      return value;
    }

    const fromCodePoint = (digits: string, radix: number): string => {
      const parsed = parseInt(digits, radix);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x10ffff) {
        return '';
      }
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return '';
      }
    };

    // &amp; is decoded last so that e.g. "&amp;lt;" does not become "<".
    return value
      .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => fromCodePoint(hex, 16))
      .replace(/&#(\d+);/g, (_match, dec: string) => fromCodePoint(dec, 10))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  /**
   * Clean up expired cache entries
   * Called periodically to prevent memory leaks
   */
  private static cleanupCache(): void {
    const now = Date.now();
    for (const [url, cacheEntry] of this.previewCache.entries()) {
      if (now - cacheEntry.timestamp! > this.CACHE_TTL_MS) {
        this.previewCache.delete(url);
      }
    }
  }

  /**
   * Get cached preview data without fetching
   * @param url - URL to check cache for
   * @returns Cached preview data or null if not found/expired
   */
  static getCachedPreview(url: string): LinkPreviewData | null {
    const cached = this.previewCache.get(url);
    if (cached && Date.now() - cached.timestamp! < this.CACHE_TTL_MS) {
      return cached.data;
    }
    return null;
  }
}
