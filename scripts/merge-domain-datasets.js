#!/usr/bin/env node

/**
 * merge-domain-datasets.js
 *
 * Fetches and merges domain categorization datasets from multiple GitHub sources
 * to create a comprehensive domains-100k.json file.
 *
 * Data Sources:
 * 1. UT1 Blacklist (olbat/ut1-blacklists) - 81 categories, ~500k domains
 * 2. Moz Top 500 (Kikobeats/top-sites) - 500 popular domains
 * 3. Existing domains-100k.json - ~1k manually curated domains
 *
 * Target Categories:
 * gaming, adult, productivity, learning, entertainment, finance, health,
 * sports, travel, tech, blog, social, shopping, news, video, other
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Category mapping from UT1 blacklist to our taxonomy
const UT1_CATEGORY_MAP = {
  // Gaming
  'games': 'gaming',
  'educational_games': 'gaming',
  'gambling': 'gaming',

  // Adult
  'adult': 'adult',
  'lingerie': 'adult',
  'mixed_adult': 'adult',
  'sexual_education': 'adult',
  'dating': 'adult',
  'porn': 'adult',

  // Productivity
  'webmail': 'productivity',
  'mail': 'productivity',
  'filehosting': 'productivity',
  'webhosting': 'productivity',
  'cloud': 'productivity',

  // Learning
  'educational': 'learning',
  'science': 'learning',
  'library': 'learning',
  'university': 'learning',

  // Entertainment
  'audio-video': 'entertainment',
  'streaming': 'entertainment',
  'radio': 'entertainment',
  'celebrity': 'entertainment',
  'music': 'entertainment',
  'movies': 'entertainment',

  // Finance
  'financial': 'finance',
  'bank': 'finance',
  'banking': 'finance',
  'bitcoin': 'finance',
  'cryptocurrency': 'finance',
  'trading': 'finance',

  // Health
  'health': 'health',
  'medical': 'health',
  'hospitals': 'health',
  'pharmacy': 'health',

  // Sports
  'sports': 'sports',
  'fitness': 'sports',

  // Travel
  'travel': 'travel',
  'tourism': 'travel',
  'hotels': 'travel',
  'flights': 'travel',

  // Tech
  'computer': 'tech',
  'software': 'tech',
  'hardware': 'tech',
  'mobile-phone': 'tech',
  'download': 'tech',
  'open_source': 'tech',

  // Blog
  'blog': 'blog',
  'personal': 'blog',
  'forums': 'blog',

  // Jobs & Services
  'jobsearch': 'other',
  'translation': 'productivity',
  'cleaning': 'other',

  // Other
  'astrology': 'entertainment',
  'associations_religieuses': 'other',
  'cooking': 'entertainment',
  'marketingware': 'tech',
  'ai': 'tech',
  'update': 'tech',
  'arjel': 'gaming',
  'manga': 'entertainment',

  // Social
  'social_networks': 'social',
  'chat': 'social',
  'instant_messaging': 'social',

  // Shopping
  'shopping': 'shopping',
  'marketplace': 'shopping',
  'auctions': 'shopping',
  'classifieds': 'shopping',

  // News
  'press': 'news',
  'news': 'news',
  'media': 'news',
  'politics': 'news',

  // Video
  'video': 'video',
  'youtube': 'video',
  'vimeo': 'video',
  'livestream': 'video'
};

// Domains to skip (sensitive, security, or non-content)
const SKIP_UT1_CATEGORIES = [
  'malware', 'phishing', 'hacking', 'ddos', 'cryptojacking', 'stalkerware',
  'proxy', 'vpn', 'redirector', 'shortener', 'dangerous_material', 'sect',
  'fakenews', 'agressif', 'violence', 'drugs', 'warez', 'drogue', 'child'
];

// Manual category assignments for popular domains
const MANUAL_CATEGORIES = {
  'google.com': 'tech',
  'youtube.com': 'video',
  'facebook.com': 'social',
  'twitter.com': 'social',
  'instagram.com': 'social',
  'linkedin.com': 'social',
  'reddit.com': 'social',
  'wikipedia.org': 'learning',
  'amazon.com': 'shopping',
  'ebay.com': 'shopping',
  'netflix.com': 'entertainment',
  'spotify.com': 'entertainment',
  'github.com': 'tech',
  'stackoverflow.com': 'tech',
  'nytimes.com': 'news',
  'bbc.com': 'news',
  'cnn.com': 'news',
  'medium.com': 'blog',
  'blogger.com': 'blog',
  'wordpress.com': 'blog',
  'airbnb.com': 'travel',
  'booking.com': 'travel',
  'chase.com': 'finance',
  'paypal.com': 'finance',
  'webmd.com': 'health',
  'mayoclinic.org': 'health',
  'espn.com': 'sports',
  'nba.com': 'sports',
  'steam.com': 'gaming',
  'twitch.tv': 'gaming'
};

// Utility: Normalize domain (remove www, lowercase)
function normalizeDomain(domain) {
  return domain.toLowerCase()
    .replace(/^www\./, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim();
}

// Utility: HTTPS GET request
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      });
    }).on('error', reject);
  });
}

// Fetch UT1 blacklist category
async function fetchUT1Category(category) {
  const url = `https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/${category}/domains`;
  console.log(`Fetching UT1 category: ${category}...`);

  try {
    const data = await httpsGet(url);
    const domains = data.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    console.log(`  ✓ Found ${domains.length} domains in ${category}`);
    return domains;
  } catch (error) {
    console.log(`  ✗ Failed to fetch ${category}: ${error.message}`);
    return [];
  }
}

// Fetch Moz Top 500 sites
async function fetchMozTop500() {
  const url = 'https://raw.githubusercontent.com/Kikobeats/top-sites/master/top-sites.json';
  console.log('Fetching Moz Top 500...');

  try {
    const data = await httpsGet(url);
    const sites = JSON.parse(data);
    console.log(`  ✓ Found ${sites.length} top sites`);
    return sites.map(site => normalizeDomain(site.rootDomain));
  } catch (error) {
    console.log(`  ✗ Failed to fetch Moz Top 500: ${error.message}`);
    return [];
  }
}

// Load existing domains-100k.json
function loadExistingDomains() {
  const filePath = path.join(__dirname, '..', 'domains-100k.json');
  console.log('Loading existing domains-100k.json...');

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);
    console.log(`  ✓ Loaded ${json.count} existing domains`);
    return json.categories || {};
  } catch (error) {
    console.log(`  ✗ Failed to load existing file: ${error.message}`);
    return {};
  }
}

// Main merge function
async function mergeDomainDatasets() {
  console.log('='.repeat(60));
  console.log('Domain Dataset Merger');
  console.log('='.repeat(60));
  console.log();

  // Start with existing domains
  const mergedDomains = loadExistingDomains();
  const stats = {
    sources: [],
    categories: {},
    total: 0
  };

  // Add manual categories for top sites
  console.log('\nAdding manual categories for popular domains...');
  for (const [domain, category] of Object.entries(MANUAL_CATEGORIES)) {
    const normalized = normalizeDomain(domain);
    if (!mergedDomains[normalized]) {
      mergedDomains[normalized] = category;
    }
  }

  // Fetch Moz Top 500 (for coverage, will assign categories later)
  const topSites = await fetchMozTop500();
  for (const domain of topSites) {
    if (!mergedDomains[domain] && MANUAL_CATEGORIES[domain]) {
      mergedDomains[domain] = MANUAL_CATEGORIES[domain];
    } else if (!mergedDomains[domain]) {
      mergedDomains[domain] = 'other';
    }
  }

  // Fetch UT1 categories
  console.log('\nFetching UT1 blacklist categories...');
  console.log('(This will take a few minutes)');
  console.log();

  const ut1Categories = [
    // Adult
    'adult', 'lingerie', 'mixed_adult', 'sexual_education', 'dating', 'manga',
    // Gaming
    'games', 'gambling', 'educational_games',
    // Productivity
    'webmail', 'mail', 'filehosting', 'webhosting',
    // Entertainment
    'audio-video', 'radio', 'celebrity', 'cooking',
    // Finance
    'financial', 'bank', 'bitcoin', 'arjel',
    // Sports
    'sports',
    // Tech
    'mobile-phone', 'download', 'ai', 'update',
    // Blog
    'blog', 'forums',
    // Social
    'social_networks', 'chat',
    // Shopping
    'shopping', 'marketingware',
    // News
    'press',
    // Jobs (can map to 'other' or 'productivity')
    'jobsearch',
    // Translation, cleaning (can map to services)
    'translation', 'cleaning',
    // Astrology, religion
    'astrology', 'associations_religieuses'
  ];

  let ut1Count = 0;
  for (const ut1Cat of ut1Categories) {
    if (SKIP_UT1_CATEGORIES.includes(ut1Cat)) {
      continue;
    }

    const ourCategory = UT1_CATEGORY_MAP[ut1Cat];
    if (!ourCategory) {
      console.log(`  ⚠ Skipping ${ut1Cat} (no mapping)`);
      continue;
    }

    const domains = await fetchUT1Category(ut1Cat);

    for (const domain of domains.slice(0, 5000)) { // Limit per category
      const normalized = normalizeDomain(domain);
      if (!normalized || normalized.includes('*') || normalized.includes('/')) {
        continue;
      }

      // Only add if not already categorized or if current is 'other'
      if (!mergedDomains[normalized] || mergedDomains[normalized] === 'other') {
        mergedDomains[normalized] = ourCategory;
        ut1Count++;
      }
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  stats.sources.push({
    name: 'UT1 Blacklist',
    url: 'https://github.com/olbat/ut1-blacklists',
    domains: ut1Count
  });

  stats.sources.push({
    name: 'Moz Top 500',
    url: 'https://github.com/Kikobeats/top-sites',
    domains: topSites.length
  });

  stats.sources.push({
    name: 'Existing domains-100k.json',
    url: 'manual curation',
    domains: Object.keys(loadExistingDomains()).length
  });

  // Calculate category stats
  for (const category of Object.values(mergedDomains)) {
    stats.categories[category] = (stats.categories[category] || 0) + 1;
  }

  stats.total = Object.keys(mergedDomains).length;

  // Create output
  const output = {
    version: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    updated: new Date().toISOString(),
    count: stats.total,
    sources: stats.sources,
    categories: Object.fromEntries(
      Object.entries(mergedDomains).sort((a, b) => a[0].localeCompare(b[0]))
    )
  };

  // Write to file
  const outputPath = path.join(__dirname, '..', 'domains-100k.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

  // Print statistics
  console.log();
  console.log('='.repeat(60));
  console.log('Merge Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log(`Total domains: ${stats.total.toLocaleString()}`);
  console.log();
  console.log('Category breakdown:');
  for (const [cat, count] of Object.entries(stats.categories).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(15)} ${count.toLocaleString().padStart(7)} (${pct}%)`);
  }
  console.log();
  console.log('Sources:');
  for (const source of stats.sources) {
    console.log(`  ${source.name}`);
    console.log(`    ${source.url}`);
    console.log(`    ${source.domains.toLocaleString()} domains`);
    console.log();
  }
  console.log(`Output written to: ${outputPath}`);
  console.log();
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  mergeDomainDatasets().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { mergeDomainDatasets, normalizeDomain };
