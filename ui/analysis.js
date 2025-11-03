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
      loadAnalysisFromFile(file);
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

    // Only cache filename (data is too big for storage)
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

  // Add event delegation for similar tabs buttons
  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('similar-tabs-btn') || e.target.closest('.similar-tabs-btn')) {
      const btn = e.target.classList.contains('similar-tabs-btn') ? e.target : e.target.closest('.similar-tabs-btn');
      const tabId = btn.dataset.tabId;
      if (tabId) {
        showSimilarTabs(tabId);
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
    <div class="tab-card">
      <div class="tab-header">
        <div style="flex: 1;">
          <div class="tab-title">${escapeHtml(tab.title)}${similarityBadge}</div>
          <div class="tab-domain">
            <a href="${tab.url}" target="_blank">${tab.domain}</a>
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
 * Render all charts using Chart.js
 */
function renderCharts() {
  const { statistics } = analysisData;

  // Show charts section
  document.getElementById('charts-section').style.display = 'block';

  // Color palettes
  const colors = {
    intent: ['#2196F3', '#4CAF50', '#FF9800'],
    status: ['#9C27B0', '#E91E63', '#00BCD4', '#FFC107', '#8BC34A'],
    content: ['#3F51B5', '#009688', '#CDDC39'],
    entities: ['#673AB7', '#FF5722', '#795548']
  };

  // 1. Intent Distribution (Doughnut)
  new Chart(document.getElementById('intent-chart'), {
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
  });

  // 2. Status Distribution (Doughnut)
  new Chart(document.getElementById('status-chart'), {
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
  });

  // 3. Content Type Distribution (Doughnut)
  new Chart(document.getElementById('content-chart'), {
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
  });

  // 4. Top 15 Domains (Horizontal Bar)
  const topDomains = Object.entries(statistics.topDomains).slice(0, 15);
  new Chart(document.getElementById('domains-chart'), {
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
  });

  // 5. Entity Types Distribution (Pie)
  const peopleCount = Object.keys(statistics.topEntities.people).length;
  const orgsCount = Object.keys(statistics.topEntities.organizations).length;
  const locsCount = Object.keys(statistics.topEntities.locations).length;

  new Chart(document.getElementById('entities-chart'), {
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
  });

  // 6. Top People (Horizontal Bar)
  const topPeople = Object.entries(statistics.topEntities.people).slice(0, 10);
  new Chart(document.getElementById('people-chart'), {
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
        legend: { display: false }
      },
      scales: {
        x: { beginAtZero: true }
      }
    }
  });

  // 7. Top Organizations (Horizontal Bar)
  const topOrgs = Object.entries(statistics.topEntities.organizations).slice(0, 10);
  new Chart(document.getElementById('orgs-chart'), {
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
        legend: { display: false }
      },
      scales: {
        x: { beginAtZero: true }
      }
    }
  });

  // 8. Top Locations (Horizontal Bar)
  const topLocs = Object.entries(statistics.topEntities.locations).slice(0, 10);
  new Chart(document.getElementById('locations-chart'), {
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
        legend: { display: false }
      },
      scales: {
        x: { beginAtZero: true }
      }
    }
  });

  // 9. Search Query Domains (if present)
  const searchTabs = allTabs.filter(t => t.searchQuery);
  if (searchTabs.length > 0) {
    const searchDomains = {};
    searchTabs.forEach(tab => {
      searchDomains[tab.domain] = (searchDomains[tab.domain] || 0) + 1;
    });

    const topSearchDomains = Object.entries(searchDomains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    document.getElementById('search-chart-container').style.display = 'block';

    new Chart(document.getElementById('search-chart'), {
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
    });
  }
}

console.log('[Analysis] UI loaded');
