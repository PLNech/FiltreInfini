/**
 * Tab Categorization System
 * Categorizes tabs into: Tech, Reading, Videos, Sorties (Events), Shopping, Social, etc.
 */

const CATEGORY_RULES = {
  // Tech & Development
  tech: {
    domains: [
      'github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com',
      'atlassian.com', 'atlassian.net', 'jira.com', 'confluence.com',
      'docs.microsoft.com', 'developer.mozilla.org', 'mdn.mozilla.org',
      'aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
      'codepen.io', 'codesandbox.io', 'replit.com', 'glitch.com',
      'npmjs.com', 'pypi.org', 'crates.io', 'packagist.org',
      'hackernews.com', 'news.ycombinator.com', 'lobste.rs',
      'dev.to', 'hashnode.com', 'freecodecamp.org'
    ],
    patterns: [/api\./i, /docs\./i, /developer\./i],
    color: '#3B82F6',
    icon: '💻'
  },

  // Reading (Articles, Blogs, News)
  reading: {
    domains: [
      'medium.com', 'substack.com', 'newyorker.com', 'theatlantic.com',
      'nytimes.com', 'theguardian.com', 'bbc.com', 'bbc.co.uk',
      'lemonde.fr', 'mediapart.fr', 'liberation.fr', 'lefigaro.fr',
      'wikipedia.org', 'en.wikipedia.org', 'fr.wikipedia.org',
      'aeon.co', 'longreads.com', 'pocket.com', 'instapaper.com',
      'scribd.com', 'goodreads.com', 'arxiv.org'
    ],
    extensions: ['.pdf', '.epub', '.doc', '.docx'],
    patterns: [/\/blog\//i, /\/article\//i, /\/post\//i, /\/read\//i],
    color: '#F59E0B',
    icon: '📚'
  },

  // Videos & Streaming
  videos: {
    domains: [
      'youtube.com', 'youtu.be', 'twitch.tv', 'vimeo.com',
      'dailymotion.com', 'netflix.com', 'primevideo.com',
      'disneyplus.com', 'hulu.com', 'crunchyroll.com',
      'arte.tv', 'france.tv', 'ina.fr'
    ],
    patterns: [/\/watch/i, /\/video/i, /\/stream/i],
    color: '#EF4444',
    icon: '🎬'
  },

  // Sorties (Events, Concerts, Culture)
  sorties: {
    domains: [
      'billetreduc.com', 'fnac.com', 'ticketmaster.fr', 'ticketmaster.com',
      'seetickets.com', 'dice.fm', 'songkick.com', 'bandsintown.com',
      'eventbrite.com', 'eventbrite.fr', 'meetup.com',
      'allocine.fr', 'imdb.com', 'senscritique.com',
      'timeout.com', 'parisinfo.com', 'sortiraparis.com'
    ],
    keywords: ['concert', 'festival', 'spectacle', 'theatre', 'cinema',
               'exposition', 'musee', 'museum', 'event', 'ticket'],
    patterns: [/concert/i, /festival/i, /event/i, /ticket/i],
    color: '#8B5CF6',
    icon: '🎭'
  },

  // Shopping & Commerce
  shopping: {
    domains: [
      'amazon.com', 'amazon.fr', 'ebay.com', 'ebay.fr',
      'etsy.com', 'aliexpress.com', 'alibaba.com',
      'leboncoin.fr', 'vinted.fr', 'wallapop.com',
      'fnac.com', 'darty.com', 'boulanger.com',
      'cdiscount.com', 'ldlc.com', 'materiel.net'
    ],
    patterns: [/\/shop\//i, /\/store\//i, /\/cart\//i, /\/checkout/i],
    color: '#10B981',
    icon: '🛒'
  },

  // Social Media
  social: {
    domains: [
      'facebook.com', 'twitter.com', 'x.com', 'linkedin.com',
      'instagram.com', 'reddit.com', 'pinterest.com',
      'tiktok.com', 'snapchat.com', 'mastodon.social',
      'discord.com', 'slack.com', 'telegram.org'
    ],
    color: '#EC4899',
    icon: '💬'
  },

  // Work / Productivity
  work: {
    domains: [
      'mail.google.com', 'outlook.com', 'office.com',
      'notion.so', 'evernote.com', 'onenote.com',
      'trello.com', 'asana.com', 'monday.com',
      'zoom.us', 'meet.google.com', 'teams.microsoft.com',
      'drive.google.com', 'dropbox.com', 'box.com'
    ],
    patterns: [/calendar/i, /mail/i, /drive/i, /meeting/i],
    color: '#64748B',
    icon: '💼'
  }
};

/**
 * Categorize a tab based on URL, title, and domain
 * @param {Object} tab - Tab object with url and title
 * @returns {Object} { category: string, color: string, icon: string }
 */
function categorizeTab(tab) {
  const url = tab.url.toLowerCase();
  const title = tab.title.toLowerCase();
  const domain = extractDomain(url);

  for (const [categoryName, rules] of Object.entries(CATEGORY_RULES)) {
    // Check domains
    if (rules.domains && rules.domains.some(d => domain.includes(d))) {
      return {
        category: categoryName,
        color: rules.color,
        icon: rules.icon
      };
    }

    // Check file extensions
    if (rules.extensions && rules.extensions.some(ext => url.endsWith(ext))) {
      return {
        category: categoryName,
        color: rules.color,
        icon: rules.icon
      };
    }

    // Check URL patterns
    if (rules.patterns && rules.patterns.some(pattern => pattern.test(url))) {
      return {
        category: categoryName,
        color: rules.color,
        icon: rules.icon
      };
    }

    // Check keywords in title
    if (rules.keywords && rules.keywords.some(keyword => title.includes(keyword))) {
      return {
        category: categoryName,
        color: rules.color,
        icon: rules.icon
      };
    }
  }

  // Default category
  return {
    category: 'other',
    color: '#6B7280',
    icon: '🌐'
  };
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain or empty string
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Get tabs grouped by category
 * @param {Array} tabs - Array of tab objects
 * @returns {Object} Object with categories as keys, arrays of tabs as values
 */
function groupTabsByCategory(tabs) {
  const grouped = {};

  for (const tab of tabs) {
    const { category } = categorizeTab(tab);
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(tab);
  }

  return grouped;
}

/**
 * Get category statistics
 * @param {Array} tabs - Array of tab objects
 * @returns {Object} Object with category counts
 */
function getCategoryStats(tabs) {
  const stats = {};

  for (const tab of tabs) {
    const { category } = categorizeTab(tab);
    stats[category] = (stats[category] || 0) + 1;
  }

  return stats;
}
