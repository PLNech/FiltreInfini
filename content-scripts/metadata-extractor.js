/**
 * Metadata Extractor - Content Script
 * Modular, extensible architecture for page metadata extraction
 *
 * Design:
 * - Each extractor is a pure function
 * - Easy to add new extractors
 * - Easy to disable extractors
 * - Runs only when requested (lazy)
 */

/**
 * Extract Open Graph tags
 * @returns {Object} OG metadata
 */
function extractOpenGraph() {
  const og = {};

  const ogTags = {
    title: 'og:title',
    description: 'og:description',
    image: 'og:image',
    type: 'og:type',
    siteName: 'og:site_name',
    url: 'og:url'
  };

  for (const [key, property] of Object.entries(ogTags)) {
    const element = document.querySelector(`meta[property="${property}"]`);
    og[key] = element ? element.getAttribute('content') : null;
  }

  return og;
}

/**
 * Extract standard meta tags
 * @returns {Object} Meta tag data
 */
function extractMetaTags() {
  const meta = {};

  // Description
  const description = document.querySelector('meta[name="description"]');
  meta.description = description ? description.getAttribute('content') : null;

  // Keywords
  const keywords = document.querySelector('meta[name="keywords"]');
  meta.keywords = keywords ? keywords.getAttribute('content') : null;

  // Author
  const author = document.querySelector('meta[name="author"]');
  meta.author = author ? author.getAttribute('content') : null;

  return meta;
}

/**
 * Extract content statistics
 * @returns {Object} Content analysis
 */
function extractContentStats() {
  const content = {};

  // Get visible text content
  const bodyText = document.body.innerText || '';

  // Word count
  const words = bodyText.trim().split(/\s+/).filter(w => w.length > 0);
  content.wordCount = words.length;

  // Reading time (200 WPM average)
  content.readingTimeMinutes = Math.max(1, Math.ceil(content.wordCount / 200));

  // Language detection (basic)
  const htmlLang = document.documentElement.lang;
  const metaLang = document.querySelector('meta[http-equiv="content-language"]');
  content.language = htmlLang || (metaLang ? metaLang.getAttribute('content') : null);

  return content;
}

/**
 * Detect HTTP status code
 * Note: Content scripts can't directly access HTTP status
 * We infer from page state
 * @returns {number|null} HTTP code (best guess)
 */
function detectHttpCode() {
  // Check for common error page indicators
  const title = document.title.toLowerCase();
  const bodyText = document.body.innerText.toLowerCase();

  // 404 detection
  if (
    title.includes('404') ||
    title.includes('not found') ||
    bodyText.includes('404') && bodyText.includes('not found')
  ) {
    return 404;
  }

  // 500 detection
  if (
    title.includes('500') ||
    title.includes('internal server error') ||
    title.includes('server error')
  ) {
    return 500;
  }

  // 403 detection
  if (
    title.includes('403') ||
    title.includes('forbidden') ||
    title.includes('access denied')
  ) {
    return 403;
  }

  // If page loaded and has content, assume 200
  if (document.readyState === 'complete' && bodyText.length > 100) {
    return 200;
  }

  // Unknown
  return null;
}

/**
 * Main extractor - runs all enabled extractors
 * @returns {Object} Complete metadata
 */
function extractAllMetadata() {
  return {
    version: 1,
    httpCode: detectHttpCode(),
    og: extractOpenGraph(),
    meta: extractMetaTags(),
    content: extractContentStats()
  };
}

/**
 * Message listener for background script
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractMetadata') {
    try {
      const metadata = extractAllMetadata();
      sendResponse({ success: true, metadata });
    } catch (error) {
      console.error('Metadata extraction failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Return true to indicate async response
  return true;
});

console.log('FiltreInfini metadata extractor loaded');
