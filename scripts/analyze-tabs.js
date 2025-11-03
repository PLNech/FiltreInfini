#!/usr/bin/env node
/**
 * Comprehensive Tab Analysis Pipeline
 *
 * Uses all 3 models:
 * - Classification: Intent, Status, Content Type
 * - NER: Extract entities (people, organizations, locations)
 * - Embeddings: Compute semantic vectors for similarity
 *
 * Input: data/synced-tabs-*.json
 * Output: data/analysis-TIMESTAMP.json
 *
 * Run: node scripts/analyze-tabs.js [--all] [--limit N]
 */

import { pipeline, env } from '@xenova/transformers';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🤖 FiltreInfini Comprehensive Tab Analysis Pipeline

Usage: node scripts/analyze-tabs.js [options]

Options:
  --all              Analyze all tabs (default: limit to 100)
  --limit N          Analyze up to N tabs
  --batch-size N     Process N tabs at once (default: 10, improves speed)
  --help, -h         Show this help message

Examples:
  node scripts/analyze-tabs.js                    # Analyze 100 tabs, batch size 10
  node scripts/analyze-tabs.js --limit 50         # Analyze 50 tabs
  node scripts/analyze-tabs.js --all              # Analyze all tabs
  node scripts/analyze-tabs.js --batch-size 20    # Use larger batches (faster, more memory)

Output:
  Generates: data/analysis-TIMESTAMP.json

Models Used:
  - Classification: distilbert-base-uncased-mnli (Intent, Status, Content Type)
  - NER: bert-base-NER (People, Organizations, Locations)
  - Embeddings: all-MiniLM-L6-v2 (Semantic Similarity)

Performance Tips:
  - Larger batch sizes are faster but use more memory
  - Try --batch-size 20 for ~1.5-2x speedup
  - Try --batch-size 50 for ~2-3x speedup (requires ~4GB RAM)
`);
  process.exit(0);
}

const allFlag = args.includes('--all');
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : (allFlag ? 99999 : 100);

const batchSizeIndex = args.indexOf('--batch-size');
const BATCH_SIZE = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1]) : 10;

console.log('🤖 FiltreInfini Comprehensive Tab Analysis Pipeline\n');
console.log(`Settings: Analyze ${allFlag ? 'ALL' : 'up to ' + LIMIT} tabs, batch size ${BATCH_SIZE}`);
console.log(`Output: data/analysis-${Date.now()}.json\n`);

// Configure Transformers.js for local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = join(rootDir, 'lib/vendor/models/');
env.useBrowserCache = false;

/**
 * Load synced tabs from data directory
 */
function loadTabs() {
  const dataDir = join(rootDir, 'data');
  const files = readdirSync(dataDir).filter(f => f.startsWith('synced-tabs-'));

  if (files.length === 0) {
    throw new Error('No synced-tabs-*.json file found in data/');
  }

  // Use most recent file
  const file = files.sort().reverse()[0];
  console.log(`📖 Loading: ${file}`);

  const content = readFileSync(join(dataDir, file), 'utf-8');
  const clients = JSON.parse(content);

  const allTabs = [];
  for (const client of clients) {
    if (client.tabs) {
      for (const tab of client.tabs) {
        let domain = 'unknown';
        try {
          const url = new URL(tab.url);
          domain = url.hostname.replace(/^www\./, '');
        } catch (e) {
          // Invalid URL
        }

        allTabs.push({
          id: tab.url, // Use URL as stable ID
          title: tab.title,
          url: tab.url,
          domain: domain,
          lastUsed: tab.lastUsed,
          client: client.name
        });
      }
    }
  }

  return allTabs;
}

/**
 * Extract search query from URL if it's a search engine
 */
function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    const params = urlObj.searchParams;

    // DuckDuckGo
    if (domain.includes('duckduckgo')) {
      return params.get('q');
    }

    // Google
    if (domain.includes('google')) {
      return params.get('q');
    }

    // Bing
    if (domain.includes('bing')) {
      return params.get('q');
    }

    // Perplexity
    if (domain.includes('perplexity')) {
      return params.get('q');
    }

    // Brave Search
    if (domain.includes('brave.com') || domain.includes('search.brave')) {
      return params.get('q');
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract text features from tab
 */
function extractFeatures(tab) {
  const parts = [];

  if (tab.title && tab.title !== 'Untitled') {
    parts.push(tab.title);
  }

  if (tab.domain && tab.domain !== 'about') {
    parts.push(tab.domain);
  }

  if (tab.url) {
    try {
      const url = new URL(tab.url);
      const path = url.pathname.replace(/\//g, ' ').replace(/[_-]/g, ' ').trim();
      if (path && path.length > 0 && path !== ' ') {
        parts.push(path);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return parts.join(' ');
}

/**
 * Download Manager for fetching reading times with queue and retry logic
 */
class DownloadManager {
  constructor() {
    this.queue = [];
    this.results = new Map(); // url -> readingTime or null
    this.attempts = new Map(); // url -> attempt count
    this.domainLastFetch = new Map(); // domain -> timestamp of last fetch
    this.domainBackoff = new Map(); // domain -> backoff delay in ms
    this.MAX_RETRIES = 3;
    this.TIMEOUT_MS = 8000;
    this.MIN_DOMAIN_DELAY = 1000; // 1s between requests to same domain
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Get domain from URL
   */
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if we can fetch from this domain now (rate limiting)
   */
  canFetchDomain(domain) {
    const lastFetch = this.domainLastFetch.get(domain) || 0;
    const backoff = this.domainBackoff.get(domain) || this.MIN_DOMAIN_DELAY;
    const elapsed = Date.now() - lastFetch;
    return elapsed >= backoff;
  }

  /**
   * Mark domain as fetched
   */
  markDomainFetched(domain) {
    this.domainLastFetch.set(domain, Date.now());
  }

  /**
   * Increase backoff for domain (exponential)
   */
  increaseDomainBackoff(domain) {
    const currentBackoff = this.domainBackoff.get(domain) || this.MIN_DOMAIN_DELAY;
    const newBackoff = Math.min(currentBackoff * 2, 60000); // Max 60s
    this.domainBackoff.set(domain, newBackoff);
    console.log(`\n   [rate limit] ${domain} - increasing backoff to ${(newBackoff / 1000).toFixed(1)}s`);
  }

  /**
   * Reset backoff for domain (on success)
   */
  resetDomainBackoff(domain) {
    this.domainBackoff.set(domain, this.MIN_DOMAIN_DELAY);
  }

  /**
   * Add URL to fetch queue
   */
  add(url) {
    if (!url.startsWith('http')) {
      this.results.set(url, null);
      return;
    }
    this.queue.push(url);
    this.attempts.set(url, 0);
  }

  /**
   * Get result for a URL (blocking until available)
   */
  async getResult(url) {
    while (!this.results.has(url)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.results.get(url);
  }

  /**
   * Fetch a single URL (with archive.ph fallback for paywalls)
   */
  async fetchOne(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const attempt = this.attempts.get(url);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      };

      // On 2nd attempt, add Referer to look like natural navigation
      if (attempt >= 2) {
        const urlObj = new URL(url);
        headers['Referer'] = `${urlObj.protocol}//${urlObj.host}/`;
        headers['Sec-Fetch-Site'] = 'same-origin';
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Paywall/403 detected - try with different headers first, then archive.ph
      if (response.status === 403 || response.status === 402) {
        const attempt = this.attempts.get(url);

        // First retry: try with Referer header (looks like natural navigation)
        if (attempt === 1) {
          throw new Error(`HTTP 403 (will retry with referer)`);
        }

        // Second retry: try archive.ph
        if (attempt === 2) {
          console.log(`\n   [paywall] ${url} - trying archive.ph...`);
          return await this.fetchFromArchive(url);
        }

        // Third retry: give up
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Strip HTML tags and extract text content
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const wordCount = textContent.split(/\s+/).length;
      const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

      return readingTimeMinutes;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Try to fetch from archive.ph
   */
  async fetchFromArchive(originalUrl) {
    try {
      const archiveUrl = `https://archive.ph/${originalUrl}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(archiveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Archive HTTP ${response.status}`);
      }

      const html = await response.text();
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const wordCount = textContent.split(/\s+/).length;
      return Math.max(1, Math.round(wordCount / 200));
    } catch (error) {
      throw new Error(`Archive failed: ${error.message}`);
    }
  }

  /**
   * Process the queue sequentially with retries and per-domain rate limiting
   */
  async processQueue() {
    while (this.queue.length > 0) {
      const url = this.queue.shift();
      const domain = this.getDomain(url);

      // Check if we can fetch from this domain (rate limiting)
      if (!this.canFetchDomain(domain)) {
        // Can't fetch yet, add back to end of queue
        this.queue.push(url);
        // Wait a bit before trying next URL
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const attempt = this.attempts.get(url) + 1;
      this.attempts.set(url, attempt);

      try {
        const readingTime = await this.fetchOne(url);
        this.results.set(url, readingTime);
        this.successCount++;
        this.markDomainFetched(domain);
        this.resetDomainBackoff(domain); // Success: reset backoff
      } catch (error) {
        this.markDomainFetched(domain);

        // Handle 429 (rate limit) - increase backoff
        if (error.message.includes('429')) {
          this.increaseDomainBackoff(domain);
        }

        // Retry: add back to end of queue
        if (attempt < this.MAX_RETRIES) {
          console.log(`\n   [fetch error] ${url} (attempt ${attempt}/${this.MAX_RETRIES}): ${error.message} - queuing retry...`);
          this.queue.push(url); // Add to END of queue
        } else {
          // Final failure
          console.log(`\n   [fetch FAILED] ${url} (gave up after ${this.MAX_RETRIES} attempts): ${error.message}`);
          this.results.set(url, null);
          this.failureCount++;
        }
      }
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      success: this.successCount,
      failure: this.failureCount,
      pending: this.queue.length
    };
  }
}

/**
 * Classify tab using zero-shot classification
 */
async function classifyTab(tab, classifier) {
  const features = extractFeatures(tab);
  const maxChars = 512 * 4;
  const truncated = features.length > maxChars ? features.substring(0, maxChars) : features;

  if (!truncated || truncated.length < 3) {
    return null;
  }

  try {
    const labels = {
      intent: ['informational', 'navigational', 'transactional'],
      status: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
      contentType: ['content', 'communication', 'search']
    };

    const [intentResult, statusResult, contentTypeResult] = await Promise.all([
      classifier(truncated, labels.intent, { multi_label: true }),
      classifier(truncated, labels.status, { multi_label: true }),
      classifier(truncated, labels.contentType, { multi_label: true })
    ]);

    return {
      intent: { label: intentResult.labels[0], score: intentResult.scores[0], all: intentResult },
      status: { label: statusResult.labels[0], score: statusResult.scores[0], all: statusResult },
      contentType: { label: contentTypeResult.labels[0], score: contentTypeResult.scores[0], all: contentTypeResult }
    };
  } catch (error) {
    console.error(`Error classifying "${tab.title}":`, error.message);
    return null;
  }
}

/**
 * Reassemble NER entities by merging subword tokens (B- and I- tags)
 * Handles broken tagging where ##subwords are sometimes marked as B- instead of I-
 */
function reassembleEntities(nerResult) {
  const entities = [];
  let currentEntity = null;

  for (let i = 0; i < nerResult.length; i++) {
    const token = nerResult[i];
    const word = token.word.replace(/^##/g, ''); // Remove BERT ## prefix
    const tag = token.entity;
    const isSubword = token.word.startsWith('##'); // Check if this is a subword continuation
    const isBegin = tag.startsWith('B-');
    const isInside = tag.startsWith('I-');

    // Extract entity type (PER, ORG, LOC, MISC)
    const entityType = tag.replace(/^[BI]-/, '');

    // Special case: If this is a subword (##) but tagged as B-, treat it as I-
    // This handles broken NER output like: [B-PER] "Z", [B-PER] "##vi" (should be I-)
    const shouldContinue = isSubword && currentEntity && currentEntity.type === entityType;

    if (isBegin && !shouldContinue) {
      // Start new entity
      if (currentEntity) {
        entities.push(currentEntity);
      }
      currentEntity = {
        word: word,
        type: entityType,
        score: token.score
      };
    } else if ((isInside || shouldContinue) && currentEntity && currentEntity.type === entityType) {
      // Continue current entity
      if (isSubword) {
        currentEntity.word += word; // Merge directly (e.g., "Z" + "vi" = "Zvi")
      } else {
        currentEntity.word += ' ' + word; // Add space (e.g., "John" + "Smith")
      }
      // Average the score
      currentEntity.score = (currentEntity.score + token.score) / 2;
    } else {
      // Non-entity or type change - finish current entity
      if (currentEntity) {
        entities.push(currentEntity);
        currentEntity = null;
      }
    }
  }

  // Don't forget the last entity
  if (currentEntity) {
    entities.push(currentEntity);
  }

  return entities;
}

/**
 * Filter out low-quality entities (single letters, very short words, etc.)
 */
function filterEntities(entities) {
  return entities.filter(entity => {
    // Remove single letters
    if (entity.word.length <= 1) return false;

    // Remove very short words with low confidence
    if (entity.word.length <= 2 && entity.score < 0.9) return false;

    // Remove common noise words
    const noiseWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
    if (noiseWords.includes(entity.word.toLowerCase())) return false;

    return true;
  });
}

/**
 * Extract named entities using NER
 */
async function extractEntities(tab, ner) {
  const text = extractFeatures(tab);
  const maxChars = 512 * 4;
  const truncated = text.length > maxChars ? text.substring(0, maxChars) : text;

  if (!truncated || truncated.length < 3) {
    return { entities: [], people: [], organizations: [], locations: [], misc: [] };
  }

  try {
    const result = await ner(truncated);

    // Reassemble subword tokens into full entities
    const reassembled = reassembleEntities(result);

    // Filter out low-quality entities
    const filtered = filterEntities(reassembled);

    // Group by entity type
    const people = filtered.filter(e => e.type === 'PER');
    const organizations = filtered.filter(e => e.type === 'ORG');
    const locations = filtered.filter(e => e.type === 'LOC');
    const misc = filtered.filter(e => e.type === 'MISC');

    return {
      entities: result, // Keep raw for debugging
      people: people.slice(0, 5),
      organizations: organizations.slice(0, 5),
      locations: locations.slice(0, 5),
      misc: misc.slice(0, 5)
    };
  } catch (error) {
    console.error(`Error extracting entities from "${tab.title}":`, error.message);
    return { entities: [], people: [], organizations: [], locations: [], misc: [] };
  }
}

/**
 * Compute embeddings for semantic similarity
 */
async function computeEmbedding(tab, embedder) {
  const text = extractFeatures(tab);
  const maxChars = 512 * 4;
  const truncated = text.length > maxChars ? text.substring(0, maxChars) : text;

  if (!truncated || truncated.length < 3) {
    return null;
  }

  try {
    const result = await embedder(truncated, { pooling: 'mean', normalize: true });
    return Array.from(result.data); // Convert to regular array for JSON
  } catch (error) {
    console.error(`Error computing embedding for "${tab.title}":`, error.message);
    return null;
  }
}

/**
 * Compute cosine similarity between two embeddings
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find similar tabs for each tab
 */
function findSimilarTabs(analysisResults, topN = 5) {
  console.log('\n🔍 Computing similarity matrix...');

  for (let i = 0; i < analysisResults.length; i++) {
    if (i % 100 === 0) {
      process.stdout.write(`\r   Progress: ${i}/${analysisResults.length}`);
    }

    const tab = analysisResults[i];
    if (!tab.embedding) continue;

    const similarities = [];

    for (let j = 0; j < analysisResults.length; j++) {
      if (i === j) continue;

      const other = analysisResults[j];
      if (!other.embedding) continue;

      const similarity = cosineSimilarity(tab.embedding, other.embedding);
      similarities.push({
        id: other.id,
        title: other.title,
        domain: other.domain,
        similarity: similarity
      });
    }

    // Sort by similarity and take top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    tab.similarTabs = similarities.slice(0, topN);
  }

  console.log(`\r   Progress: ${analysisResults.length}/${analysisResults.length}`);
}

/**
 * Main analysis pipeline
 */
async function main() {
  try {
    // Load tabs
    const tabs = loadTabs();
    console.log(`✓ Loaded ${tabs.length} tabs\n`);

    // Limit analysis
    const sample = tabs.slice(0, Math.min(LIMIT, tabs.length));
    console.log(`📊 Analyzing ${sample.length} tabs with all 3 models...\n`);

    // Load all 3 models
    console.log('🔄 Loading models (this may take 60-90s)...\n');

    console.log('   [1/3] Loading classification model...');
    const startClassifier = Date.now();
    const classifier = await pipeline('zero-shot-classification', 'classification');
    console.log(`   ✓ Classification loaded in ${((Date.now() - startClassifier) / 1000).toFixed(1)}s`);

    console.log('   [2/3] Loading NER model...');
    const startNER = Date.now();
    const ner = await pipeline('token-classification', 'ner');
    console.log(`   ✓ NER loaded in ${((Date.now() - startNER) / 1000).toFixed(1)}s`);

    console.log('   [3/3] Loading embeddings model...');
    const startEmbeddings = Date.now();
    const embedder = await pipeline('feature-extraction', 'embeddings');
    console.log(`   ✓ Embeddings loaded in ${((Date.now() - startEmbeddings) / 1000).toFixed(1)}s\n`);

    // Initialize Download Manager and queue all URLs
    console.log(`📥 Initializing download manager for ${sample.length} URLs...\n`);
    const downloadManager = new DownloadManager();
    for (const tab of sample) {
      downloadManager.add(tab.url);
    }

    // Start processing queue in background
    const queuePromise = downloadManager.processQueue();

    // Analyze each tab in batches (ML models only)
    console.log(`🧠 Running comprehensive analysis (batches of ${BATCH_SIZE})...\n`);
    const results = [];
    const startAnalysis = Date.now();

    for (let batchStart = 0; batchStart < sample.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, sample.length);
      const batch = sample.slice(batchStart, batchEnd);

      const stats = downloadManager.getStats();
      process.stdout.write(`\r   Progress: ${batchEnd}/${sample.length} | DL: ${stats.success}✓ ${stats.failure}✗ ${stats.pending}⏳`);

      // Process batch: Run ML models in parallel
      const batchResults = await Promise.all(
        batch.map(async (tab) => {
          const [classification, entities, embedding] = await Promise.all([
            classifyTab(tab, classifier),
            extractEntities(tab, ner),
            computeEmbedding(tab, embedder)
          ]);

          // Extract search query if applicable
          const searchQuery = extractSearchQuery(tab.url);

          // Wait for reading time from download manager
          const readingTimeMinutes = await downloadManager.getResult(tab.url);

          return {
            ...tab,
            classification,
            entities,
            embedding,
            readingTimeMinutes: readingTimeMinutes || undefined,
            searchQuery: searchQuery || undefined,
            analyzedAt: Date.now()
          };
        })
      );

      results.push(...batchResults);
    }

    // Wait for all downloads to complete
    await queuePromise;

    const dlStats = downloadManager.getStats();
    console.log(`\r   Progress: ${sample.length}/${sample.length} | DL: ${dlStats.success}✓ ${dlStats.failure}✗ ${dlStats.pending}⏳`);

    const analysisTime = Date.now() - startAnalysis;
    console.log(`\n✓ Analysis complete in ${(analysisTime / 1000).toFixed(1)}s`);
    console.log(`  Average: ${Math.round(analysisTime / results.length)}ms per tab`);
    console.log(`  Reading time: ${dlStats.success} successful, ${dlStats.failure} failed (${((dlStats.success / results.length) * 100).toFixed(1)}% success rate)\n`);

    // Find similar tabs
    findSimilarTabs(results);

    // Generate summary statistics
    console.log('\n📊 Generating summary statistics...\n');

    const stats = {
      totalTabs: results.length,
      intent: {},
      status: {},
      contentType: {},
      topDomains: {},
      topEntities: { people: {}, organizations: {}, locations: {} },
      analyzedAt: Date.now()
    };

    for (const tab of results) {
      if (tab.classification) {
        const { intent, status, contentType } = tab.classification;
        stats.intent[intent.label] = (stats.intent[intent.label] || 0) + 1;
        stats.status[status.label] = (stats.status[status.label] || 0) + 1;
        stats.contentType[contentType.label] = (stats.contentType[contentType.label] || 0) + 1;
      }

      stats.topDomains[tab.domain] = (stats.topDomains[tab.domain] || 0) + 1;

      if (tab.entities) {
        for (const person of tab.entities.people) {
          stats.topEntities.people[person.word] = (stats.topEntities.people[person.word] || 0) + 1;
        }
        for (const org of tab.entities.organizations) {
          stats.topEntities.organizations[org.word] = (stats.topEntities.organizations[org.word] || 0) + 1;
        }
        for (const loc of tab.entities.locations) {
          stats.topEntities.locations[loc.word] = (stats.topEntities.locations[loc.word] || 0) + 1;
        }
      }
    }

    // Sort items (keep all, let UI control display limit)
    stats.topDomains = Object.entries(stats.topDomains)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});

    stats.topEntities.people = Object.entries(stats.topEntities.people)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});

    stats.topEntities.organizations = Object.entries(stats.topEntities.organizations)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});

    stats.topEntities.locations = Object.entries(stats.topEntities.locations)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});

    // Save results
    const outputFile = join(rootDir, 'data', `analysis-${Date.now()}.json`);
    const output = {
      metadata: {
        version: '1.0.0',
        analyzedAt: Date.now(),
        totalTabs: results.length,
        models: {
          classification: 'Xenova/distilbert-base-uncased-mnli',
          ner: 'Xenova/bert-base-NER',
          embeddings: 'Xenova/all-MiniLM-L6-v2'
        }
      },
      statistics: stats,
      tabs: results
    };

    writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`💾 Saved analysis: ${outputFile}`);
    console.log(`   File size: ${(Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(1)}MB\n`);

    // Count data completeness
    const withClassification = results.filter(r => r.classification).length;
    const withEntities = results.filter(r => r.entities && (r.entities.people.length > 0 || r.entities.organizations.length > 0 || r.entities.locations.length > 0)).length;
    const withEmbeddings = results.filter(r => r.embedding && r.embedding.length > 0).length;
    const withSimilar = results.filter(r => r.similarTabs && r.similarTabs.length > 0).length;
    const withSearchQuery = results.filter(r => r.searchQuery).length;

    // Print summary
    console.log('📈 Summary Statistics:\n');

    console.log('🤖 Model Coverage:');
    console.log(`  Classification:  ${withClassification}/${results.length} tabs (${((withClassification/results.length)*100).toFixed(1)}%)`);
    console.log(`  NER Entities:    ${withEntities}/${results.length} tabs with entities (${((withEntities/results.length)*100).toFixed(1)}%)`);
    console.log(`  Embeddings:      ${withEmbeddings}/${results.length} tabs (${((withEmbeddings/results.length)*100).toFixed(1)}%)`);
    console.log(`  Similarity:      ${withSimilar}/${results.length} tabs with similar tabs (${((withSimilar/results.length)*100).toFixed(1)}%)`);
    console.log(`  Search Queries:  ${withSearchQuery}/${results.length} tabs with extracted queries (${((withSearchQuery/results.length)*100).toFixed(1)}%)`);

    console.log('\n📊 Intent Distribution:');
    for (const [label, count] of Object.entries(stats.intent).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
    }

    console.log('\n📋 Status Distribution:');
    for (const [label, count] of Object.entries(stats.status).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
    }

    console.log('\n📄 Content Type Distribution:');
    for (const [label, count] of Object.entries(stats.contentType).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
    }

    console.log('\n🌐 Top 10 Domains:');
    let i = 1;
    for (const [domain, count] of Object.entries(stats.topDomains).slice(0, 10)) {
      console.log(`  ${i++}. ${domain.padEnd(35)} ${count.toString().padStart(4)} tabs`);
    }

    console.log('\n👤 Top 10 People:');
    i = 1;
    for (const [name, count] of Object.entries(stats.topEntities.people).slice(0, 10)) {
      console.log(`  ${i++}. ${name.padEnd(30)} ${count.toString().padStart(3)} mentions`);
    }

    console.log('\n🏢 Top 10 Organizations:');
    i = 1;
    for (const [org, count] of Object.entries(stats.topEntities.organizations).slice(0, 10)) {
      console.log(`  ${i++}. ${org.padEnd(30)} ${count.toString().padStart(3)} mentions`);
    }

    console.log('\n📍 Top 10 Locations:');
    i = 1;
    for (const [loc, count] of Object.entries(stats.topEntities.locations).slice(0, 10)) {
      console.log(`  ${i++}. ${loc.padEnd(30)} ${count.toString().padStart(3)} mentions`);
    }

    // Show some example search queries
    if (withSearchQuery > 0) {
      console.log('\n🔍 Example Search Queries:');
      const querySamples = results.filter(r => r.searchQuery).slice(0, 5);
      querySamples.forEach((tab, idx) => {
        console.log(`  ${idx + 1}. "${tab.searchQuery.substring(0, 60)}${tab.searchQuery.length > 60 ? '...' : ''}"`);
        console.log(`     ${tab.domain}`);
      });
    }

    console.log('\n✅ Analysis pipeline complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main();
