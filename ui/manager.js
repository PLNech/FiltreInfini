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
let searchDebounceTimer = null;
let currentSortMode = 'lastAccessed'; // Default sort
let currentView = 'list'; // 'list' or 'groups'

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

  // Bulk actions
  document.getElementById('bulk-main-btn').addEventListener('click', () => handleBulkGroup('main'));
  document.getElementById('bulk-staging-btn').addEventListener('click', () => handleBulkGroup('staging'));
  document.getElementById('bulk-bin-btn').addEventListener('click', () => handleBulkGroup('bin'));
  document.getElementById('bulk-close-btn').addEventListener('click', handleBulkClose);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Sort dropdown
  document.getElementById('sort-select').addEventListener('change', handleSortChange);

  // View switcher
  document.getElementById('view-list-btn').addEventListener('click', () => switchView('list'));
  document.getElementById('view-groups-btn').addEventListener('click', () => switchView('groups'));
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

  // Calculate filter counts
  await updateFilterCounts();

  await renderTabList(currentTabs);
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

  // Actions container
  const actions = document.createElement('div');
  actions.className = 'tab-item__actions';

  // Go to tab button
  const goToBtn = document.createElement('button');
  goToBtn.className = 'tab-item__action-btn';
  goToBtn.textContent = '➡️';
  goToBtn.title = 'Go to tab';
  goToBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    browser.tabs.update(tab.id, { active: true });
  });

  // Load metadata button
  const metadataBtn = document.createElement('button');
  metadataBtn.className = 'tab-item__action-btn';
  metadataBtn.textContent = '📊';
  metadataBtn.title = 'Load metadata';
  metadataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleLoadMetadata(tab);
  });

  actions.appendChild(goToBtn);
  actions.appendChild(metadataBtn);
  actions.appendChild(badge);

  item.appendChild(checkbox);
  item.appendChild(info);
  item.appendChild(actions);

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
  }

  await handleRunQuery();
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
 * Render groups view with domain cards grouped by category
 */
function renderGroupsView(tabs) {
  const container = document.getElementById('groups-container');
  const countEl = document.getElementById('groups-count');

  // Group tabs by domain
  const domainGroups = {};
  for (const tab of tabs) {
    const domain = tab.domain;
    if (!domainGroups[domain]) {
      domainGroups[domain] = [];
    }
    domainGroups[domain].push(tab);
  }

  // Sort domains by tab count (descending)
  const sortedDomains = Object.keys(domainGroups).sort((a, b) => {
    return domainGroups[b].length - domainGroups[a].length;
  });

  countEl.textContent = sortedDomains.length;

  // Clear container
  container.innerHTML = '';

  if (sortedDomains.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-xl);">No domains found</p>';
    return;
  }

  // Create domain cards
  for (const domain of sortedDomains) {
    const domainTabs = domainGroups[domain];
    const card = createDomainCard(domain, domainTabs);
    container.appendChild(card);
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

  try {
    // Fetch metadata
    const metadata = await metadataManager.getMetadata(tab.id);

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
      html += `<div class="metadata-field__value">${escapeHtml(metadata.og.title)}</div>`;
      html += '</div>';
    }

    if (metadata.og.description) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Description</div>';
      html += `<div class="metadata-field__value">${escapeHtml(metadata.og.description)}</div>`;
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
      html += `<div class="metadata-field__value">${escapeHtml(metadata.og.type)}</div>`;
      html += '</div>';
    }

    if (metadata.og.siteName) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Site Name</div>';
      html += `<div class="metadata-field__value">${escapeHtml(metadata.og.siteName)}</div>`;
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
      html += `<div class="metadata-field__value">${escapeHtml(metadata.meta.description)}</div>`;
      html += '</div>';
    }

    if (metadata.meta.keywords) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Keywords</div>';
      html += `<div class="metadata-field__value">${escapeHtml(metadata.meta.keywords)}</div>`;
      html += '</div>';
    }

    if (metadata.meta.author) {
      html += '<div class="metadata-field">';
      html += '<div class="metadata-field__label">Author</div>';
      html += `<div class="metadata-field__value">${escapeHtml(metadata.meta.author)}</div>`;
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
      html += `<div class="metadata-field__value">${escapeHtml(metadata.content.language)}</div>`;
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

// TODO: Add keyboard shortcuts (Ctrl+A for select all, etc.)
// TODO: Add loading states / skeleton screens
// TODO: Add error handling UI (toast notifications?)
// TODO: Add undo functionality for bulk actions
