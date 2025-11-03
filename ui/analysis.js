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

    // Initialize UI
    allTabs = analysisData.tabs;
    filteredTabs = [...allTabs];

    renderStatistics();
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
 * Load analysis data (initial load - just show instructions)
 */
async function loadAnalysis() {
  // Show instructions instead of trying to auto-load
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

/**
 * Render statistics cards
 */
function renderStatistics() {
  const { metadata, statistics } = analysisData;

  const date = new Date(metadata.analyzedAt);
  document.getElementById('analysis-info').textContent =
    `Analysis from ${date.toLocaleString()} • ${metadata.totalTabs} tabs`;

  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${metadata.totalTabs}</div>
      <div class="stat-label">Total Tabs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${Object.keys(statistics.topDomains).length}</div>
      <div class="stat-label">Unique Domains</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${Object.keys(statistics.topEntities.people).length}</div>
      <div class="stat-label">People Mentioned</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${Object.keys(statistics.topEntities.organizations).length}</div>
      <div class="stat-label">Organizations</div>
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
  document.getElementById('results-count').textContent =
    `${filteredTabs.length} of ${allTabs.length} tabs`;

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
  const { classification, entities } = tab;

  const badges = classification ? `
    <span class="badge badge-intent">${classification.intent.label}</span>
    <span class="badge badge-status">${classification.status.label}</span>
    <span class="badge badge-type">${classification.contentType.label}</span>
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

  const similarBtn = tab.similarTabs && tab.similarTabs.length > 0 ? `
    <button class="similar-tabs-btn" onclick="showSimilarTabs('${tab.id}')">
      🔗 ${tab.similarTabs.length} similar
    </button>
  ` : '';

  return `
    <div class="tab-card">
      <div class="tab-header">
        <div style="flex: 1;">
          <div class="tab-title">${escapeHtml(tab.title)}</div>
          <div class="tab-domain">
            <a href="${tab.url}" target="_blank">${tab.domain}</a>
          </div>
        </div>
        ${similarBtn}
      </div>
      <div class="tab-badges">${badges}</div>
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

  const similarIds = new Set(tab.similarTabs.map(s => s.id));
  filteredTabs = allTabs.filter(t => similarIds.has(t.id));

  document.getElementById('results-count').textContent =
    `${filteredTabs.length} tabs similar to "${tab.title.substring(0, 50)}..."`;

  currentPage = 1;
  renderPage();

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

console.log('[Analysis] UI loaded');
