#!/usr/bin/env node
/**
 * Classify tabs from synced data using local ML model
 * Run: node scripts/classify-tabs.js [--limit N] [--sample N]
 */

import { pipeline, env } from '@xenova/transformers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const sampleIndex = args.indexOf('--sample');

const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 10;
const SAMPLE = sampleIndex !== -1 ? parseInt(args[sampleIndex + 1]) : 100;

console.log('🤖 FiltreInfini ML Classification Script\n');
console.log(`Settings: Analyze ${SAMPLE} tabs, show top ${LIMIT} results\n`);

// Configure Transformers.js for local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = join(rootDir, 'lib/vendor/models/');
env.useBrowserCache = false;

console.log('📂 Model path:', env.localModelPath);

/**
 * Load synced tabs from data directory
 */
function loadTabs() {
  const dataDir = join(rootDir, 'data');
  const files = readFileSync(join(dataDir, 'synced-tabs-1762162517587.json'), 'utf-8');
  const clients = JSON.parse(files);

  const allTabs = [];
  for (const client of clients) {
    if (client.tabs) {
      for (const tab of client.tabs) {
        // Extract domain from URL
        let domain = 'unknown';
        try {
          const url = new URL(tab.url);
          domain = url.hostname.replace(/^www\./, '');
        } catch (e) {
          // Invalid URL
        }

        allTabs.push({
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
 * Extract features from tab (title + domain + URL path)
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

  const text = parts.join(' ');
  const maxChars = 512 * 4; // Token limit approximation
  return text.length > maxChars ? text.substring(0, maxChars) : text;
}

/**
 * Classify a single tab
 */
async function classifyTab(tab, classifier) {
  const features = extractFeatures(tab);

  if (!features || features.length < 3) {
    return null;
  }

  try {
    // Run 3D classification in parallel
    const labels = {
      intent: ['informational', 'navigational', 'transactional'],
      status: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
      contentType: ['content', 'communication', 'search']
    };

    const [intentResult, statusResult, contentTypeResult] = await Promise.all([
      classifier(features, labels.intent, { multi_label: true }),
      classifier(features, labels.status, { multi_label: true }),
      classifier(features, labels.contentType, { multi_label: true })
    ]);

    // Get top prediction for each dimension
    const intent = intentResult.labels[0];
    const status = statusResult.labels[0];
    const contentType = contentTypeResult.labels[0];

    return {
      tab: {
        title: tab.title.substring(0, 60),
        domain: tab.domain
      },
      classifications: {
        intent: { label: intent, score: intentResult.scores[0] },
        status: { label: status, score: statusResult.scores[0] },
        contentType: { label: contentType, score: contentTypeResult.scores[0] }
      }
    };
  } catch (error) {
    console.error(`Error classifying tab "${tab.title}":`, error.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Load tabs
    console.log('📖 Loading tabs from sync data...');
    const tabs = loadTabs();
    console.log(`✓ Loaded ${tabs.length} tabs\n`);

    // Sample tabs for analysis
    const sampleSize = Math.min(SAMPLE, tabs.length);
    const sample = tabs.slice(0, sampleSize);
    console.log(`📊 Analyzing ${sampleSize} tabs...\n`);

    // Load classification model
    console.log('🔄 Loading classification model...');
    console.log('   (This may take 20-60s on first run)\n');

    const startLoad = Date.now();
    const classifier = await pipeline(
      'zero-shot-classification',
      'classification', // Local model directory
      {
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            const pct = Math.floor(progress.progress);
            if (pct % 20 === 0) {
              process.stdout.write(`\r   Loading: ${pct}%`);
            }
          } else if (progress.status === 'done') {
            process.stdout.write(`\r   ✓ Loaded: ${progress.file}\n`);
          }
        }
      }
    );
    const loadTime = Date.now() - startLoad;
    console.log(`\n✓ Model loaded in ${(loadTime / 1000).toFixed(1)}s\n`);

    // Classify sample
    console.log('🧠 Classifying tabs...\n');
    const results = [];
    const startClassify = Date.now();

    for (let i = 0; i < sample.length; i++) {
      if (i % 10 === 0) {
        process.stdout.write(`\r   Progress: ${i}/${sample.length}`);
      }

      const result = await classifyTab(sample[i], classifier);
      if (result) {
        results.push(result);
      }
    }

    const classifyTime = Date.now() - startClassify;
    console.log(`\r   Progress: ${sample.length}/${sample.length}`);
    console.log(`\n✓ Classified ${results.length} tabs in ${(classifyTime / 1000).toFixed(1)}s`);
    console.log(`  Average: ${Math.round(classifyTime / results.length)}ms per tab\n`);

    // Show top results
    console.log(`\n📈 Top ${LIMIT} Classification Results:\n`);
    console.log('─'.repeat(80));

    for (let i = 0; i < Math.min(LIMIT, results.length); i++) {
      const r = results[i];
      console.log(`\n${i + 1}. ${r.tab.title}`);
      console.log(`   Domain: ${r.tab.domain}`);
      console.log(`   Intent: ${r.classifications.intent.label} (${(r.classifications.intent.score * 100).toFixed(1)}%)`);
      console.log(`   Status: ${r.classifications.status.label} (${(r.classifications.status.score * 100).toFixed(1)}%)`);
      console.log(`   Type: ${r.classifications.contentType.label} (${(r.classifications.contentType.score * 100).toFixed(1)}%)`);
    }

    console.log('\n' + '─'.repeat(80));

    // Summary stats
    console.log('\n📊 Classification Summary:\n');

    const stats = {
      intent: {},
      status: {},
      contentType: {}
    };

    for (const result of results) {
      const { intent, status, contentType } = result.classifications;

      stats.intent[intent.label] = (stats.intent[intent.label] || 0) + 1;
      stats.status[status.label] = (stats.status[status.label] || 0) + 1;
      stats.contentType[contentType.label] = (stats.contentType[contentType.label] || 0) + 1;
    }

    console.log('Intent Distribution:');
    for (const [label, count] of Object.entries(stats.intent).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(3)} (${pct}%)`);
    }

    console.log('\nStatus Distribution:');
    for (const [label, count] of Object.entries(stats.status).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(3)} (${pct}%)`);
    }

    console.log('\nContent Type Distribution:');
    for (const [label, count] of Object.entries(stats.contentType).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / results.length) * 100).toFixed(1);
      console.log(`  ${label.padEnd(20)} ${count.toString().padStart(3)} (${pct}%)`);
    }

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main();
