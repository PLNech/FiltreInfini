/**
 * Brand Colors Database
 * Maps domain names to their brand hex colors
 * Source: BrandColors.json + manual additions for common domains
 */

const BRAND_COLORS = {
  // Social Media
  'youtube.com': '#c4302b',
  'facebook.com': '#3b5998',
  'twitter.com': '#00acee',
  'x.com': '#000000',
  'linkedin.com': '#0e76a8',
  'instagram.com': '#3f729b',
  'reddit.com': '#ff4500',
  'pinterest.com': '#c8232c',
  'tumblr.com': '#34526f',
  'tiktok.com': '#000000',
  'snapchat.com': '#fffc00',

  // Tech / Dev
  'github.com': '#171515',
  'stackoverflow.com': '#ef8236',
  'gitlab.com': '#fc6d26',
  'bitbucket.org': '#0052cc',
  'codepen.io': '#000000',
  'dribbble.com': '#ea4c89',
  'behance.net': '#053eff',
  'atlassian.com': '#003366',
  'atlassian.net': '#003366',
  'jira.com': '#003366',

  // News / Media
  'nytimes.com': '#000000',
  'theguardian.com': '#052962',
  'bbc.com': '#000000',
  'bbc.co.uk': '#000000',
  'cnn.com': '#cc0000',
  'medium.com': '#000000',
  'substack.com': '#ff6719',
  'hackernews.com': '#ff6600',
  'news.ycombinator.com': '#ff6600',
  'lemonde.fr': '#0c2135',
  'mediapart.fr': '#f7931e',
  'liberation.fr': '#e2001a',
  'thenewyorker.com': '#000000',

  // Shopping / Commerce
  'amazon.com': '#e47911',
  'amazon.fr': '#e47911',
  'ebay.com': '#89c507',
  'etsy.com': '#eb6d20',
  'shopify.com': '#96bf48',
  'stripe.com': '#008cdd',
  'paypal.com': '#1e477a',

  // Entertainment / Videos
  'twitch.tv': '#6441a5',
  'netflix.com': '#e50914',
  'spotify.com': '#81b71a',
  'soundcloud.com': '#ff7700',
  'vimeo.com': '#86c9ef',
  'dailymotion.com': '#0066dc',

  // Tech Companies
  'google.com': '#dd4b39',
  'microsoft.com': '#00a4ef',
  'apple.com': '#000000',
  'amazon.com': '#e47911',
  'meta.com': '#0668e1',
  'adobe.com': '#ff0000',
  'dropbox.com': '#3d9ae8',
  'evernote.com': '#5ba525',
  'notion.so': '#000000',
  'slack.com': '#4a154b',
  'discord.com': '#5865f2',
  'zoom.us': '#2d8cff',

  // French Sites
  'fnac.com': '#e1a925',
  'leboncoin.fr': '#ff6e14',
  'allocine.fr': '#fecc00',
  'billetreduc.com': '#ed1c24',
  'ticketmaster.fr': '#009cde',
  'sncf.com': '#82be00',
  'laposte.fr': '#fcdd09',

  // Documentation / Learning
  'wikipedia.org': '#000000',
  'stackoverflow.com': '#ef8236',
  'mdn.mozilla.org': '#000000',
  'w3schools.com': '#04aa6d',
  'docs.microsoft.com': '#0078d4',
  'developer.mozilla.org': '#000000',

  // Generic fallbacks
  '.edu': '#003366',
  '.gov': '#004990',
  '.org': '#008000',
};

/**
 * Get brand color for a domain
 * @param {string} domain - Domain name (e.g., "youtube.com")
 * @returns {string|null} Hex color or null if not found
 */
function getBrandColor(domain) {
  // Direct match
  if (BRAND_COLORS[domain]) {
    return BRAND_COLORS[domain];
  }

  // Try without subdomain (www.youtube.com -> youtube.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (BRAND_COLORS[rootDomain]) {
      return BRAND_COLORS[rootDomain];
    }
  }

  // Try TLD fallback (.edu, .gov, .org)
  const tld = '.' + parts[parts.length - 1];
  if (BRAND_COLORS[tld]) {
    return BRAND_COLORS[tld];
  }

  return null;
}

/**
 * Generate a consistent color from domain hash
 * Fallback for domains without brand colors
 * @param {string} domain - Domain name
 * @returns {string} Hex color
 */
function hashColor(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate muted, readable colors (avoid too bright/dark)
  const hue = Math.abs(hash) % 360;
  const saturation = 45 + (Math.abs(hash) % 30); // 45-75%
  const lightness = 40 + (Math.abs(hash) % 20);  // 40-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get color for domain with fallback
 * @param {string} domain - Domain name
 * @returns {string} Hex or HSL color string
 */
function getDomainColor(domain) {
  return getBrandColor(domain) || hashColor(domain);
}
