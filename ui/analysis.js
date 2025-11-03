/**
 * Analysis UI - Display and filter analyzed tabs
 */

let analysisData = null;
let allTabs = [];
let filteredTabs = [];
let currentPage = 1;
const TABS_PER_PAGE = 50;

const filters = {
  search: '',
  intent: new Set(),
  status: new Set(),
  contentType: new Set(),
  domain: new Set()
};

// Similar tabs state
let similarToTab = null;
let similarityThreshold = 0.7;

// Chart instances (for lazy loading and cleanup)
let chartInstances = {
  overview: [],
  classification: [],
  entities: [],
  domains: [],
  map: []
};
let currentChartTab = 'overview';

// Last loaded file for quick reload
let lastLoadedFile = null;

// Map state
let leafletMap = null;
let geocodingCache = {};

// Chart configuration
let chartSize = 10; // Default top 10

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadAnalysis();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'manager.html';
  });

  // File loading
  document.getElementById('load-file-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      lastLoadedFile = file;
      loadAnalysisFromFile(file);
    }
  });

  // Reload last file button
  document.getElementById('reload-last-btn').addEventListener('click', () => {
    if (lastLoadedFile) {
      loadAnalysisFromFile(lastLoadedFile);
    }
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    filters.search = e.target.value.toLowerCase();
    applyFilters();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage();
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredTabs.length / TABS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderPage();
    }
  });

  // Similarity threshold slider
  document.getElementById('similarity-threshold').addEventListener('input', (e) => {
    similarityThreshold = parseFloat(e.target.value);
    document.getElementById('threshold-value').textContent = similarityThreshold.toFixed(2);

    // Re-apply similar tabs filter if active
    if (similarToTab) {
      showSimilarTabs(similarToTab.id);
    }
  });

  // Clear similar filter button
  document.getElementById('clear-similar-btn').addEventListener('click', clearSimilarFilter);

  // Chart tab switching
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchChartTab(tabName);
    });
  });

  // Geocode locations button
  document.getElementById('geocode-locations-btn').addEventListener('click', geocodeAndMapLocations);

  // Map popup tab links (event delegation on map container)
  document.getElementById('location-map').addEventListener('click', (e) => {
    if (e.target.classList.contains('popup-tab-link')) {
      const tabId = parseInt(e.target.dataset.tabId);
      scrollToTab(tabId);
    }
  });

  // Chart size slider
  document.getElementById('chart-size-slider').addEventListener('input', (e) => {
    chartSize = parseInt(e.target.value);
    document.getElementById('chart-size-value').textContent = `Top ${chartSize}`;

    // Re-render current tab's charts
    if (analysisData && currentChartTab !== 'overview') {
      renderChartsForTab(currentChartTab);
    }
  });
}

/**
 * Load analysis data from a File object
 */
async function loadAnalysisFromFile(file) {
  try {
    console.log(`[Analysis] Loading from file: ${file.name}`);

    const text = await file.text();
    analysisData = JSON.parse(text);

    console.log(`[Analysis] Loaded ${analysisData.tabs.length} analyzed tabs`);

    // Load cached geocoding results from localStorage
    const cachedGeocodingKey = `geocoding_${file.name}`;
    const cachedGeocoding = localStorage.getItem(cachedGeocodingKey);
    if (cachedGeocoding) {
      geocodingCache = JSON.parse(cachedGeocoding);
      console.log(`[Analysis] Loaded ${Object.keys(geocodingCache).length} cached geocoding results`);
    } else {
      geocodingCache = {};
    }

    // Cache filename (for reload button)
    localStorage.setItem('lastAnalysisFilename', file.name);
    console.log(`[Analysis] Cached filename: ${file.name}`);

    // Initialize UI
    allTabs = analysisData.tabs;
    filteredTabs = [...allTabs];

    renderStatistics();
    renderCharts(); // Render beautiful charts!
    renderFilters();
    applyFilters();

  } catch (error) {
    console.error('[Analysis] File load error:', error);
    document.getElementById('tabs-container').innerHTML = `
      <div class="empty-state">
        <h3>❌ Failed to load analysis file</h3>
        <p>${error.message}</p>
        <p style="margin-top: 10px;">
          Please select a valid analysis JSON file.
        </p>
      </div>
    `;
  }
}

/**
 * Load analysis data (initial load - show hint if available)
 */
async function loadAnalysis() {
  // Check if we have a previously loaded filename
  const lastFilename = localStorage.getItem('lastAnalysisFilename');

  if (lastFilename) {
    // Show reload button if we have a cached filename
    document.getElementById('reload-last-btn').style.display = 'inline-block';

    // Show instructions with hint about last file
    document.getElementById('tabs-container').innerHTML = `
      <div class="empty-state">
        <h3>📂 No analysis loaded</h3>
        <p>Click "📂 Load Analysis File" to load your analysis JSON file.</p>
        <p style="margin-top: 10px;">
          <strong>Last loaded:</strong> <code>${lastFilename}</code>
        </p>
        <p style="margin-top: 10px;">
          <strong>To generate new analysis:</strong><br>
          <code>node scripts/analyze-tabs.js --all</code>
        </p>
        <p style="margin-top: 10px;">
          Analysis files are saved in: <code>data/analysis-TIMESTAMP.json</code>
        </p>
      </div>
    `;
  } else {
    // No previous file - show basic instructions
    document.getElementById('tabs-container').innerHTML = `
      <div class="empty-state">
        <h3>📂 No analysis loaded</h3>
        <p>Click "📂 Load Analysis File" to load your analysis JSON file.</p>
        <p style="margin-top: 10px;">
          <strong>To generate analysis:</strong><br>
          <code>node scripts/analyze-tabs.js --all</code>
        </p>
        <p style="margin-top: 10px;">
          Analysis files are saved in: <code>data/analysis-TIMESTAMP.json</code>
        </p>
      </div>
    `;
  }
}

/**
 * Render statistics cards
 */
function renderStatistics() {
  const { metadata, statistics } = analysisData;

  const date = new Date(metadata.analyzedAt);
  document.getElementById('analysis-info').textContent =
    `Analysis from ${date.toLocaleString()} • ${metadata.totalTabs} tabs`;

  // Count actual unique values from ALL tabs (not just top 20)
  const uniqueDomains = new Set(allTabs.map(t => t.domain)).size;

  // Count tabs with entities
  const tabsWithEntities = allTabs.filter(t =>
    t.entities && (
      (t.entities.people && t.entities.people.length > 0) ||
      (t.entities.organizations && t.entities.organizations.length > 0) ||
      (t.entities.locations && t.entities.locations.length > 0)
    )
  ).length;

  // Count unique entity mentions across all tabs
  const allPeople = new Set();
  const allOrgs = new Set();
  const allLocs = new Set();

  allTabs.forEach(tab => {
    if (tab.entities) {
      if (tab.entities.people) tab.entities.people.forEach(p => allPeople.add(p.word));
      if (tab.entities.organizations) tab.entities.organizations.forEach(o => allOrgs.add(o.word));
      if (tab.entities.locations) tab.entities.locations.forEach(l => allLocs.add(l.word));
    }
  });

  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${metadata.totalTabs}</div>
      <div class="stat-label">Total Tabs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${uniqueDomains}</div>
      <div class="stat-label">Unique Domains</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${tabsWithEntities}</div>
      <div class="stat-label">Tabs with Entities</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allPeople.size}</div>
      <div class="stat-label">Unique People</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allOrgs.size}</div>
      <div class="stat-label">Unique Organizations</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allLocs.size}</div>
      <div class="stat-label">Unique Locations</div>
    </div>
  `;
}

/**
 * Render filter pills
 */
function renderFilters() {
  const { statistics } = analysisData;

  // Intent filters
  const intentFilters = document.getElementById('intent-filters');
  intentFilters.innerHTML = Object.keys(statistics.intent)
    .map(label => `
      <div class="filter-pill" data-filter="intent" data-value="${label}">
        ${label} (${statistics.intent[label]})
      </div>
    `).join('');

  // Status filters
  const statusFilters = document.getElementById('status-filters');
  statusFilters.innerHTML = Object.keys(statistics.status)
    .map(label => `
      <div class="filter-pill" data-filter="status" data-value="${label}">
        ${label} (${statistics.status[label]})
      </div>
    `).join('');

  // Content type filters
  const typeFilters = document.getElementById('type-filters');
  typeFilters.innerHTML = Object.keys(statistics.contentType)
    .map(label => `
      <div class="filter-pill" data-filter="contentType" data-value="${label}">
        ${label} (${statistics.contentType[label]})
      </div>
    `).join('');

  // Domain filters (top 10)
  const domainFilters = document.getElementById('domain-filters');
  domainFilters.innerHTML = Object.entries(statistics.topDomains)
    .slice(0, 10)
    .map(([domain, count]) => `
      <div class="filter-pill" data-filter="domain" data-value="${domain}">
        ${domain} (${count})
      </div>
    `).join('');

  // Add click handlers
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const filterType = pill.dataset.filter;
      const value = pill.dataset.value;

      if (filters[filterType].has(value)) {
        filters[filterType].delete(value);
        pill.classList.remove('active');
      } else {
        filters[filterType].add(value);
        pill.classList.add('active');
      }

      applyFilters();
    });
  });
}

/**
 * Apply all active filters
 */
function applyFilters() {
  filteredTabs = allTabs.filter(tab => {
    // Similar tabs filter (takes precedence)
    if (similarToTab) {
      const similarIds = new Set(
        similarToTab.similarTabs
          .filter(s => s.similarity >= similarityThreshold)
          .map(s => s.id)
      );
      if (!similarIds.has(tab.id)) {
        return false;
      }
    }

    // Search filter
    if (filters.search) {
      const searchStr = filters.search;
      const matchTitle = tab.title.toLowerCase().includes(searchStr);
      const matchDomain = tab.domain.toLowerCase().includes(searchStr);
      const matchEntities = tab.entities &&
        (JSON.stringify(tab.entities).toLowerCase().includes(searchStr));

      if (!matchTitle && !matchDomain && !matchEntities) {
        return false;
      }
    }

    // Intent filter
    if (filters.intent.size > 0 && tab.classification) {
      if (!filters.intent.has(tab.classification.intent.label)) {
        return false;
      }
    }

    // Status filter
    if (filters.status.size > 0 && tab.classification) {
      if (!filters.status.has(tab.classification.status.label)) {
        return false;
      }
    }

    // Content type filter
    if (filters.contentType.size > 0 && tab.classification) {
      if (!filters.contentType.has(tab.classification.contentType.label)) {
        return false;
      }
    }

    // Domain filter
    if (filters.domain.size > 0) {
      if (!filters.domain.has(tab.domain)) {
        return false;
      }
    }

    return true;
  });

  // Update results count
  if (similarToTab) {
    document.getElementById('results-count').textContent =
      `${filteredTabs.length} tabs similar to "${similarToTab.title.substring(0, 50)}..." (threshold: ${similarityThreshold.toFixed(2)})`;
  } else {
    document.getElementById('results-count').textContent =
      `${filteredTabs.length} of ${allTabs.length} tabs`;
  }

  // Reset to page 1
  currentPage = 1;
  renderPage();
}

/**
 * Clear all filters
 */
function clearFilters() {
  filters.search = '';
  filters.intent.clear();
  filters.status.clear();
  filters.contentType.clear();
  filters.domain.clear();

  document.getElementById('search-input').value = '';
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.remove('active');
  });

  clearSimilarFilter();
  applyFilters();
}

/**
 * Clear similar tabs filter
 */
function clearSimilarFilter() {
  similarToTab = null;
  document.getElementById('similar-banner').style.display = 'none';
  applyFilters();
}

/**
 * Render current page of tabs
 */
function renderPage() {
  const start = (currentPage - 1) * TABS_PER_PAGE;
  const end = start + TABS_PER_PAGE;
  const pageTabs = filteredTabs.slice(start, end);

  const container = document.getElementById('tabs-container');

  if (pageTabs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tabs match your filters</h3>
        <p>Try adjusting your search or clearing filters</p>
      </div>
    `;
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  container.innerHTML = `
    <div class="tabs-list">
      ${pageTabs.map(tab => renderTabCard(tab)).join('')}
    </div>
  `;

  // Add event delegation for tab interactions
  container.addEventListener('click', async (e) => {
    // Handle similar tabs button
    if (e.target.classList.contains('similar-tabs-btn') || e.target.closest('.similar-tabs-btn')) {
      const btn = e.target.classList.contains('similar-tabs-btn') ? e.target : e.target.closest('.similar-tabs-btn');
      const tabId = btn.dataset.tabId;
      if (tabId) {
        showSimilarTabs(tabId);
      }
      return;
    }

    // Handle tab card click (switch to tab)
    const tabCard = e.target.closest('.tab-card');
    if (tabCard) {
      // Don't switch if clicking on a link or button
      if (e.target.tagName === 'A' || e.target.closest('a') || e.target.closest('button')) {
        return;
      }

      const tabId = parseInt(tabCard.dataset.tabId);
      try {
        await browser.tabs.update(tabId, { active: true });
        // Also focus the window
        const tab = await browser.tabs.get(tabId);
        await browser.windows.update(tab.windowId, { focused: true });
      } catch (error) {
        console.error('Failed to switch to tab:', error);
        alert(`Failed to switch to tab: ${error.message}`);
      }
    }
  });

  // Update pagination
  const totalPages = Math.ceil(filteredTabs.length / TABS_PER_PAGE);
  document.getElementById('page-info').textContent =
    `Page ${currentPage} of ${totalPages} (${filteredTabs.length} tabs)`;
  document.getElementById('prev-page').disabled = currentPage === 1;
  document.getElementById('next-page').disabled = currentPage === totalPages;
  document.getElementById('pagination').style.display = 'flex';

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Render a single tab card
 */
function renderTabCard(tab) {
  const { classification, entities, searchQuery } = tab;

  const badges = classification ? `
    <span class="badge badge-intent">${classification.intent.label}</span>
    <span class="badge badge-status">${classification.status.label}</span>
    <span class="badge badge-type">${classification.contentType.label}</span>
  ` : '';

  // Search query display
  const searchQueryHtml = searchQuery ? `
    <div class="tab-search-query" style="margin-top: 8px; padding: 6px 10px; background: #FFF9C4; border-left: 3px solid #FBC02D; border-radius: 4px; font-size: 12px;">
      <span style="font-weight: 600; color: #F57F17;">🔍 Search:</span>
      <span style="color: #333;">${escapeHtml(searchQuery)}</span>
    </div>
  ` : '';

  const entitiesHtml = entities && (
    entities.people.length > 0 ||
    entities.organizations.length > 0 ||
    entities.locations.length > 0
  ) ? `
    <div class="tab-entities">
      ${entities.people.length > 0 ? `
        <div class="entity-group">
          <span class="entity-label">👤 People:</span>
          ${entities.people.map(e => e.word).join(', ')}
        </div>
      ` : ''}
      ${entities.organizations.length > 0 ? `
        <div class="entity-group">
          <span class="entity-label">🏢 Organizations:</span>
          ${entities.organizations.map(e => e.word).join(', ')}
        </div>
      ` : ''}
      ${entities.locations.length > 0 ? `
        <div class="entity-group">
          <span class="entity-label">📍 Locations:</span>
          ${entities.locations.map(e => e.word).join(', ')}
        </div>
      ` : ''}
    </div>
  ` : '';

  // Get similarity score if we're in similar mode
  let similarityBadge = '';
  if (similarToTab && tab.id !== similarToTab.id) {
    const similarEntry = similarToTab.similarTabs.find(s => s.id === tab.id);
    if (similarEntry) {
      const score = (similarEntry.similarity * 100).toFixed(0);
      similarityBadge = `<span class="badge" style="background: #4CAF50; color: white; margin-left: 8px;">${score}% similar</span>`;
    }
  }

  const similarBtn = tab.similarTabs && tab.similarTabs.length > 0 ? `
    <button class="similar-tabs-btn" data-tab-id="${escapeHtml(tab.id)}">
      🔗 ${tab.similarTabs.length} similar
    </button>
  ` : '';

  return `
    <div class="tab-card" data-tab-id="${tab.id}" style="cursor: pointer; transition: all 0.2s;">
      <div class="tab-header">
        <div style="flex: 1;">
          <div class="tab-title" style="transition: text-decoration 0.2s;">${escapeHtml(tab.title)}${similarityBadge}</div>
          <div class="tab-domain">
            <a href="${tab.url}" target="_blank" onclick="event.stopPropagation();">${tab.domain}</a>
          </div>
        </div>
        ${similarBtn}
      </div>
      <div class="tab-badges">${badges}</div>
      ${searchQueryHtml}
      ${entitiesHtml}
    </div>
  `;
}

/**
 * Show similar tabs for a given tab
 */
function showSimilarTabs(tabId) {
  const tab = allTabs.find(t => t.id === tabId);
  if (!tab || !tab.similarTabs) return;

  similarToTab = tab;

  // Show similar tabs banner with threshold controls
  const banner = document.getElementById('similar-banner');
  banner.style.display = 'flex';

  const bannerContent = document.getElementById('similar-banner-content');
  const aboveThreshold = tab.similarTabs.filter(s => s.similarity >= similarityThreshold).length;
  bannerContent.innerHTML = `
    <div style="flex: 1;">
      <strong>🔗 Viewing tabs similar to:</strong> ${escapeHtml(tab.title.substring(0, 80))}${tab.title.length > 80 ? '...' : ''}
      <br>
      <span style="font-size: 12px; color: #666;">
        ${aboveThreshold} of ${tab.similarTabs.length} similar tabs above threshold
      </span>
    </div>
  `;

  // Apply filters (will use similarToTab state)
  applyFilters();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Switch chart tab (with lazy loading)
 */
function switchChartTab(tabName) {
  if (currentChartTab === tabName) return;

  // Destroy charts in old tab
  destroyCharts(currentChartTab);

  // Update UI
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  document.querySelectorAll('.chart-tab-content').forEach(content => {
    content.style.display = 'none';
  });

  document.getElementById(`tab-${tabName}`).style.display = 'block';

  // Render charts for new tab
  currentChartTab = tabName;
  renderChartsForTab(tabName);
}

/**
 * Destroy charts in a specific tab
 */
function destroyCharts(tabName) {
  if (chartInstances[tabName]) {
    chartInstances[tabName].forEach(chart => {
      if (chart) chart.destroy();
    });
    chartInstances[tabName] = [];
  }
}

/**
 * Render charts for a specific tab (lazy loading)
 */
function renderChartsForTab(tabName) {
  const { statistics } = analysisData;

  // Color palettes
  const colors = {
    intent: ['#2196F3', '#4CAF50', '#FF9800'],
    status: ['#9C27B0', '#E91E63', '#00BCD4', '#FFC107', '#8BC34A'],
    content: ['#3F51B5', '#009688', '#CDDC39'],
    entities: ['#673AB7', '#FF5722', '#795548']
  };

  chartInstances[tabName] = [];

  if (tabName === 'overview') {
    // Entity Types Distribution
    const peopleCount = Object.keys(statistics.topEntities.people).length;
    const orgsCount = Object.keys(statistics.topEntities.organizations).length;
    const locsCount = Object.keys(statistics.topEntities.locations).length;

    chartInstances[tabName].push(new Chart(document.getElementById('entities-chart'), {
      type: 'pie',
      data: {
        labels: ['People', 'Organizations', 'Locations'],
        datasets: [{
          data: [peopleCount, orgsCount, locsCount],
          backgroundColor: colors.entities,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }));

    // Intent Distribution
    chartInstances[tabName].push(new Chart(document.getElementById('intent-chart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(statistics.intent),
        datasets: [{
          data: Object.values(statistics.intent),
          backgroundColor: colors.intent,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }));
  } else if (tabName === 'classification') {
    // Intent (duplicate for classification tab)
    chartInstances[tabName].push(new Chart(document.getElementById('intent-chart-dup'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(statistics.intent),
        datasets: [{
          data: Object.values(statistics.intent),
          backgroundColor: colors.intent,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }));

    // Status
    chartInstances[tabName].push(new Chart(document.getElementById('status-chart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(statistics.status),
        datasets: [{
          data: Object.values(statistics.status),
          backgroundColor: colors.status,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }));

    // Content Type
    chartInstances[tabName].push(new Chart(document.getElementById('content-chart'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(statistics.contentType),
        datasets: [{
          data: Object.values(statistics.contentType),
          backgroundColor: colors.content,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }));
  } else if (tabName === 'entities') {
    // Top People (use chartSize)
    const topPeople = Object.entries(statistics.topEntities.people).slice(0, chartSize);
    chartInstances[tabName].push(new Chart(document.getElementById('people-chart'), {
      type: 'bar',
      data: {
        labels: topPeople.map(([name]) => name),
        datasets: [{
          label: 'Mentions',
          data: topPeople.map(([_, count]) => count),
          backgroundColor: '#673AB7',
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => topPeople[items[0].dataIndex][0] // Full name in tooltip
            }
          }
        },
        scales: {
          x: { beginAtZero: true },
          y: {
            ticks: {
              callback: function(value, index) {
                const label = topPeople[index][0];
                return label.length > 20 ? label.substring(0, 20) + '...' : label;
              }
            }
          }
        }
      }
    }));

    // Top Organizations (use chartSize)
    const topOrgs = Object.entries(statistics.topEntities.organizations).slice(0, chartSize);
    chartInstances[tabName].push(new Chart(document.getElementById('orgs-chart'), {
      type: 'bar',
      data: {
        labels: topOrgs.map(([org]) => org),
        datasets: [{
          label: 'Mentions',
          data: topOrgs.map(([_, count]) => count),
          backgroundColor: '#FF5722',
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => topOrgs[items[0].dataIndex][0]
            }
          }
        },
        scales: {
          x: { beginAtZero: true },
          y: {
            ticks: {
              callback: function(value, index) {
                const label = topOrgs[index][0];
                return label.length > 20 ? label.substring(0, 20) + '...' : label;
              }
            }
          }
        }
      }
    }));

    // Top Locations (use chartSize)
    const topLocs = Object.entries(statistics.topEntities.locations).slice(0, chartSize);
    chartInstances[tabName].push(new Chart(document.getElementById('locations-chart'), {
      type: 'bar',
      data: {
        labels: topLocs.map(([loc]) => loc),
        datasets: [{
          label: 'Mentions',
          data: topLocs.map(([_, count]) => count),
          backgroundColor: '#795548',
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => topLocs[items[0].dataIndex][0]
            }
          }
        },
        scales: {
          x: { beginAtZero: true },
          y: {
            ticks: {
              callback: function(value, index) {
                const label = topLocs[index][0];
                return label.length > 20 ? label.substring(0, 20) + '...' : label;
              }
            }
          }
        }
      }
    }));
  } else if (tabName === 'domains') {
    // Top Domains (use chartSize)
    const topDomains = Object.entries(statistics.topDomains).slice(0, chartSize);
    chartInstances[tabName].push(new Chart(document.getElementById('domains-chart'), {
      type: 'bar',
      data: {
        labels: topDomains.map(([domain]) => domain),
        datasets: [{
          label: 'Tabs',
          data: topDomains.map(([_, count]) => count),
          backgroundColor: '#2196F3',
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { beginAtZero: true }
        }
      }
    }));

    // Search Query Domains (if present)
    const searchTabs = allTabs.filter(t => t.searchQuery);
    if (searchTabs.length > 0) {
      const searchDomains = {};
      searchTabs.forEach(tab => {
        searchDomains[tab.domain] = (searchDomains[tab.domain] || 0) + 1;
      });

      const topSearchDomains = Object.entries(searchDomains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, chartSize);

      document.getElementById('search-chart-container').style.display = 'block';

      chartInstances[tabName].push(new Chart(document.getElementById('search-chart'), {
        type: 'bar',
        data: {
          labels: topSearchDomains.map(([domain]) => domain),
          datasets: [{
            label: 'Search Queries',
            data: topSearchDomains.map(([_, count]) => count),
            backgroundColor: '#4CAF50',
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      }));
    }
  }
}

/**
 * Initialize charts (show section and render first tab)
 */
function renderCharts() {
  // Show charts section
  document.getElementById('charts-section').style.display = 'block';

  // Render initial tab (overview)
  renderChartsForTab('overview');
}

/**
 * Geocode a location using Nominatim API with full metadata
 */
async function geocodeLocation(locationName) {
  // Check cache first
  if (geocodingCache[locationName]) {
    return geocodingCache[locationName];
  }

  // Filter out known non-locations
  const nonLocations = ['duck', 'duckduckgo', 'google', 'wikipedia', 'amazon', 'reddit'];
  if (nonLocations.includes(locationName.toLowerCase())) {
    geocodingCache[locationName] = null;
    return null;
  }

  try {
    // Request with extratags for Wikipedia, wikidata, etc.
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1&extratags=1&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'FiltreInfini/0.1 (Tab Analysis Extension)'
        }
      }
    );

    if (!response.ok) {
      console.warn(`Geocoding failed for "${locationName}":`, response.status);
      geocodingCache[locationName] = null;
      return null;
    }

    const results = await response.json();

    if (results && results.length > 0) {
      const r = results[0];
      const result = {
        name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type,
        class: r.class,
        importance: r.importance,
        wikipedia: r.extratags?.wikipedia || null,
        wikidata: r.extratags?.wikidata || null,
        website: r.extratags?.website || null,
        population: r.extratags?.population || null
      };
      geocodingCache[locationName] = result;
      return result;
    } else {
      geocodingCache[locationName] = null;
      return null;
    }
  } catch (error) {
    console.error(`Geocoding error for "${locationName}":`, error);
    geocodingCache[locationName] = null;
    return null;
  }
}

/**
 * Geocode and map all locations
 */
async function geocodeAndMapLocations() {
  const statusEl = document.getElementById('map-status');
  const statusText = document.getElementById('map-status-text');
  const button = document.getElementById('geocode-locations-btn');

  // Show status
  statusEl.style.display = 'block';
  button.disabled = true;
  button.textContent = '⏳ Geocoding...';

  // Get ALL location entities from all tabs with NER scores and tab references
  const locationData = {}; // { locationName: { count, avgScore, tabs: [{id, title, score}] } }

  allTabs.forEach(tab => {
    if (tab.entities && tab.entities.locations) {
      tab.entities.locations.forEach(loc => {
        if (!locationData[loc.word]) {
          locationData[loc.word] = { count: 0, totalScore: 0, tabs: [] };
        }
        locationData[loc.word].count++;
        locationData[loc.word].totalScore += loc.score || 0;
        locationData[loc.word].tabs.push({
          id: tab.id,
          title: tab.title,
          score: loc.score || 0
        });
      });
    }
  });

  // Calculate average NER scores
  Object.keys(locationData).forEach(loc => {
    locationData[loc].avgScore = locationData[loc].totalScore / locationData[loc].count;
  });

  const locationEntities = Object.entries(locationData)
    .sort((a, b) => b[1].count - a[1].count);
  const totalLocations = locationEntities.length;

  statusText.textContent = `Geocoding ${totalLocations} locations... (1 req/sec rate limit)`;

  // Initialize map if not exists
  if (!leafletMap) {
    leafletMap = L.map('location-map').setView([20, 0], 2); // World view

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(leafletMap);
  }

  // Clear existing markers
  leafletMap.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      leafletMap.removeLayer(layer);
    }
  });

  let validated = 0;
  const validatedLocations = [];

  for (let i = 0; i < locationEntities.length; i++) {
    const [locationName, data] = locationEntities[i];

    statusText.textContent = `Geocoding ${i + 1}/${totalLocations}: "${locationName}"...`;

    const result = await geocodeLocation(locationName);

    if (result) {
      validated++;

      // Store for list rendering
      validatedLocations.push({
        name: locationName,
        geo: result,
        data: data
      });

      // Add marker with rich popup
      const marker = L.marker([result.lat, result.lon]).addTo(leafletMap);

      // Create clickable tab list for popup
      const tabLinks = data.tabs.slice(0, 5).map(tab =>
        `<div style="cursor: pointer; color: #1976d2; text-decoration: underline; font-size: 11px; margin: 2px 0;"
              data-tab-id="${tab.id}"
              class="popup-tab-link"
              title="${escapeHtml(tab.title)}">
          ${escapeHtml(tab.title.substring(0, 40))}${tab.title.length > 40 ? '...' : ''}
        </div>`
      ).join('');

      const moreText = data.tabs.length > 5 ?
        `<div style="font-size: 11px; color: #666; margin-top: 4px;">+ ${data.tabs.length - 5} more</div>` : '';

      // Rich popup content
      const popupContent = `
        <div style="max-width: 250px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${locationName}</div>
          <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${result.name}</div>

          ${result.type || result.class ? `
            <div style="font-size: 11px; margin-bottom: 4px;">
              <strong>Type:</strong> ${result.class || ''}${result.type ? ` / ${result.type}` : ''}
            </div>
          ` : ''}

          ${result.importance ? `
            <div style="font-size: 11px; margin-bottom: 4px;">
              <strong>Importance:</strong> ${(result.importance * 100).toFixed(1)}%
            </div>
          ` : ''}

          ${result.population ? `
            <div style="font-size: 11px; margin-bottom: 4px;">
              <strong>Population:</strong> ${parseInt(result.population).toLocaleString()}
            </div>
          ` : ''}

          ${result.wikipedia ? `
            <div style="font-size: 11px; margin-bottom: 4px;">
              <a href="https://${result.wikipedia.split(':')[0]}.wikipedia.org/wiki/${result.wikipedia.split(':')[1]}"
                 target="_blank" style="color: #1976d2;">📖 Wikipedia</a>
            </div>
          ` : ''}

          <div style="border-top: 1px solid #ddd; margin: 8px 0 4px 0; padding-top: 4px;">
            <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">
              ${data.count} tab${data.count > 1 ? 's' : ''}
              <span style="color: #666;">(NER: ${(data.avgScore * 100).toFixed(0)}%)</span>
            </div>
            ${tabLinks}
            ${moreText}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
    }

    // Rate limit: 1 request per second
    if (i < locationEntities.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Fit map to markers
  if (validated > 0) {
    const group = L.featureGroup(
      Object.values(leafletMap._layers).filter(l => l instanceof L.Marker)
    );
    leafletMap.fitBounds(group.getBounds().pad(0.1));
  }

  // Render location list
  renderLocationList(validatedLocations);

  // Update status
  statusText.textContent = `✓ Geocoded ${validated} of ${totalLocations} locations (${totalLocations - validated} filtered or not found)`;
  button.disabled = false;
  button.textContent = '🔄 Re-geocode Locations';

  // Save geocoding cache to localStorage
  const filename = localStorage.getItem('lastAnalysisFilename');
  if (filename) {
    const cacheKey = `geocoding_${filename}`;
    localStorage.setItem(cacheKey, JSON.stringify(geocodingCache));
    console.log(`[Analysis] Saved ${Object.keys(geocodingCache).length} geocoding results to localStorage`);
  }
}

/**
 * Render exhaustive location list below map
 */
function renderLocationList(locations) {
  const container = document.getElementById('location-list-container');
  const list = document.getElementById('location-list');

  if (locations.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const html = locations.map(loc => {
    const { name, geo, data } = loc;

    // Tab titles for hover tooltip
    const tabTitles = data.tabs.map(t => t.title).join('\n• ');

    return `
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${escapeHtml(name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(geo.name)}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: var(--primary-color); font-weight: 600; cursor: pointer; text-decoration: underline;"
                 data-location="${escapeHtml(name)}"
                 class="location-tab-count"
                 title="${escapeHtml(tabTitles)}">
              ${data.count} tab${data.count > 1 ? 's' : ''}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              NER: ${(data.avgScore * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-secondary);">
          ${geo.type || geo.class ? `
            <span style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px;">
              <strong>Type:</strong> ${escapeHtml(geo.class || '')}${geo.type ? ` / ${escapeHtml(geo.type)}` : ''}
            </span>
          ` : ''}

          ${geo.importance ? `
            <span style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px;">
              <strong>Importance:</strong> ${(geo.importance * 100).toFixed(1)}%
            </span>
          ` : ''}

          ${geo.population ? `
            <span style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px;">
              <strong>Pop:</strong> ${parseInt(geo.population).toLocaleString()}
            </span>
          ` : ''}

          ${geo.wikipedia ? `
            <a href="https://${geo.wikipedia.split(':')[0]}.wikipedia.org/wiki/${geo.wikipedia.split(':')[1]}"
               target="_blank"
               style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px; color: var(--primary-color); text-decoration: none;">
              📖 Wikipedia
            </a>
          ` : ''}

          ${geo.website ? `
            <a href="${escapeHtml(geo.website)}"
               target="_blank"
               style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px; color: var(--primary-color); text-decoration: none;">
              🌐 Website
            </a>
          ` : ''}

          <span style="background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px;">
            📍 ${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}
          </span>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = html;

  // Add click handlers for tab counts
  document.querySelectorAll('.location-tab-count').forEach(el => {
    el.addEventListener('click', (e) => {
      const locationName = e.target.dataset.location;
      filterByLocation(locationName);
    });
  });
}

/**
 * Filter tabs by location entity
 */
function filterByLocation(locationName) {
  // Clear search and other filters
  document.getElementById('search-input').value = '';
  document.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));

  // Clear similar mode
  if (similarToTab) {
    similarToTab = null;
    document.getElementById('similar-banner').style.display = 'none';
  }

  // Apply location filter (custom filter)
  filteredTabs = allTabs.filter(tab => {
    if (!tab.entities || !tab.entities.locations) return false;
    return tab.entities.locations.some(loc => loc.word === locationName);
  });

  // Show feedback
  const banner = document.getElementById('similar-banner');
  banner.style.display = 'flex';
  banner.style.background = 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)';
  document.getElementById('similar-banner-content').innerHTML = `
    <div style="font-size: 16px; font-weight: 600;">
      Showing ${filteredTabs.length} tabs with location: <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">${escapeHtml(locationName)}</span>
    </div>
  `;
  document.getElementById('similarity-threshold').parentElement.style.display = 'none';
  document.getElementById('clear-similar-btn').style.display = 'block';

  currentPage = 1;
  renderTabs();

  // Scroll to top of tabs list
  document.getElementById('tabs-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Scroll to and highlight a specific tab in the list
 */
function scrollToTab(tabId) {
  // Find tab index in filteredTabs
  const tabIndex = filteredTabs.findIndex(t => t.id === tabId);

  if (tabIndex === -1) {
    // Tab not in current filtered view, show it by clearing filters
    clearFilters();
    // Wait for render, then try again
    setTimeout(() => scrollToTab(tabId), 100);
    return;
  }

  // Calculate page
  const targetPage = Math.floor(tabIndex / TABS_PER_PAGE) + 1;

  if (targetPage !== currentPage) {
    currentPage = targetPage;
    renderPage();
  }

  // Scroll to tabs list first
  setTimeout(() => {
    const tabEl = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) {
      // Highlight briefly
      const originalBg = tabEl.style.background;
      tabEl.style.background = 'linear-gradient(135deg, #fff9c4 0%, #ffeb3b 100%)';
      tabEl.style.transition = 'background 2s';

      tabEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      setTimeout(() => {
        tabEl.style.background = originalBg;
      }, 2000);
    }
  }, 100);
}

console.log('[Analysis] UI loaded');
