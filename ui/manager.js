/**
 * Tab Manager UI Controller
 * Handles UI interactions and updates
 */

// State
let currentTabs = [];
let allTabs = []; // Keep full list for filtering
let selectedTabIds = new Set();
let domainCounts = {}; // Track tab counts per domain
let filterCounts = {}; // Track tab counts per age filter
let categoryFilterActive = null; // Currently active category filter
let showInternalTabs = false; // Show internal tabs (about:, moz-extension:, etc.)
let searchDebounceTimer = null;
let currentSortMode = 'lastAccessed'; // Default sort
let currentView = 'list'; // 'list' or 'groups'

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('FiltreInfini manager loaded');

  // Start ML model pre-loading in background (non-blocking)
  startModelPreloading();

  // Initial load
  await loadAllTabs();
  await updateStatistics();

  // Set up event listeners
  setupEventListeners();
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Query controls with instant search
  const queryInput = document.getElementById('query-input');
  const clearBtn = document.getElementById('clear-query-btn');

  queryInput.addEventListener('input', (e) => {
    handleSearchInput();
    // Show/hide clear button based on input
    clearBtn.style.display = e.target.value ? 'flex' : 'none';
  });

  clearBtn.addEventListener('click', handleClearQuery);

  // Quick filters (age)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleQuickFilter(e.target.dataset.filter));
  });

  // Category filters
  document.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleCategoryFilter(e.target.dataset.category));
  });

  // Source filters
  document.querySelectorAll('.source-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleSourceFilter(e.target.dataset.source));
  });

  // Bulk actions
  document.getElementById('bulk-main-btn').addEventListener('click', () => handleBulkGroup('main'));
  document.getElementById('bulk-staging-btn').addEventListener('click', () => handleBulkGroup('staging'));
  document.getElementById('bulk-bin-btn').addEventListener('click', () => handleBulkGroup('bin'));
  document.getElementById('bulk-close-btn').addEventListener('click', handleBulkClose);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Fetch All Metadata
  document.getElementById('fetch-all-btn').addEventListener('click', handleFetchAll);
  document.getElementById('classify-all-btn').addEventListener('click', handleClassifyAll);

  // API Test
  document.getElementById('api-test-btn').addEventListener('click', handleApiTest);

  // Sort dropdown
  document.getElementById('sort-select').addEventListener('change', handleSortChange);

  // View switcher
  document.getElementById('view-list-btn').addEventListener('click', () => switchView('list'));
  document.getElementById('view-groups-btn').addEventListener('click', () => switchView('groups'));

  // Import synced tabs
  document.getElementById('import-sync-btn').addEventListener('click', handleImportSyncClick);
  document.getElementById('sync-file-input').addEventListener('change', handleSyncFileSelected);
  document.getElementById('import-guide-close-btn').addEventListener('click', closeImportGuideModal);
  document.getElementById('choose-file-btn').addEventListener('click', () => {
    document.getElementById('sync-file-input').click();
  });
  document.getElementById('copy-script-btn').addEventListener('click', handleCopyScript);

  // Close modal on overlay click
  document.getElementById('import-guide-modal').querySelector('.modal__overlay').addEventListener('click', closeImportGuideModal);

  // ML Debug Modal
  const mlDebugBtn = document.getElementById('ml-debug-btn');
  if (mlDebugBtn) {
    mlDebugBtn.addEventListener('click', openMLDebugModal);
  }

  const mlDebugModal = document.getElementById('ml-debug-modal');
  if (mlDebugModal) {
    document.getElementById('ml-debug-close-btn').addEventListener('click', closeMLDebugModal);
    mlDebugModal.querySelector('.modal__overlay').addEventListener('click', closeMLDebugModal);

    // ML Debug Actions
    document.querySelectorAll('.ml-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => loadMLPreset(e.target.dataset.preset));
    });
    document.getElementById('ml-classify-single-btn').addEventListener('click', handleMLClassifySingle);
    document.getElementById('ml-classify-batch-btn').addEventListener('click', handleMLClassifyBatch);
    document.getElementById('ml-test-context-btn').addEventListener('click', handleMLTestContext);

    // Individual model testing
    document.getElementById('test-embeddings-btn').addEventListener('click', handleTestEmbeddings);
    document.getElementById('test-classification-btn').addEventListener('click', handleTestClassification);
    document.getElementById('test-ner-btn').addEventListener('click', handleTestNER);
    document.getElementById('check-model-cache-btn').addEventListener('click', handleCheckModelCache);
  }
}

/**
 * Handle search input with debouncing (search-as-you-type)
 */
function handleSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    handleRunQuery();
  }, 300); // 300ms debounce
}

/**
 * Load all tabs and display
 */
async function loadAllTabs() {
  // Get local tabs
  const localTabs = await tabQuery.getAllTabsWithMetadata(showInternalTabs);

  // Mark all local tabs with source
  for (const tab of localTabs) {
    tab.source = 'local';
  }

  // Get synced tabs from storage
  const syncedTabs = await loadSyncedTabs();

  // Deduplicate by URL: prefer local tabs over synced tabs
  const urlMap = new Map();

  // Add local tabs first (they take priority)
  for (const tab of localTabs) {
    urlMap.set(tab.url, tab);
  }

  // Add synced tabs only if URL doesn't exist in local tabs
  let duplicateCount = 0;
  for (const tab of syncedTabs) {
    if (!urlMap.has(tab.url)) {
      urlMap.set(tab.url, tab);
    } else {
      duplicateCount++;
    }
  }

  if (duplicateCount > 0) {
    console.log(`[Dedup] Removed ${duplicateCount} duplicate URLs (already open locally)`);
  }

  // Merge deduplicated tabs
  allTabs = Array.from(urlMap.values());
  currentTabs = allTabs;

  // Calculate domain counts (across both local and synced)
  // Normalize domains to merge www/m variants
  domainCounts = {};
  for (const tab of allTabs) {
    const normalizedDomain = normalizeDomain(tab.domain);
    domainCounts[normalizedDomain] = (domainCounts[normalizedDomain] || 0) + 1;
  }

  // Calculate filter counts
  await updateFilterCounts();

  await renderTabList(currentTabs);

  // Auto-fetch metadata in background (only if not already cached)
  prefetchMetadataInBackground();
}

/**
 * Prefetch metadata for all tabs in the background
 * Only fetches tabs that don't have cached metadata yet
 * Works for both local tabs (via content scripts) and synced tabs (via direct URL fetch)
 */
async function prefetchMetadataInBackground() {
  console.log('[Metadata] Starting background prefetch...');

  try {
    await metadataManager.prefetchMetadata(allTabs);
    console.log('[Metadata] Background prefetch complete');

    // Re-render to show thumbnails and reading times
    await renderTabList(currentTabs);
  } catch (error) {
    console.error('[Metadata] Background prefetch failed:', error);
  }
}

/**
 * Handle Fetch All button - force refresh all metadata
 */
async function handleFetchAll() {
  const btn = document.getElementById('fetch-all-btn');
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = '⏳ Fetching...';

  try {
    console.log('[Metadata] Force refreshing all metadata...');

    // Clear all cached metadata
    for (const tab of allTabs) {
      await metadataManager.clearMetadata(tab.id);
    }

    // Fetch fresh metadata for all tabs
    await metadataManager.prefetchMetadata(allTabs);

    // Re-render with fresh data
    await renderTabList(currentTabs);

    console.log('[Metadata] Force refresh complete');
    btn.textContent = '✅ Done!';

    // Reset button after 2 seconds
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('[Metadata] Force refresh failed:', error);
    btn.textContent = '❌ Failed';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Calculate and update badge counts for quick filters
 */
async function updateFilterCounts() {
  filterCounts = {
    all: allTabs.length,
    week: allTabs.filter(tab => tab.age >= 7).length,
    forgotten: allTabs.filter(tab => tab.age >= 14).length,
    ancient: allTabs.filter(tab => tab.age >= 30).length,
    '6months': allTabs.filter(tab => tab.age >= 180).length,
    '1year': allTabs.filter(tab => tab.age >= 365).length,
    '2years': allTabs.filter(tab => tab.age >= 730).length,
    '3years': allTabs.filter(tab => tab.age >= 1095).length
  };

  // Update badge UI
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filterType = btn.dataset.filter;
    const count = filterCounts[filterType];

    // Remove existing badge if present
    const existingBadge = btn.querySelector('.filter-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add new badge
    if (count !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'filter-badge';
      badge.textContent = count;
      btn.appendChild(badge);
    }
  });
}

/**
 * Render tab list in UI
 */
async function renderTabList(tabs) {
  const listEl = document.getElementById('tabs-list');
  const countEl = document.getElementById('tabs-count');

  countEl.textContent = tabs.length;

  if (tabs.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-xl);">No tabs found</p>';
    return;
  }

  // Apply sorting
  const sortedTabs = sortTabs([...tabs], currentSortMode);

  listEl.innerHTML = '';

  for (let tab of sortedTabs) {
    const group = await groupManager.getGroup(tab.id);
    const itemEl = await createTabItemElement(tab, group);
    listEl.appendChild(itemEl);
  }
}

/**
 * Format reading time for display
 * Uses hour granularity for 3h+
 */
function formatReadingTime(minutes) {
  if (minutes < 60) {
    return `(${minutes}min)`;
  } else if (minutes < 180) {
    // < 3 hours: show as "1h42min"
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `(${hours}h${mins}min)` : `(${hours}h)`;
  } else {
    // >= 3 hours: hour granularity "3h"
    const hours = Math.round(minutes / 60);
    return `(${hours}h)`;
  }
}

/**
 * Create ML classification badges element
 * @param {Object} classifications - ML classification results
 * @returns {HTMLElement|null} Container with badges or null
 */
function createMLBadges(classifications) {
  if (!classifications) return null;

  const container = document.createElement('span');
  container.className = 'tab-item__ml-badges';
  container.style.display = 'inline-flex';
  container.style.gap = '4px';
  container.style.marginLeft = '8px';

  // Helper to create a single badge
  const createBadge = (label, dimension, score) => {
    const badge = document.createElement('span');
    badge.className = `ml-badge ml-badge--${dimension}`;
    badge.textContent = label;
    badge.title = `${dimension}: ${label} (${(score * 100).toFixed(0)}%)`;

    // Style based on confidence
    const opacity = 0.5 + (score * 0.5); // 50-100% opacity
    badge.style.fontSize = '0.75em';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '3px';
    badge.style.opacity = opacity;
    badge.style.fontWeight = '500';

    // Color coding by dimension
    if (dimension === 'intent') {
      badge.style.backgroundColor = '#DBEAFE'; // Light blue
      badge.style.color = '#1E40AF';
    } else if (dimension === 'status') {
      badge.style.backgroundColor = '#DCFCE7'; // Light green
      badge.style.color = '#166534';
    } else if (dimension === 'contentType') {
      badge.style.backgroundColor = '#FEF3C7'; // Light yellow
      badge.style.color = '#92400E';
    }

    return badge;
  };

  // Add top label from each dimension (if confidence > 0.4)
  const topIntent = classifications.intent?.topK[0];
  if (topIntent && topIntent.score > 0.4) {
    container.appendChild(createBadge(topIntent.label, 'intent', topIntent.score));
  }

  const topStatus = classifications.status?.topK[0];
  if (topStatus && topStatus.score > 0.4) {
    container.appendChild(createBadge(topStatus.label, 'status', topStatus.score));
  }

  const topContentType = classifications.contentType?.topK[0];
  if (topContentType && topContentType.score > 0.4) {
    // Shorten label if needed
    let label = topContentType.label;
    if (label === 'communication') label = 'comm';
    container.appendChild(createBadge(label, 'contentType', topContentType.score));
  }

  // Only return if we have at least one badge
  return container.children.length > 0 ? container : null;
}

/**
 * Create a single tab item element
 */
async function createTabItemElement(tab, group) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabId = tab.id;

  // Check if tab is broken (4xx/5xx) and add warning class
  const metadata = await metadataStorage.getMetadata(tab.id);
  if (metadata && metadata.httpCode && metadata.httpCode >= 400) {
    item.classList.add('tab-item--broken');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tab-item__checkbox';
  checkbox.checked = selectedTabIds.has(tab.id);
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedTabIds.add(tab.id);
    } else {
      selectedTabIds.delete(tab.id);
    }
  });

  const info = document.createElement('div');
  info.className = 'tab-item__info';

  // Add thumbnail if OG image available
  let thumbnail = null;
  if (metadata && metadata.og && metadata.og.image) {
    thumbnail = document.createElement('img');
    thumbnail.className = 'tab-item__thumbnail';
    thumbnail.src = metadata.og.image;
    thumbnail.alt = tab.title;
    thumbnail.loading = 'lazy'; // Performance: lazy load images
    thumbnail.onerror = () => thumbnail.style.display = 'none'; // Hide if fails
  }

  const title = document.createElement('div');
  title.className = 'tab-item__title';
  title.textContent = tab.title;
  title.title = tab.title; // Full title on hover

  const meta = document.createElement('div');
  meta.className = 'tab-item__meta';

  // Domain with count and brand color
  const domain = document.createElement('span');
  domain.className = 'tab-item__domain';
  const normalizedDomain = normalizeDomain(tab.domain);
  const domainCount = domainCounts[normalizedDomain] || 0;
  domain.textContent = `${tab.domain}${domainCount > 1 ? ` (${domainCount})` : ''}`;

  // Apply brand color
  const brandColor = getDomainColor(tab.domain);
  domain.style.color = brandColor;
  domain.style.fontWeight = '500';

  // Reading time badge (if metadata available)
  if (metadata && metadata.content && metadata.content.readingTimeMinutes) {
    const readingTime = metadata.content.readingTimeMinutes;
    const timeDisplay = formatReadingTime(readingTime);
    domain.textContent += ` ${timeDisplay}`;
  }

  const age = document.createElement('span');
  age.textContent = tab.ageFormatted;

  // Category indicator
  const category = categorizeTab(tab);
  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'tab-item__category';
  categoryBadge.textContent = `${category.icon} ${category.category}`;
  categoryBadge.style.fontSize = '0.85em';
  categoryBadge.style.color = category.color;

  meta.appendChild(domain);
  meta.appendChild(age);
  meta.appendChild(categoryBadge);

  // ML Classification badges (if available)
  if (metadata && metadata.mlClassifications) {
    const mlBadges = createMLBadges(metadata.mlClassifications);
    if (mlBadges) {
      meta.appendChild(mlBadges);
    }
  }

  // Synced tab indicator
  if (tab.source === 'synced') {
    const syncBadge = document.createElement('span');
    syncBadge.className = 'tab-item__sync-badge';

    // Format device name and sync date
    const parser = new SyncParser();
    const syncDateText = parser.formatSyncDate(tab.syncExportDate);

    syncBadge.textContent = `📱 ${tab.deviceName} (synced ${syncDateText})`;
    syncBadge.style.fontSize = '0.85em';
    syncBadge.style.color = '#6B7280';
    syncBadge.style.fontStyle = 'italic';
    syncBadge.title = `Synced from ${tab.deviceName} on ${new Date(tab.syncExportDate).toLocaleString()}`;

    meta.appendChild(syncBadge);
  }

  // Add thumbnail first if available
  if (thumbnail) {
    info.appendChild(thumbnail);
  }
  info.appendChild(title);
  info.appendChild(meta);

  const badge = document.createElement('span');
  badge.className = `tab-item__badge tab-item__badge--${group}`;
  badge.textContent = group.charAt(0).toUpperCase() + group.slice(1);

  // Actions container
  const actions = document.createElement('div');
  actions.className = 'tab-item__actions';

  // Only show "Go to tab" button for local tabs
  if (tab.source === 'local') {
    const goToBtn = document.createElement('button');
    goToBtn.className = 'tab-item__action-btn';
    goToBtn.textContent = '➡️';
    goToBtn.title = 'Go to tab';
    goToBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      browser.tabs.update(tab.id, { active: true });
    });
    actions.appendChild(goToBtn);
  }

  // ML Classify button (for all tabs)
  const classifyBtn = document.createElement('button');
  classifyBtn.className = 'tab-item__action-btn';
  classifyBtn.textContent = '🧠';
  classifyBtn.title = 'Classify this tab';
  classifyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleClassifySingleTab(tab, classifyBtn);
  });

  // Load metadata button (for all tabs)
  const metadataBtn = document.createElement('button');
  metadataBtn.className = 'tab-item__action-btn';
  metadataBtn.textContent = '📊';
  metadataBtn.title = 'Load metadata';
  metadataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleLoadMetadata(tab);
  });

  actions.appendChild(classifyBtn);
  actions.appendChild(metadataBtn);
  actions.appendChild(badge);

  item.appendChild(checkbox);
  item.appendChild(info);
  item.appendChild(actions);

  // Make item clickable to focus tab (only for local tabs)
  if (tab.source === 'local') {
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        browser.tabs.update(tab.id, { active: true });
      }
    });
  } else {
    // For synced tabs, just show URL in console on click
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        console.log(`[Synced Tab] ${tab.title}: ${tab.url}`);
      }
    });
  }

  return item;
}

/**
 * Handle query execution
 */
async function handleRunQuery() {
  const input = document.getElementById('query-input');
  const queryString = input.value.trim();

  if (!queryString) {
    await loadAllTabs();
    return;
  }

  // Parse query
  const filters = queryParser.parse(queryString);

  // Execute query on allTabs (includes both local and synced)
  const results = filterTabs(allTabs, filters);

  // Render results
  currentTabs = results;
  await renderTabList(currentTabs);
}

/**
 * Filter tabs based on parsed query filters
 * Works on any tab array (local + synced)
 */
function filterTabs(tabs, filters) {
  return tabs.filter(tab => {
    // Domain filter
    if (filters.domain) {
      const pattern = filters.domain.replace(/^https?:\/\//, '');
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (!regex.test(tab.domain)) return false;
      } else if (!tab.domain.includes(pattern)) {
        return false;
      }
    }

    // Age filter
    if (filters.age !== null) {
      const operator = filters.ageOperator || '>';
      const tabAgeDays = tab.ageDays || 0;

      switch (operator) {
        case '>':
          if (tabAgeDays <= filters.age) return false;
          break;
        case '>=':
          if (tabAgeDays < filters.age) return false;
          break;
        case '<':
          if (tabAgeDays >= filters.age) return false;
          break;
        case '<=':
          if (tabAgeDays > filters.age) return false;
          break;
        case '=':
          if (tabAgeDays !== filters.age) return false;
          break;
      }
    }

    // Title filter
    if (filters.title) {
      const lowerSearch = filters.title.toLowerCase();
      if (!tab.title.toLowerCase().includes(lowerSearch)) {
        return false;
      }
    }

    // URL filter
    if (filters.url) {
      const pattern = filters.url;
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (!regex.test(tab.url)) return false;
      } else if (!tab.url.includes(pattern)) {
        return false;
      }
    }

    // Free text search (searches title, url, domain)
    if (filters.text) {
      const lowerSearch = filters.text.toLowerCase();
      const searchableText = `${tab.title} ${tab.url} ${tab.domain}`.toLowerCase();
      if (!searchableText.includes(lowerSearch)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Handle clear query
 */
async function handleClearQuery() {
  const queryInput = document.getElementById('query-input');
  const clearBtn = document.getElementById('clear-query-btn');

  queryInput.value = '';
  clearBtn.style.display = 'none';

  await loadAllTabs();
}

/**
 * Handle quick filter buttons
 */
async function handleQuickFilter(filterType) {
  const input = document.getElementById('query-input');
  const clearBtn = document.getElementById('clear-query-btn');

  // Remove active class from all age filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Add active class to clicked button
  event.target.classList.add('active');

  // Clear category filter
  categoryFilterActive = null;
  document.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  switch (filterType) {
    case 'all':
      input.value = '';
      clearBtn.style.display = 'none';
      break;
    case 'week':
      input.value = 'age>1w';
      clearBtn.style.display = 'flex';
      break;
    case 'forgotten':
      input.value = 'age>2w';
      clearBtn.style.display = 'flex';
      break;
    case 'ancient':
      input.value = 'age>1m';
      clearBtn.style.display = 'flex';
      break;
    case '6months':
      input.value = 'age>6m';
      clearBtn.style.display = 'flex';
      break;
    case '1year':
      input.value = 'age>1y';
      clearBtn.style.display = 'flex';
      break;
    case '2years':
      input.value = 'age>2y';
      clearBtn.style.display = 'flex';
      break;
    case '3years':
      input.value = 'age>3y';
      clearBtn.style.display = 'flex';
      break;
    case 'internal':
      // Toggle internal tabs visibility
      showInternalTabs = !showInternalTabs;
      await loadAllTabs();
      return; // Don't run query
    case 'broken':
      // Filter broken tabs (4xx/5xx HTTP codes)
      await filterBrokenTabs();
      return; // Don't run query
  }

  await handleRunQuery();
}

/**
 * Filter broken tabs (4xx/5xx HTTP codes)
 * Requires metadata to be loaded
 */
async function filterBrokenTabs() {
  console.log('[Broken Filter] Checking metadata for broken tabs...');

  // Get all tabs
  const allTabsData = await tabQuery.getAllTabsWithMetadata(showInternalTabs);

  // Filter to tabs that have metadata with 4xx/5xx codes
  const brokenTabs = [];

  for (const tab of allTabsData) {
    try {
      const metadata = await metadataStorage.getMetadata(tab.id);
      if (metadata && metadata.httpCode && metadata.httpCode >= 400) {
        brokenTabs.push(tab);
      }
    } catch (error) {
      console.error(`Failed to check metadata for tab ${tab.id}:`, error);
    }
  }

  console.log(`[Broken Filter] Found ${brokenTabs.length} broken tabs`);

  // Update UI
  currentTabs = allTabsData;
  await renderTabList(brokenTabs);
  updateStatistics(brokenTabs);
}

/**
 * Handle category filter buttons
 */
async function handleCategoryFilter(category) {
  // Remove active class from all category buttons
  document.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Toggle category filter
  if (categoryFilterActive === category) {
    // Deactivate if clicking same category
    categoryFilterActive = null;
    await renderTabList(currentTabs);
  } else {
    // Activate new category
    categoryFilterActive = category;
    event.target.classList.add('active');

    // Filter current tabs by category
    const filtered = currentTabs.filter(tab => {
      const tabCategory = categorizeTab(tab);
      return tabCategory.category === category;
    });

    await renderTabList(filtered);
  }
}

/**
 * Handle source filter buttons (local/synced/all)
 */
async function handleSourceFilter(source) {
  // Remove active class from all source buttons
  document.querySelectorAll('.source-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Add active class to clicked button
  event.target.classList.add('active');

  let filtered;
  if (source === 'all') {
    filtered = allTabs;
  } else if (source === 'local') {
    filtered = allTabs.filter(tab => tab.source === 'local');
  } else if (source === 'synced') {
    filtered = allTabs.filter(tab => tab.source === 'synced');
  }

  currentTabs = filtered;
  await renderTabList(currentTabs);
  await updateStatistics();
}

/**
 * Handle bulk group assignment
 */
async function handleBulkGroup(targetGroup) {
  if (selectedTabIds.size === 0) {
    alert('No tabs selected');
    return;
  }

  for (let tabId of selectedTabIds) {
    await groupManager.setGroup(tabId, targetGroup);
  }

  selectedTabIds.clear();
  await renderTabList(currentTabs);
  await updateStatistics();
}

/**
 * Handle bulk close
 */
async function handleBulkClose() {
  if (selectedTabIds.size === 0) {
    alert('No tabs selected');
    return;
  }

  // Filter out synced tabs (they can't be closed as they're not real browser tabs)
  const localTabIds = Array.from(selectedTabIds).filter(tabId => {
    const tab = allTabs.find(t => t.id === tabId);
    return tab && tab.source === 'local';
  });

  if (localTabIds.length === 0) {
    alert('No local tabs selected. Synced tabs cannot be closed.');
    return;
  }

  const skippedCount = selectedTabIds.size - localTabIds.length;
  const confirmMsg = skippedCount > 0
    ? `Close ${localTabIds.length} local tabs?\n(Skipping ${skippedCount} synced tabs)`
    : `Close ${localTabIds.length} tabs?`;

  const confirmed = confirm(confirmMsg);
  if (!confirmed) {
    return;
  }

  try {
    await browser.tabs.remove(localTabIds);

    // Clean up storage
    for (let tabId of localTabIds) {
      await Storage.remove(`tab-${tabId}`);
    }

    selectedTabIds.clear();
    await loadAllTabs();
    await updateStatistics();
  } catch (error) {
    console.error('Failed to close tabs:', error);
    alert('Failed to close some tabs');
  }
}

/**
 * Handle export
 */
async function handleExport() {
  try {
    await TabExport.exportAndDownload(currentTabs, groupManager);
  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed. Check console for details.');
  }
}

/**
 * Update statistics display
 * Counts from allTabs (includes both local and synced)
 */
async function updateStatistics() {
  // Count from allTabs instead of groupManager (which only knows local tabs)
  const counts = {
    total: allTabs.length,
    main: 0,
    staging: 0,
    bin: 0,
  };

  // Count groups for all tabs
  for (const tab of allTabs) {
    const group = await groupManager.getGroup(tab.id);
    counts[group]++;
  }

  document.getElementById('stat-total').textContent = counts.total;
  document.getElementById('stat-main').textContent = counts.main;
  document.getElementById('stat-staging').textContent = counts.staging;
  document.getElementById('stat-bin').textContent = counts.bin;
}

/**
 * Handle sort dropdown change
 */
async function handleSortChange(event) {
  currentSortMode = event.target.value;
  await renderTabList(currentTabs);
}

/**
 * Sort tabs by various criteria
 * @param {Array} tabs - Array of tabs to sort
 * @param {string} sortMode - Sort mode
 * @returns {Array} Sorted tabs
 */
function sortTabs(tabs, sortMode) {
  switch (sortMode) {
    case 'lastAccessed':
      // Most recently accessed first
      return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

    case 'lastAccessed-asc':
      // Oldest accessed first
      return tabs.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    case 'title':
      // Alphabetical by title
      return tabs.sort((a, b) => a.title.localeCompare(b.title));

    case 'domain':
      // Alphabetical by domain
      return tabs.sort((a, b) => a.domain.localeCompare(b.domain));

    case 'age':
      // Newest tabs first (smallest age)
      return tabs.sort((a, b) => a.age - b.age);

    case 'age-desc':
      // Oldest tabs first (largest age)
      return tabs.sort((a, b) => b.age - a.age);

    default:
      return tabs;
  }
}

/**
 * Switch between list and groups view
 */
function switchView(view) {
  currentView = view;

  // Update button states
  document.getElementById('view-list-btn').classList.toggle('active', view === 'list');
  document.getElementById('view-groups-btn').classList.toggle('active', view === 'groups');

  // Show/hide views
  document.getElementById('list-view').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('groups-view').style.display = view === 'groups' ? 'block' : 'none';

  // Render groups if switching to groups view
  if (view === 'groups') {
    renderGroupsView(currentTabs);
  }
}

/**
 * Normalize domain by removing www/m prefixes
 */
function normalizeDomain(domain) {
  // Remove www., m., mobile. prefixes
  return domain.replace(/^(www\.|m\.|mobile\.)/, '');
}

/**
 * Render groups view with domain cards grouped by category
 */
function renderGroupsView(tabs) {
  const container = document.getElementById('groups-container');
  const countEl = document.getElementById('groups-count');

  // Group tabs by normalized domain
  const domainGroups = {};
  for (const tab of tabs) {
    const normalizedDomain = normalizeDomain(tab.domain);
    if (!domainGroups[normalizedDomain]) {
      domainGroups[normalizedDomain] = [];
    }
    domainGroups[normalizedDomain].push(tab);
  }

  // Separate multi-tab domains and single-tab domains ("Loners")
  const multiTabDomains = {};
  const lonersTabs = [];

  for (const [domain, tabsInDomain] of Object.entries(domainGroups)) {
    if (tabsInDomain.length === 1) {
      lonersTabs.push(...tabsInDomain);
    } else {
      multiTabDomains[domain] = tabsInDomain;
    }
  }

  // Sort multi-tab domains by tab count (descending)
  const sortedDomains = Object.keys(multiTabDomains).sort((a, b) => {
    return multiTabDomains[b].length - multiTabDomains[a].length;
  });

  // Update count (multi-tab domains + 1 for Loners if exists)
  const totalGroups = sortedDomains.length + (lonersTabs.length > 0 ? 1 : 0);
  countEl.textContent = totalGroups;

  // Clear container
  container.innerHTML = '';

  if (totalGroups === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-xl);">No domains found</p>';
    return;
  }

  // Create domain cards for multi-tab domains
  for (const domain of sortedDomains) {
    const domainTabs = multiTabDomains[domain];
    const card = createDomainCard(domain, domainTabs);
    container.appendChild(card);
  }

  // Create "Loners" card for single-tab domains
  if (lonersTabs.length > 0) {
    const lonersCard = createDomainCard('🎯 Loners', lonersTabs);
    container.appendChild(lonersCard);
  }
}

/**
 * Create a domain card element
 */
function createDomainCard(domain, tabs) {
  const card = document.createElement('div');
  card.className = 'domain-card';

  // Get category for first tab (all tabs from same domain should have same category)
  const category = categorizeTab(tabs[0]);
  const brandColor = getDomainColor(domain);

  // Header
  const header = document.createElement('div');
  header.className = 'domain-card__header';
  header.style.borderLeftColor = brandColor;
  header.style.borderLeftWidth = '4px';
  header.style.borderLeftStyle = 'solid';

  const domainName = document.createElement('div');
  domainName.className = 'domain-card__domain';
  domainName.textContent = domain;
  domainName.style.color = brandColor;

  const count = document.createElement('span');
  count.className = 'domain-card__count';
  count.textContent = tabs.length;

  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'domain-card__category';
  categoryBadge.textContent = `${category.icon} ${category.category}`;
  categoryBadge.style.color = category.color;

  header.appendChild(domainName);
  header.appendChild(count);
  header.appendChild(categoryBadge);

  // Body (list of tabs)
  const body = document.createElement('div');
  body.className = 'domain-card__body';

  for (const tab of tabs) {
    const tabEl = document.createElement('div');
    tabEl.className = 'domain-card__tab';

    const title = document.createElement('div');
    title.className = 'domain-card__tab-title';
    title.textContent = tab.title;
    title.title = tab.title; // Full title on hover

    const age = document.createElement('div');
    age.className = 'domain-card__tab-age';
    age.textContent = tab.ageFormatted;

    tabEl.appendChild(title);
    tabEl.appendChild(age);

    // Click to focus tab
    tabEl.addEventListener('click', () => {
      browser.tabs.update(tab.id, { active: true });
    });

    body.appendChild(tabEl);
  }

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

/**
 * Handle load metadata button click
 */
async function handleLoadMetadata(tab) {
  const modal = document.getElementById('details-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');

  // Show modal
  modal.style.display = 'flex';
  modalTitle.textContent = tab.title;
  modalBody.innerHTML = '<div class="loading">Loading metadata...</div>';

  // Check host permissions first
  try {
    const permissions = await browser.permissions.getAll();
    if (!permissions.origins || permissions.origins.length === 0) {
      modalBody.innerHTML = `
        <div class="metadata-error">
          <p>⚠️ Host permissions required</p>
          <p style="margin-top: 8px; font-size: 13px; color: var(--color-text-secondary);">
            This extension needs permission to "Access your data for all websites" to load metadata.
          </p>
          <button id="grant-permissions-btn" class="btn btn--primary" style="margin-top: 16px;">
            Grant Permissions
          </button>
        </div>
      `;

      // Add click handler
      document.getElementById('grant-permissions-btn').addEventListener('click', async () => {
        const granted = await requestHostPermissions();
        if (granted) {
          // Retry loading metadata
          handleLoadMetadata(tab);
        } else {
          modalBody.innerHTML = `
            <div class="metadata-error">
              <p>⚠️ Permissions denied</p>
              <p style="margin-top: 8px; font-size: 13px;">
                Please grant permissions from about:addons to use metadata features.
              </p>
            </div>
          `;
        }
      });
      return;
    }
  } catch (e) {
    console.error('Failed to check permissions:', e);
  }

  try {
    // Fetch metadata - use direct URL fetch for synced tabs, content script for local tabs
    let metadata;
    if (tab.source === 'synced') {
      metadata = await metadataManager.fetchMetadataFromUrl(tab.url, tab.id);
    } else {
      metadata = await metadataManager.getMetadata(tab.id);
    }

    if (!metadata) {
      modalBody.innerHTML = `
        <div class="metadata-error">
          <p>⚠️ Could not load metadata.</p>
          <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-secondary);">
            This can happen if:
            <ul style="margin: 8px 0 0 20px; text-align: left;">
              <li>The tab hasn't been reloaded since installing the extension</li>
              <li>The page is a browser internal page (about:, moz-extension:)</li>
              <li>The page blocks content scripts</li>
            </ul>
            Try reloading the tab and clicking 📊 again.
          </p>
        </div>
      `;
      return;
    }

    // Render metadata
    modalBody.innerHTML = renderMetadata(metadata, tab);

    // Hook up reload button
    const reloadBtn = document.getElementById('reload-metadata-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', async () => {
        reloadBtn.disabled = true;
        reloadBtn.textContent = '🔄 Reloading...';
        try {
          // Force refresh metadata
          await metadataManager.clearMetadata(tab.id);

          // Use appropriate fetch method based on tab source
          let freshMetadata;
          if (tab.source === 'synced') {
            freshMetadata = await metadataManager.fetchMetadataFromUrl(tab.url, tab.id);
          } else {
            freshMetadata = await metadataManager.getMetadata(tab.id, true);
          }

          if (freshMetadata) {
            modalBody.innerHTML = renderMetadata(freshMetadata, tab);
            // Re-hook reload button recursively
            handleLoadMetadata(tab);
          }
        } catch (error) {
          console.error('Failed to reload metadata:', error);
          alert('Failed to reload: ' + error.message);
        }
        reloadBtn.disabled = false;
        reloadBtn.textContent = '🔄 Reload Metadata';
      });
    }
  } catch (error) {
    console.error('Failed to load metadata:', error);
    modalBody.innerHTML = `
      <div class="metadata-error">
        <p>⚠️ Error: ${escapeHtml(error.message)}</p>
        <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-secondary);">
          Check the browser console for details.
        </p>
      </div>
    `;
  }
}

/**
 * Render metadata as HTML
 */
function renderMetadata(metadata, tab) {
  let html = '';

  // Reload button at the top
  html += '<div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">';
  html += `<button id="reload-metadata-btn" class="btn btn--small btn--secondary" data-tab-id="${tab.id}">🔄 Reload Metadata</button>`;
  html += '</div>';

  // HTTP Status
  html += '<div class="metadata-section">';
  html += '<h3 class="metadata-section__title">📡 Status</h3>';
  html += '<div class="metadata-field">';
  html += '<div class="metadata-field__label">HTTP Code</div>';
  html += '<div class="metadata-field__value">';
  if (metadata.httpCode) {
    const codeClass = metadata.httpCode >= 400 ? (metadata.httpCode >= 500 ? 'http-code--500' : 'http-code--404') : 'http-code--200';
    html += `<span class="http-code ${codeClass}">${metadata.httpCode}</span>`;
  } else {
    html += '<span class="metadata-field__value--empty">Unknown</span>';
  }
  html += '</div></div></div>';

  // Open Graph
  if (metadata.og && Object.values(metadata.og).some(v => v)) {
    html += '<div class="metadata-section">';
    html += '<h3 class="metadata-section__title">🎴 Open Graph</h3>';

    if (metadata.og.title) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Title</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.og.title)}</div>`;
      html += '</div>';
    }

    if (metadata.og.description) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Description</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.og.description)}</div>`;
      html += '</div>';
    }

    if (metadata.og.image) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Image</div>';
      html += `<div class="metadata-field__value"><img src="${escapeHtml(metadata.og.image)}" style="max-width: 100%; border-radius: 6px;" /></div>`;
      html += '</div>';
    }

    if (metadata.og.type) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Type</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.og.type)}</div>`;
      html += '</div>';
    }

    if (metadata.og.siteName) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Site Name</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.og.siteName)}</div>`;
      html += '</div>';
    }

    html += '</div>';
  }

  // Meta Tags
  if (metadata.meta && Object.values(metadata.meta).some(v => v)) {
    html += '<div class="metadata-section">';
    html += '<h3 class="metadata-section__title">📝 Meta Tags</h3>';

    if (metadata.meta.description) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Description</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.meta.description)}</div>`;
      html += '</div>';
    }

    if (metadata.meta.keywords) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Keywords</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.meta.keywords)}</div>`;
      html += '</div>';
    }

    if (metadata.meta.author) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Author</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.meta.author)}</div>`;
      html += '</div>';
    }

    html += '</div>';
  }

  // Content Stats
  if (metadata.content) {
    html += '<div class="metadata-section">';
    html += '<h3 class="metadata-section__title">📊 Content</h3>';

    html += '<div class="metadata-field">';
    html += '<div class="metadata-field__label">Word Count</div>';
    html += `<div class="metadata-field__value">${metadata.content.wordCount?.toLocaleString() || 'N/A'}</div>`;
    html += '</div>';

    html += '<div class="metadata-field">';
    html += '<div class="metadata-field__label">Reading Time</div>';
    html += `<div class="metadata-field__value">📖 ${metadata.content.readingTimeMinutes || '?'} min read</div>`;
    html += '</div>';

    if (metadata.content.language) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Language</div>';
      html += `<div class="metadata-field__value">${safeDisplay(metadata.content.language)}</div>`;
      html += '</div>';
    }

    html += '</div>';
  }

  // URL
  html += '<div class="metadata-section">';
  html += '<h3 class="metadata-section__title">🔗 URL</h3>';
  html += '<div class="metadata-field">';
  html += `<div class="metadata-field__value" style="word-break: break-all; font-size: 12px;">${escapeHtml(tab.url)}</div>`;
  html += '</div></div>';

  return html;
}

/**
 * Decode HTML entities (opposite of escapeHtml)
 */
function decodeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerHTML = text;
  return div.textContent;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Safe display of text that might contain HTML entities
 */
function safeDisplay(text) {
  if (!text) return '';
  // First decode any HTML entities, then escape for safe display
  return escapeHtml(decodeHtml(text));
}

/**
 * Close modal
 */
function closeModal() {
  const modal = document.getElementById('details-modal');
  modal.style.display = 'none';
}

// Set up modal close handlers
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('details-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const overlay = modal.querySelector('.modal__overlay');

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
    }
  });
});

/**
 * Request host permissions at runtime
 * Required for browser.scripting API to be exposed
 */
async function requestHostPermissions() {
  try {
    console.log('[Permissions] Requesting <all_urls> host permission...');
    const granted = await browser.permissions.request({
      origins: ['<all_urls>']
    });

    if (granted) {
      console.log('✓ Host permissions granted!');
      return true;
    } else {
      console.log('✗ Host permissions denied by user');
      return false;
    }
  } catch (error) {
    console.error('Failed to request permissions:', error);
    return false;
  }
}

/**
 * Handle API test button - diagnostic tool
 */
async function handleApiTest() {
  console.log('=== Firefox API Diagnostics ===');
  console.log('Firefox version:', navigator.userAgent.match(/Firefox\/(\d+)/)?.[1] || 'unknown');
  console.log('Manifest version:', browser.runtime.getManifest().manifest_version);
  console.log('');

  console.log('API Availability:');
  console.log('  browser.tabs.executeScript:', typeof browser.tabs.executeScript);
  console.log('  browser.scripting:', typeof browser.scripting);
  console.log('  browser.scripting?.executeScript:', typeof browser.scripting?.executeScript);
  console.log('  browser.contentScripts:', typeof browser.contentScripts);
  console.log('');

  // Check permissions
  try {
    const permissions = await browser.permissions.getAll();
    console.log('Granted permissions:', permissions.permissions);
    console.log('Host permissions:', permissions.origins);
    console.log('');

    // If no host permissions, request them
    if (!permissions.origins || permissions.origins.length === 0) {
      console.log('⚠️  No host permissions granted. Requesting...');
      const granted = await requestHostPermissions();

      if (granted) {
        console.log('✓ Permissions granted! Reloading page...');
        console.log('');
        // Reload page to get fresh API state
        window.location.reload();
        return;
      } else {
        alert('Host permissions denied. Metadata loading will not work.\n\nPlease grant "Access your data for all websites" permission from about:addons');
        return;
      }
    }
  } catch (e) {
    console.error('Failed to check permissions:', e);
  }

  // Try a test injection on first non-internal tab
  const testTab = allTabs.find(tab => !tab.isInternal);
  if (testTab) {
    console.log('');
    console.log(`Testing injection on tab ${testTab.id}: ${testTab.title}`);

    try {
      if (browser.scripting && browser.scripting.executeScript) {
        console.log('Attempting browser.scripting.executeScript...');
        await browser.scripting.executeScript({
          target: { tabId: testTab.id },
          func: () => console.log('[Test] Content script injected via scripting.executeScript!')
        });
        console.log('✓ browser.scripting.executeScript WORKS!');
      } else if (browser.tabs.executeScript) {
        console.log('Attempting browser.tabs.executeScript...');
        await browser.tabs.executeScript(testTab.id, {
          code: 'console.log("[Test] Content script injected via tabs.executeScript!");'
        });
        console.log('✓ browser.tabs.executeScript WORKS!');
      } else {
        console.log('✗ No injection API available');
      }
    } catch (error) {
      console.error('✗ Injection failed:', error.message);
    }
  }

  alert('API test complete! Check browser console for results.');
}

/**
 * Handle Import Sync button click - show guidance modal
 */
function handleImportSyncClick() {
  const modal = document.getElementById('import-guide-modal');
  modal.style.display = 'flex';
}

/**
 * Close import guidance modal
 */
function closeImportGuideModal() {
  const modal = document.getElementById('import-guide-modal');
  modal.style.display = 'none';
}

/**
 * Handle copy script button - copy extraction script to clipboard
 */
async function handleCopyScript() {
  const scriptEl = document.getElementById('sync-extraction-script');
  const btn = document.getElementById('copy-script-btn');
  const originalText = btn.textContent;

  try {
    await navigator.clipboard.writeText(scriptEl.textContent);
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy script:', error);
    alert('Failed to copy script. Please select and copy manually.');
  }
}

/**
 * Handle sync file selected - parse and import
 */
async function handleSyncFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Close the guidance modal
  closeImportGuideModal();

  // Show loading state
  const btn = document.getElementById('import-sync-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Importing...';

  try {
    // Read and parse file
    const content = await file.text();
    const syncedData = JSON.parse(content);

    // Parse using SyncParser
    const parser = new SyncParser();
    const result = parser.parse(syncedData, file.name);

    console.log(`[Sync Import] Parsed ${result.totalTabs} tabs from ${result.deviceCount} devices`);
    console.log(`[Sync Import] Sync export date: ${new Date(result.syncExportDate).toLocaleString()}`);

    // Store synced tabs in storage.local
    await Storage.set('syncedTabs', result.tabs);
    await Storage.set('syncMetadata', {
      syncExportDate: result.syncExportDate,
      deviceCount: result.deviceCount,
      totalTabs: result.totalTabs,
      importedAt: Date.now()
    });

    // Reload to merge with local tabs
    await loadAllTabs();
    await updateStatistics();

    btn.textContent = '✓ Imported!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);

    alert(`Successfully imported ${result.totalTabs} tabs from ${result.deviceCount} devices!`);
  } catch (error) {
    console.error('[Sync Import] Failed to import:', error);
    btn.textContent = originalText;
    btn.disabled = false;
    alert(`Failed to import synced tabs:\n${error.message}`);
  }

  // Reset file input
  event.target.value = '';
}

/**
 * Load synced tabs from storage and merge with local tabs
 */
async function loadSyncedTabs() {
  const syncedTabs = await Storage.get('syncedTabs') || [];
  return syncedTabs;
}

// ============================================================================
// ML Debug Modal Functions
// ============================================================================

/**
 * ML Test Presets
 */
const ML_PRESETS = {
  tech: {
    id: 'test-tech',
    title: 'Python Tutorial - Learn Python Programming',
    url: 'https://docs.python.org/3/tutorial/',
    domain: 'docs.python.org',
    lastUsed: Date.now() - 2 * 60 * 60 * 1000,
    inactive: false
  },
  shopping: {
    id: 'test-shopping',
    title: 'Buy iPhone 15 Pro - Apple Store',
    url: 'https://www.apple.com/shop/buy-iphone',
    domain: 'apple.com',
    lastUsed: Date.now() - 1 * 60 * 60 * 1000,
    inactive: false
  },
  social: {
    id: 'test-social',
    title: 'Gmail - Inbox',
    url: 'https://mail.google.com/mail/u/0/',
    domain: 'mail.google.com',
    lastUsed: Date.now() - 30 * 60 * 1000,
    inactive: false
  },
  news: {
    id: 'test-news',
    title: 'Breaking News - CNN International',
    url: 'https://www.cnn.com/world',
    domain: 'cnn.com',
    lastUsed: Date.now() - 1 * 60 * 60 * 1000,
    inactive: false
  },
  old: {
    id: 'test-old',
    title: 'Old API Documentation',
    url: 'https://example.com/docs/api-v1',
    domain: 'example.com',
    lastUsed: Date.now() - 30 * 24 * 60 * 60 * 1000,
    inactive: true
  },
  mixed: [
    {
      id: 'batch-1',
      title: 'GitHub - Repository',
      url: 'https://github.com/user/repo',
      domain: 'github.com',
      lastUsed: Date.now() - 1000,
      inactive: false
    },
    {
      id: 'batch-2',
      title: 'Amazon - Shopping Cart',
      url: 'https://www.amazon.com/cart',
      domain: 'amazon.com',
      lastUsed: Date.now() - 5000,
      inactive: false
    },
    {
      id: 'batch-3',
      title: 'YouTube - Watch Later',
      url: 'https://www.youtube.com/playlist?list=WL',
      domain: 'youtube.com',
      lastUsed: Date.now() - 10000,
      inactive: false
    }
  ]
};

function openMLDebugModal() {
  const modal = document.getElementById('ml-debug-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeMLDebugModal() {
  document.getElementById('ml-debug-modal').style.display = 'none';
}

function loadMLPreset(preset) {
  const data = ML_PRESETS[preset];
  const textarea = document.getElementById('ml-tab-input');

  if (Array.isArray(data)) {
    textarea.value = JSON.stringify(data, null, 2);
  } else {
    textarea.value = JSON.stringify(data, null, 2);
  }

  showMLStatus(`✅ Loaded preset: ${preset}`, 'success');
}

function showMLStatus(message, type = 'info') {
  const status = document.getElementById('ml-status');
  status.textContent = message;
  status.style.display = 'block';
  status.style.background = type === 'success' ? '#e8f5e9' : type === 'error' ? '#ffebee' : '#e3f2fd';

  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

function showMLResults(results) {
  const resultsDiv = document.getElementById('ml-results');
  const resultsContent = document.getElementById('ml-results-content');

  resultsContent.textContent = JSON.stringify(results, null, 2);
  resultsDiv.style.display = 'block';
}

function showMLLoading(show) {
  document.getElementById('ml-loading').style.display = show ? 'block' : 'none';
  document.getElementById('ml-results').style.display = show ? 'none' : 'block';
}

/**
 * Check ML Classifier status in background worker
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Delay between retries in milliseconds
 * @returns {Promise<void>}
 */
async function checkMLStatus(maxRetries = 20, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getMLStatus' });

      if (response.ready) {
        console.log('[ML Debug] ✓ ML Worker ready');
        return;
      }

      console.log(`[ML Debug] Waiting for ML Worker... (attempt ${i + 1}/${maxRetries})`, {
        loading: response.loading,
        error: response.error
      });

      if (response.error) {
        throw new Error('ML Worker failed to load: ' + response.error);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error('[ML Debug] Status check error:', error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('ML Worker failed to initialize after ' + maxRetries + ' attempts');
}

async function handleMLClassifySingle() {
  const textarea = document.getElementById('ml-tab-input');

  try {
    const tab = JSON.parse(textarea.value);

    if (Array.isArray(tab)) {
      showMLStatus('❌ Use "Classify Batch" for arrays', 'error');
      return;
    }

    showMLLoading(true);
    showMLStatus('⏳ Waiting for ML Worker...', 'info');

    // Wait for ML Worker to be ready
    await checkMLStatus();

    showMLStatus('⏳ Loading model and classifying...', 'info');

    const startTime = Date.now();
    const response = await browser.runtime.sendMessage({
      action: 'classifyTab',
      tab: tab,
      sessionContext: null
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    const elapsed = Date.now() - startTime;

    showMLLoading(false);
    showMLResults(response.result);
    showMLStatus(`✅ Classified in ${elapsed}ms`, 'success');

  } catch (error) {
    showMLLoading(false);
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Classification error:', error);
  }
}

async function handleMLClassifyBatch() {
  const textarea = document.getElementById('ml-tab-input');

  try {
    let tabs = JSON.parse(textarea.value);

    if (!Array.isArray(tabs)) {
      tabs = [tabs];
    }

    showMLLoading(true);
    showMLStatus('⏳ Waiting for ML Worker...', 'info');

    // Wait for ML Worker to be ready
    await checkMLStatus();

    showMLStatus(`⏳ Classifying ${tabs.length} tabs...`, 'info');

    const startTime = Date.now();
    const response = await browser.runtime.sendMessage({
      action: 'classifyBatch',
      tabs: tabs,
      sessionContext: null
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    const elapsed = Date.now() - startTime;

    showMLLoading(false);
    showMLResults(response.results);
    showMLStatus(`✅ Classified ${response.results.length} tabs in ${elapsed}ms`, 'success');

  } catch (error) {
    showMLLoading(false);
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Batch classification error:', error);
  }
}

async function handleMLTestContext() {
  const textarea = document.getElementById('ml-tab-input');

  try {
    let tabs = JSON.parse(textarea.value);

    if (!Array.isArray(tabs)) {
      tabs = [tabs];
    }

    showMLStatus('🧠 Extracting context features...', 'info');

    if (typeof ContextFeatures === 'undefined') {
      showMLStatus('❌ ContextFeatures not loaded', 'error');
      return;
    }

    const context = ContextFeatures.extractSessionContext(tabs);

    showMLLoading(false);
    showMLResults({
      message: 'Context features extracted',
      tabs: tabs.length,
      context: context,
      domainKnowledge: tabs.map(t => ({
        domain: t.domain,
        hints: DomainKnowledge ? DomainKnowledge.getHints(t.domain) : null
      }))
    });

    showMLStatus(`✅ Context extracted for ${tabs.length} tabs`, 'success');

  } catch (error) {
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Context extraction error:', error);
  }
}

/**
 * Test embeddings model directly
 */
async function handleTestEmbeddings() {
  showMLLoading(true);
  showMLStatus('🔄 Loading embeddings model...', 'info');

  try {
    if (!window.modelPreloader) {
      throw new Error('ModelPreloader not available');
    }

    const startTime = Date.now();
    const pipe = await window.modelPreloader.preloadModel('embeddings');
    const loadTime = Date.now() - startTime;

    // Test with sample text
    const testText = "Python tutorial for machine learning and data science";
    const embeddings = await pipe(testText, { pooling: 'mean', normalize: true });

    showMLLoading(false);
    showMLResults({
      model: 'Embeddings (Xenova/all-MiniLM-L6-v2)',
      loadTime: `${(loadTime / 1000).toFixed(2)}s`,
      testText: testText,
      embeddingDimensions: embeddings.data.length,
      sampleValues: Array.from(embeddings.data.slice(0, 10)).map(v => v.toFixed(4))
    });

    showMLStatus(`✅ Embeddings model working! (${(loadTime / 1000).toFixed(1)}s)`, 'success');

  } catch (error) {
    showMLLoading(false);
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Embeddings test error:', error);
  }
}

/**
 * Test classification model directly
 */
async function handleTestClassification() {
  showMLLoading(true);
  showMLStatus('🔄 Loading classification model...', 'info');

  try {
    if (!window.modelPreloader) {
      throw new Error('ModelPreloader not available');
    }

    const startTime = Date.now();
    const pipe = await window.modelPreloader.preloadModel('classification');
    const loadTime = Date.now() - startTime;

    // Test with sample text
    const testText = "Python tutorial for machine learning";
    const labels = ['technology', 'shopping', 'news', 'entertainment'];
    const result = await pipe(testText, labels, { multi_label: true });

    showMLLoading(false);
    showMLResults({
      model: 'Classification (Xenova/distilbert-base-uncased-mnli)',
      loadTime: `${(loadTime / 1000).toFixed(2)}s`,
      testText: testText,
      labels: labels,
      scores: result.scores.map((s, i) => ({ label: result.labels[i], score: s.toFixed(3) }))
    });

    showMLStatus(`✅ Classification model working! (${(loadTime / 1000).toFixed(1)}s)`, 'success');

  } catch (error) {
    showMLLoading(false);
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Classification test error:', error);
  }
}

/**
 * Test NER model directly
 */
async function handleTestNER() {
  showMLLoading(true);
  showMLStatus('🔄 Loading NER model...', 'info');

  try {
    if (!window.modelPreloader) {
      throw new Error('ModelPreloader not available');
    }

    const startTime = Date.now();
    const pipe = await window.modelPreloader.preloadModel('ner');
    const loadTime = Date.now() - startTime;

    // Test with sample text
    const testText = "Hugging Face Inc. is a company based in New York City. Its headquarters are in DUMBO.";
    const result = await pipe(testText);

    showMLLoading(false);
    showMLResults({
      model: 'NER (Xenova/bert-base-NER)',
      loadTime: `${(loadTime / 1000).toFixed(2)}s`,
      testText: testText,
      entities: result
    });

    showMLStatus(`✅ NER model working! (${(loadTime / 1000).toFixed(1)}s)`, 'success');

  } catch (error) {
    showMLLoading(false);
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] NER test error:', error);
  }
}

/**
 * Check model cache status
 */
async function handleCheckModelCache() {
  showMLStatus('🔄 Checking model cache...', 'info');

  try {
    if (!window.modelPreloader) {
      throw new Error('ModelPreloader not available');
    }

    await window.modelPreloader.checkCachedModels();

    const status = window.modelPreloader.getStatus();

    showMLResults({
      message: 'Model cache status',
      hasTransformers: status.hasTransformers,
      models: status.models
    });

    showMLStatus('✅ Cache check complete (see browser console for details)', 'success');

  } catch (error) {
    showMLStatus(`❌ Error: ${error.message}`, 'error');
    console.error('[ML Debug] Cache check error:', error);
  }
}

/**
 * Handle single tab classification
 * Uses partial context (domain cluster only, not full session)
 * @param {Object} tab - Tab to classify
 * @param {HTMLElement} button - Button element to update
 */
async function handleClassifySingleTab(tab, button) {
  const originalText = button.textContent;

  try {
    // Disable button during classification
    button.disabled = true;
    button.textContent = '⏳';

    // Wait for ML Worker to be ready
    await checkMLStatus();

    // Extract partial context: only tabs from same domain
    const sameDomainTabs = currentTabs.filter(t => t.domain === tab.domain);
    const partialContext = ContextFeatures ? ContextFeatures.extractSessionContext(sameDomainTabs) : null;

    console.log(`[Classify Single] Classifying tab with partial context (${sameDomainTabs.length} tabs from ${tab.domain})`);

    // Classify single tab via background worker
    const response = await browser.runtime.sendMessage({
      action: 'classifyTab',
      tab: tab,
      sessionContext: partialContext
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    const result = response.result;

    console.log('[Classify Single] Classification complete:', {
      tab: tab.title,
      intent: result.classifications.intent.topK[0],
      status: result.classifications.status.topK[0],
      contentType: result.classifications.contentType.topK[0]
    });

    // Refresh tab list to show badges
    await renderTabList(currentTabs);

  } catch (error) {
    console.error('[Classify Single] Error:', error);
    alert(`❌ Classification failed: ${error.message}`);
  } finally {
    // Re-enable button
    button.disabled = false;
    button.textContent = originalText;
  }
}

/**
 * Handle "Classify All" button click
 * Run ML classification on all tabs via background worker
 * Uses full session context (all tabs)
 */
async function handleClassifyAll() {
  const btn = document.getElementById('classify-all-btn');
  const originalText = btn.textContent;

  try {
    // Disable button during classification
    btn.disabled = true;
    btn.textContent = '⏳ Classifying...';

    console.log('[Classify All] Starting batch classification...');

    // Wait for ML Worker to be ready
    await checkMLStatus();

    // Get all tabs (both local and synced)
    const tabs = allTabs;

    if (tabs.length === 0) {
      alert('No tabs to classify');
      return;
    }

    console.log(`[Classify All] Starting classification for ${tabs.length} tabs`);

    // Extract full session context
    const sessionContext = ContextFeatures ? ContextFeatures.extractSessionContext(tabs) : null;

    // Show progress in button
    btn.textContent = `🧠 Classifying ${tabs.length} tabs...`;

    // Run batch classification via background worker
    const startTime = Date.now();
    const response = await browser.runtime.sendMessage({
      action: 'classifyBatch',
      tabs: tabs,
      sessionContext: sessionContext
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    const totalTime = Date.now() - startTime;
    const results = response.results;

    console.log('[Classify All] Batch classification complete:', {
      totalTabs: results.length,
      totalTime: totalTime + 'ms',
      avgTimePerTab: Math.round(totalTime / results.length) + 'ms'
    });

    // Show success message
    const message = `✅ Classified ${results.length} tabs in ${(totalTime / 1000).toFixed(1)}s\n📊 Average: ${Math.round(totalTime / results.length)}ms per tab`;

    alert(message);

    // Refresh the tab list to show updated classifications
    await renderTabList(currentTabs);

  } catch (error) {
    console.error('[Classify All] Error:', error);
    alert(`❌ Classification failed: ${error.message}`);
  } finally {
    // Re-enable button
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ============================================================================
// ML Model Pre-loading Functions
// ============================================================================

/**
 * Start ML model pre-loading in background
 * Downloads models in UI context (better fetch limits than background worker)
 */
function startModelPreloading() {
  if (typeof modelPreloader === 'undefined') {
    console.error('[Model Preload] modelPreloader not available');
    return;
  }

  console.log('[Model Preload] Starting model pre-loading...');

  // Show progress toast
  const toast = document.getElementById('model-loading-toast');
  const progressList = document.getElementById('model-progress-list');
  const closeBtn = document.getElementById('close-toast-btn');

  toast.style.display = 'block';

  // Close button handler
  closeBtn.addEventListener('click', () => {
    toast.style.display = 'none';
  });

  // Set up progress callback
  modelPreloader.setProgressCallback((progress) => {
    updateModelProgress(progress);
  });

  // Start pre-loading lightweight models only (embeddings + classification)
  // Skip NER for now (too large - 420MB)
  modelPreloader.preloadLightweightModels()
    .then((results) => {
      console.log('[Model Preload] ✓ Lightweight models pre-loaded:', results);

      // Keep toast open - user must close manually
      // Add success message
      const successMsg = document.createElement('div');
      successMsg.style.color = '#4CAF50';
      successMsg.style.marginTop = '8px';
      successMsg.style.fontWeight = '600';
      successMsg.textContent = '✓ Models ready! You can close this.';
      progressList.appendChild(successMsg);

      // Notify background worker that models are ready
      browser.runtime.sendMessage({
        action: 'modelsReady',
        models: Object.keys(results).filter(k => results[k] !== null)
      }).catch(err => {
        console.error('[Model Preload] Failed to notify background worker:', err);
      });
    })
    .catch((error) => {
      console.error('[Model Preload] ✗ Failed to pre-load models:', error);

      // Show error in toast (stays open - user must close)
      const errorMsg = document.createElement('div');
      errorMsg.style.color = '#f44336';
      errorMsg.style.marginTop = '8px';
      errorMsg.style.fontWeight = '600';
      errorMsg.textContent = `❌ Failed to load models. See console for details.`;
      progressList.appendChild(errorMsg);
    });
}

/**
 * Update model loading progress in toast UI
 */
function updateModelProgress(progress) {
  const progressList = document.getElementById('model-progress-list');

  if (!progressList) return;

  // Clear and rebuild progress list
  progressList.innerHTML = '';

  for (const [key, model] of Object.entries(progress.allModels)) {
    const item = document.createElement('div');
    item.style.marginBottom = '8px';

    let icon = '⏳';
    let statusText = model.status;
    let color = '#666';

    if (model.status === 'ready') {
      icon = '✓';
      color = '#4CAF50';
    } else if (model.status === 'error') {
      icon = '✗';
      color = '#f44336';
      statusText = model.error || 'Failed';
    } else if (model.status === 'downloading' && progress.progress) {
      icon = '📥';
      statusText = `${Math.round(progress.progress)}%`;
      color = '#2196F3';
    } else if (model.status === 'loading') {
      icon = '⏳';
      statusText = 'Loading...';
      color = '#FF9800';
    }

    item.innerHTML = `
      <span style="color: ${color};">${icon}</span>
      <strong>${key}</strong>
      <span style="color: ${color}; font-size: 12px;">(${statusText})</span>
      <span style="color: #999; font-size: 11px;">${model.size}</span>
    `;

    progressList.appendChild(item);
  }
}

// TODO: Add keyboard shortcuts (Ctrl+A for select all, etc.)
// TODO: Add loading states / skeleton screens
// TODO: Add error handling UI (toast notifications?)
// TODO: Add undo functionality for bulk actions
