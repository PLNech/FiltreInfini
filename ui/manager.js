/**
 * Tab Manager UI Controller
 * Handles UI interactions and updates
 */

// State
let currentTabs = [];
let allTabs = []; // Keep full list for filtering
let selectedTabIds = new Set();
let domainCounts = {}; // Track tab counts per domain
let searchDebounceTimer = null;
let currentSortMode = 'lastAccessed'; // Default sort

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('FiltreInfini manager loaded');

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
  // Query controls with search-as-you-type
  const queryInput = document.getElementById('query-input');
  queryInput.addEventListener('input', handleSearchInput);
  queryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      handleRunQuery();
    }
  });

  document.getElementById('run-query-btn').addEventListener('click', handleRunQuery);
  document.getElementById('clear-query-btn').addEventListener('click', handleClearQuery);

  // Quick filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleQuickFilter(e.target.dataset.filter));
  });

  // Bulk actions
  document.getElementById('bulk-main-btn').addEventListener('click', () => handleBulkGroup('main'));
  document.getElementById('bulk-staging-btn').addEventListener('click', () => handleBulkGroup('staging'));
  document.getElementById('bulk-bin-btn').addEventListener('click', () => handleBulkGroup('bin'));
  document.getElementById('bulk-close-btn').addEventListener('click', handleBulkClose);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Sort dropdown
  document.getElementById('sort-select').addEventListener('change', handleSortChange);
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
  allTabs = await tabQuery.getAllTabsWithMetadata();
  currentTabs = allTabs;

  // Calculate domain counts
  domainCounts = {};
  for (const tab of allTabs) {
    domainCounts[tab.domain] = (domainCounts[tab.domain] || 0) + 1;
  }

  await renderTabList(currentTabs);
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
    const itemEl = createTabItemElement(tab, group);
    listEl.appendChild(itemEl);
  }
}

/**
 * Create a single tab item element
 */
function createTabItemElement(tab, group) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabId = tab.id;

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

  const title = document.createElement('div');
  title.className = 'tab-item__title';
  title.textContent = tab.title;
  title.title = tab.title; // Full title on hover

  const meta = document.createElement('div');
  meta.className = 'tab-item__meta';

  // Domain with count and brand color
  const domain = document.createElement('span');
  domain.className = 'tab-item__domain';
  const domainCount = domainCounts[tab.domain] || 0;
  domain.textContent = `${tab.domain}${domainCount > 1 ? ` (${domainCount})` : ''}`;

  // Apply brand color
  const brandColor = getDomainColor(tab.domain);
  domain.style.color = brandColor;
  domain.style.fontWeight = '500';

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

  info.appendChild(title);
  info.appendChild(meta);

  const badge = document.createElement('span');
  badge.className = `tab-item__badge tab-item__badge--${group}`;
  badge.textContent = group.charAt(0).toUpperCase() + group.slice(1);

  item.appendChild(checkbox);
  item.appendChild(info);
  item.appendChild(badge);

  // Make item clickable to focus tab
  item.addEventListener('click', (e) => {
    if (e.target !== checkbox) {
      browser.tabs.update(tab.id, { active: true });
    }
  });

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

  // Execute query
  const results = await tabQuery.executeQuery(filters);

  // Add metadata
  const resultsWithMetadata = results.map(tab => ({
    ...tab,
    age: tabQuery.calculateAge(tab),
    domain: tabQuery.extractDomain(tab.url),
    ageFormatted: tabQuery.formatAge(tabQuery.calculateAge(tab))
  }));

  // Render results
  currentTabs = resultsWithMetadata;
  await renderTabList(currentTabs);
}

/**
 * Handle clear query
 */
async function handleClearQuery() {
  document.getElementById('query-input').value = '';
  await loadAllTabs();
}

/**
 * Handle quick filter buttons
 */
async function handleQuickFilter(filterType) {
  const input = document.getElementById('query-input');

  // Remove active class from all buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Add active class to clicked button
  event.target.classList.add('active');

  switch (filterType) {
    case 'all':
      input.value = '';
      break;
    case 'week':
      input.value = 'age > 7d';
      break;
    case 'forgotten':
      input.value = 'age > 14d';
      break;
    case 'ancient':
      input.value = 'age > 30d';
      break;
    case '6months':
      input.value = 'age > 180d';
      break;
    case '1year':
      input.value = 'age > 365d';
      break;
    case '2years':
      input.value = 'age > 730d';
      break;
    case '3years':
      input.value = 'age > 1095d';
      break;
  }

  await handleRunQuery();
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

  const confirmed = confirm(`Close ${selectedTabIds.size} tabs?`);
  if (!confirmed) {
    return;
  }

  const idsArray = Array.from(selectedTabIds);

  try {
    await browser.tabs.remove(idsArray);

    // Clean up storage
    for (let tabId of idsArray) {
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
 */
async function updateStatistics() {
  const counts = await groupManager.getGroupCounts();

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

// TODO: Add keyboard shortcuts (Ctrl+A for select all, etc.)
// TODO: Add loading states / skeleton screens
// TODO: Add error handling UI (toast notifications?)
// TODO: Add undo functionality for bulk actions
