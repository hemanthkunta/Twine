import { config } from '../config/index.js';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  type?: string;
}

/**
 * Service for extracting and caching link preview metadata from URLs
 * Supports Open Graph, Twitter Card, and basic HTML meta tags
 */
export class LinkPreviewService {
  private static previewCache: Map<string, LinkPreviewData> = new Map();
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Fetch and parse link preview data for a given URL
   * @param url - The URL to extract preview data from
   * @returns Promise resolving to link preview metadata
   */
  static async fetchPreview(url: string): Promise<LinkPreviewData | null> {
    // Validate URL format
    if (!this.isValidUrl(url)) {
      return null;
    }

    // Check cache first
    const cached = this.previewCache.get(url);
    if (cached && Date.now() - cached.timestamp! < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      // Fetch the webpage content
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Aether-LinkPreview/1.0 (+https://aether-messaging.app/bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        redirect: 'follow',
        timeout: 10000, // 10 second timeout
      });

      if (!response.ok) {
        console.warn(`[LinkPreview] HTTP ${response.status} for ${url}`);
        return null;
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        console.warn(`[LinkPreview] Non-HTML content for ${url}: ${contentType}`);
        return null;
      }

      // Get response size limit (5MB max)
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > 5 * 1024 * 1024) {
        console.warn(`[LinkPreview] Response too large for ${url}: ${contentLength} bytes`);
        return null;
      }

      const html = await response.text();

      // Parse HTML for meta tags
      const previewData = this.parseHtmlForPreview(html, url);

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
    } catch (error) {
      console.error(`[LinkPreview] Error fetching preview for ${url}:`, error);
      return null;
    }
  }

  /**
   * Validate URL format and prevent SSRF attacks
   * @param url - URL to validate
   * @returns true if URL is valid and safe
   */
  private static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Only allow http and https schemes
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Prevent SSRF to localhost and private networks
      const hostname = urlObj.hostname.toLowerCase();
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '[::1]'
      ];

      if (blockedHosts.includes(hostname)) {
        return false;
      }

      // Block private IP ranges (simple check)
      if (
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') ||
        hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') ||
        hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') ||
        hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') ||
        hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') ||
        hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') ||
        hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') ||
        hostname.startsWith('172.31.')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse HTML string to extract Open Graph, Twitter Card, and basic meta tags
   * @param html - Raw HTML content
   * @param url - Original URL for fallback values
   * @returns Extracted preview data
   */
  private static parseHtmlForPreview(html: string, url: string): LinkPreviewData {
    const parser = new DOMParser();
    let doc: Document;

    try {
      doc = parser.parseFromString(html, 'text/html');
    } catch (e) {
      console.warn('[LinkPreview] Failed to parse HTML:', e);
      return { url };
    }

    const head = doc.head;
    if (!head) {
      return { url };
    }

    const previewData: LinkPreviewData = { url };

    // Helper to get meta tag content
    const getMetaContent = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const element = head.querySelector(selector);
        if (element) {
          const content = element.getAttribute('content');
          if (content) {
            return content.trim();
          }
        }
      }
      return null;
    };

    // Open Graph tags (priority)
    previewData.title = getMetaContent([
      'meta[property="og:title"]',
      'meta[name="og:title"]'
    ]) || previewData.title;

    previewData.description = getMetaContent([
      'meta[property="og:description"]',
      'meta[name="og:description"]'
    ]) || previewData.description;

    previewData.imageUrl = getMetaContent([
      'meta[property="og:image"]',
      'meta[name="og:image"]'
    ]) || previewData.imageUrl;

    previewData.siteName = getMetaContent([
      'meta[property="og:site_name"]',
      'meta[name="og:site_name"]'
    ]) || previewData.siteName;

    previewData.type = getMetaContent([
      'meta[property="og:type"]',
      'meta[name="og:type"]'
    ]) || previewData.type;

    // Twitter Card tags (fallback)
    if (!previewData.title) {
      previewData.title = getMetaContent([
        'meta[name="twitter:title"]'
      ]) || previewData.title;
    }

    if (!previewData.description) {
      previewData.description = getMetaContent([
        'meta[name="twitter:description"]'
      ]) || previewData.description;
    }

    if (!previewData.imageUrl) {
      previewData.imageUrl = getMetaContent([
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]'
      ]) || previewData.imageUrl;
    }

    // Basic HTML meta tags (fallback)
    if (!previewData.title) {
      const titleElement = doc.querySelector('title');
      if (titleElement) {
        previewData.title = titleElement.textContent?.trim();
      }
    }

    if (!previewData.description) {
      previewData.description = getMetaContent([
        'meta[name="description"]',
        'meta[property="description"]'
      ]) || previewData.description;
    }

    // Favicon
    previewData.faviconUrl = getMetaContent([
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ]);

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