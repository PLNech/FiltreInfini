/**
 * Analysis UI - Display and filter analyzed tabs
 */

let analysisData = null;
let allTabs = [];
let filteredTabs = [];
let currentPage = 1;
const TABS_PER_PAGE = 50;

// Content search results (from IndexedDB)
let contentSearchResults = null;

const filters = {
  search: '',
  intent: new Set(),
  status: new Set(),
  contentType: new Set(),
  domain: new Set(),
  readingTime: { min: 0, max: 60 },
  age: { min: 0, max: 730 } // 0 to 2 years in days
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
let chartSize = 100; // Default top 100

// Theme state
let currentTheme = localStorage.getItem('theme') || 'light';

// Histogram animation state
let histogramPreviousBuckets = null;
let histogramAnimationFrame = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButton();

  setupEventListeners();
  await loadAnalysis();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

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

  // Reload last file button - just opens file picker with hint
  document.getElementById('reload-last-btn').addEventListener('click', () => {
    if (lastLoadedFile) {
      // If file is in current session, reload it directly
      loadAnalysisFromFile(lastLoadedFile);
    } else {
      // Otherwise, prompt user to select the file again
      const lastFilename = localStorage.getItem('lastAnalysisFilename');
      if (lastFilename) {
        alert(`Please select the analysis file again:\n\n${lastFilename}\n\nUsually found in: data/`);
      }
      document.getElementById('file-input').click();
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

    // Re-render current tab's charts (including overview)
    if (analysisData && currentChartTab) {
      renderChartsForTab(currentChartTab);
    }
  });

  // Reading time sliders
  document.getElementById('reading-time-min').addEventListener('input', (e) => {
    filters.readingTime.min = parseInt(e.target.value);
    document.getElementById('reading-time-min-value').textContent = filters.readingTime.min;
    console.log(`[Filter] Reading time min: ${filters.readingTime.min}`);
    applyFilters();
  });

  document.getElementById('reading-time-max').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    filters.readingTime.max = val;
    document.getElementById('reading-time-max-value').textContent = val === 60 ? '60+' : val;
    console.log(`[Filter] Reading time max: ${filters.readingTime.max}`);
    applyFilters();
  });

  // Age sliders
  document.getElementById('age-min').addEventListener('input', (e) => {
    filters.age.min = parseInt(e.target.value);
    document.getElementById('age-min-value').textContent = formatAgeDays(filters.age.min);
    console.log(`[Filter] Age min: ${filters.age.min} days`);
    applyFilters();
  });

  document.getElementById('age-max').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    filters.age.max = val;
    document.getElementById('age-max-value').textContent = val === 730 ? '2y+' : formatAgeDays(val);
    console.log(`[Filter] Age max: ${filters.age.max} days`);
    applyFilters();
  });

  // Content search (full-text)
  const contentSearchInput = document.getElementById('content-search-input');
  if (contentSearchInput) {
    let contentSearchTimeout;
    contentSearchInput.addEventListener('input', (e) => {
      clearTimeout(contentSearchTimeout);
      const query = e.target.value.trim();

      if (query.length < 3) {
        // Clear content search if query too short
        contentSearchResults = null;
        document.getElementById('content-search-status').textContent = '';
        applyFilters();
        return;
      }

      // Debounce search (wait 500ms after typing stops)
      contentSearchTimeout = setTimeout(async () => {
        await searchContent(query);
      }, 500);
    });
  }

  // Import to IndexedDB button
  const importBtn = document.getElementById('import-to-idb-btn');
  if (importBtn) {
    importBtn.addEventListener('click', importAnalysisToIndexedDB);
  }

  // Clear cache button
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      if (confirm('Clear all IndexedDB cache? This will remove all imported data for content search.')) {
        await indexedDBStorage.clearAll();
        await updateIndexedDBStatus();
        alert('Cache cleared successfully');
      }
    });
  }
}

/**
 * Format age in days to human-readable string
 */
function formatAgeDays(days) {
  if (days === 0) return '0d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
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

    // Reset reading time sliders to default values (prevent browser form cache)
    filters.readingTime.min = 0;
    filters.readingTime.max = 60;
    const minSlider = document.getElementById('reading-time-min');
    const maxSlider = document.getElementById('reading-time-max');
    const minValue = document.getElementById('reading-time-min-value');
    const maxValue = document.getElementById('reading-time-max-value');
    if (minSlider) minSlider.value = '0';
    if (maxSlider) maxSlider.value = '60';
    if (minValue) minValue.textContent = '0';
    if (maxValue) maxValue.textContent = '60+';

    // Reset age sliders to default values
    filters.age.min = 0;
    filters.age.max = 730;
    const ageMinSlider = document.getElementById('age-min');
    const ageMaxSlider = document.getElementById('age-max');
    const ageMinValue = document.getElementById('age-min-value');
    const ageMaxValue = document.getElementById('age-max-value');
    if (ageMinSlider) ageMinSlider.value = '0';
    if (ageMaxSlider) ageMaxSlider.value = '730';
    if (ageMinValue) ageMinValue.textContent = '0d';
    if (ageMaxValue) ageMaxValue.textContent = '2y+';

    // Debug: Log reading time statistics
    const tabsWithReadingTime = allTabs.filter(t => t.readingTimeMinutes).length;
    console.log(`[Analysis] ${tabsWithReadingTime}/${allTabs.length} tabs have reading time data`);

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
    const reloadBtn = document.getElementById('reload-last-btn');
    if (reloadBtn) {
      reloadBtn.style.display = 'inline-block';
      reloadBtn.textContent = `🔄 Reload ${lastFilename}`;
    }

    // Show instructions with hint about last file
    document.getElementById('tabs-container').innerHTML = `
      <div class="empty-state">
        <h3>📂 No analysis loaded</h3>
        <p>Click "🔄 Reload" to load your last analysis file.</p>
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

  // Check IndexedDB status and show buttons if needed
  await updateIndexedDBStatus();
}

/**
 * Search content in IndexedDB
 */
async function searchContent(query) {
  const statusEl = document.getElementById('content-search-status');

  try {
    statusEl.textContent = 'Searching...';
    const results = await indexedDBStorage.searchContent(query, 100);

    if (results.length === 0) {
      statusEl.textContent = `No results found for "${query}"`;
      contentSearchResults = null;
    } else {
      statusEl.textContent = `Found ${results.length} tabs matching "${query}"`;
      contentSearchResults = results;
    }

    applyFilters();
  } catch (error) {
    console.error('[Content Search] Error:', error);
    statusEl.textContent = `Error: ${error.message}. Try importing analysis to cache first.`;
    contentSearchResults = null;
  }
}

/**
 * Import analysis file into IndexedDB
 */
async function importAnalysisToIndexedDB() {
  if (!analysisData) {
    alert('Please load an analysis file first');
    return;
  }

  const progressDiv = document.getElementById('import-progress');
  const phaseEl = document.getElementById('import-phase');
  const countEl = document.getElementById('import-count');
  const barEl = document.getElementById('import-progress-bar');
  const importBtn = document.getElementById('import-to-idb-btn');

  try {
    // Show progress
    progressDiv.style.display = 'block';
    importBtn.disabled = true;

    const stats = await indexedDBStorage.importFromAnalysisFile(
      analysisData,
      (phase, current, total) => {
        phaseEl.textContent = `Importing ${phase}...`;
        countEl.textContent = `${current} / ${total}`;
        const percent = total > 0 ? (current / total) * 100 : 0;
        barEl.style.width = `${percent}%`;
      }
    );

    // Hide progress, show stats
    progressDiv.style.display = 'none';

    let message = `Import complete!\n\n`;
    message += `✓ ${stats.tabs} tabs\n`;
    message += `✓ ${stats.content} with full-text content\n`;
    message += `✓ ${stats.entities} entities\n`;
    message += `✓ ${stats.embeddings} embeddings\n`;

    if (stats.errors.length > 0) {
      message += `\n⚠️ ${stats.errors.length} errors (check console)`;
      console.warn('[Import] Errors:', stats.errors);
    }

    alert(message);

    // Update status display
    await updateIndexedDBStatus();
  } catch (error) {
    progressDiv.style.display = 'none';
    console.error('[Import] Failed:', error);
    alert(`Import failed: ${error.message}`);
  } finally {
    importBtn.disabled = false;
  }
}

/**
 * Update IndexedDB status display
 */
async function updateIndexedDBStatus() {
  try {
    const stats = await indexedDBStorage.getStats();
    const statusEl = document.getElementById('idb-status');
    const importBtn = document.getElementById('import-to-idb-btn');
    const clearBtn = document.getElementById('clear-cache-btn');

    if (stats.tabs > 0) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `
        <strong>📦 IndexedDB Cache:</strong>
        ${stats.tabs} tabs •
        ${stats.content} with content •
        ${stats.entities} entities •
        ${stats.embeddings} embeddings
      `;
      clearBtn.style.display = 'inline-block';
    } else {
      statusEl.style.display = 'none';
      clearBtn.style.display = 'none';
    }

    // Show import button if analysis is loaded
    if (analysisData && analysisData.tabs) {
      importBtn.style.display = 'inline-block';
    }
  } catch (error) {
    console.warn('[IndexedDB] Status check failed:', error);
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
    <div class="stat-card" data-stat="overview" style="cursor: pointer;" title="Click to view overview">
      <div class="stat-value">${metadata.totalTabs}</div>
      <div class="stat-label">Total Tabs</div>
    </div>
    <div class="stat-card" data-stat="domains" style="cursor: pointer;" title="Click to view domain breakdown">
      <div class="stat-value">${uniqueDomains}</div>
      <div class="stat-label">Unique Domains</div>
    </div>
    <div class="stat-card" data-stat="entities" style="cursor: pointer;" title="Click to view entities">
      <div class="stat-value">${tabsWithEntities}</div>
      <div class="stat-label">Tabs with Entities</div>
    </div>
    <div class="stat-card" data-stat="entities" style="cursor: pointer;" title="Click to view people entities">
      <div class="stat-value">${allPeople.size}</div>
      <div class="stat-label">Unique People</div>
    </div>
    <div class="stat-card" data-stat="entities" style="cursor: pointer;" title="Click to view organization entities">
      <div class="stat-value">${allOrgs.size}</div>
      <div class="stat-label">Unique Organizations</div>
    </div>
    <div class="stat-card" data-stat="map" style="cursor: pointer;" title="Click to view locations map">
      <div class="stat-value">${allLocs.size}</div>
      <div class="stat-label">Unique Locations</div>
    </div>
  `;

  // Add click handlers to stat cards
  document.querySelectorAll('.stat-card[data-stat]').forEach(card => {
    card.addEventListener('click', () => {
      const chartTab = card.dataset.stat;
      switchChartTab(chartTab);
      // Scroll to charts section
      document.getElementById('charts-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
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
 * Get reading time for a tab (in minutes)
 * Uses pre-computed value from analysis (fetched from actual page content)
 */
function getReadingTime(tab) {
  return tab.readingTimeMinutes || null;
}

/**
 * Apply all active filters
 */
function applyFilters() {
  console.log(`[Filter] Applying filters - Reading time: ${filters.readingTime.min}-${filters.readingTime.max}min`);

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

    // Reading time filter - hide tabs without reading time data when filter is active
    const readingTime = getReadingTime(tab);
    const isReadingTimeFilterActive = filters.readingTime.min > 0 || filters.readingTime.max < 60;

    if (isReadingTimeFilterActive) {
      // Filter is active - only show tabs with reading time data that match range
      if (readingTime === null) {
        return false; // Hide tabs without reading time data
      }
      if (readingTime < filters.readingTime.min || readingTime > filters.readingTime.max) {
        return false;
      }
    }

    // Age filter (in days)
    const ageDays = Math.floor((Date.now() - (tab.lastUsed * 1000)) / (1000 * 60 * 60 * 24));
    if (ageDays < filters.age.min || ageDays > filters.age.max) {
      return false;
    }

    // Content search filter (IndexedDB full-text search results)
    if (contentSearchResults !== null) {
      const tabInResults = contentSearchResults.find(r => r.id === tab.id || r.tabId === tab.id);
      if (!tabInResults) {
        return false; // Not in content search results
      }
      // Attach snippet for display in renderTabCard
      tab._searchSnippet = tabInResults.snippet;
    } else {
      // Clear any previous snippet when not searching
      delete tab._searchSnippet;
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

  // Update histograms to show filtered results
  renderReadingTimeHistogram();
  renderAgeHistogram();

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
  filters.readingTime.min = 0;
  filters.readingTime.max = 60;
  filters.age.min = 0;
  filters.age.max = 730;

  document.getElementById('search-input').value = '';
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.remove('active');
  });

  // Reset reading time sliders
  document.getElementById('reading-time-min').value = 0;
  document.getElementById('reading-time-max').value = 60;
  document.getElementById('reading-time-min-value').textContent = '0';
  document.getElementById('reading-time-max-value').textContent = '60+';

  // Reset age sliders
  document.getElementById('age-min').value = 0;
  document.getElementById('age-max').value = 730;
  document.getElementById('age-min-value').textContent = '0d';
  document.getElementById('age-max-value').textContent = '2y+';

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

    // Handle entity badge click (filter by entity)
    const entityBadge = e.target.closest('.entity-badge');
    if (entityBadge) {
      const entityText = entityBadge.textContent.trim();
      // Add to search filter
      filters.search = entityText.toLowerCase();
      document.getElementById('search-input').value = entityText;
      applyFilters();
      // Scroll to top to see results
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Handle tab card click (open URL in new tab - switch doesn't work with analysis file)
    const tabCard = e.target.closest('.tab-card');
    if (tabCard) {
      // Don't open if clicking on a link, button, or entity
      if (e.target.tagName === 'A' || e.target.closest('a') || e.target.closest('button') || e.target.closest('.entity-badge')) {
        return;
      }

      const url = tabCard.querySelector('a').href;
      if (url) {
        window.open(url, '_blank');
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
  const { classification, entities, searchQuery, lastUsed } = tab;

  // Compute age badge
  const ageDays = Math.floor((Date.now() - (lastUsed * 1000)) / (1000 * 60 * 60 * 24));
  let ageBadge = '';
  if (ageDays > 365) {
    ageBadge = `<span class="badge" style="background: #EF4444; color: white;">📅 ${Math.floor(ageDays / 365)}y old</span>`;
  } else if (ageDays > 180) {
    ageBadge = `<span class="badge" style="background: #F59E0B; color: white;">📅 ${Math.floor(ageDays / 30)}mo old</span>`;
  } else if (ageDays > 30) {
    ageBadge = `<span class="badge" style="background: #FBBF24; color: #1A1A1A;">📅 ${Math.floor(ageDays / 30)}mo old</span>`;
  }

  // Use actual reading time from page content analysis with gradient color
  const readingTime = getReadingTime(tab);
  let readingBadge = '';
  if (readingTime) {
    // Gradient: green (<5min) → yellow (15min) → orange (30min) → red (60min+)
    let bgColor;
    if (readingTime < 5) {
      bgColor = '#10B981'; // Green
    } else if (readingTime < 15) {
      // Green to Yellow
      const t = (readingTime - 5) / 10;
      bgColor = `rgb(${Math.round(16 + t * (234 - 16))}, ${Math.round(185 + t * (179 - 185))}, ${Math.round(129 + t * (8 - 129))})`;
    } else if (readingTime < 30) {
      // Yellow to Orange
      const t = (readingTime - 15) / 15;
      bgColor = `rgb(${Math.round(234 + t * (251 - 234))}, ${Math.round(179 + t * (146 - 179))}, ${Math.round(8 + t * (60 - 8))})`;
    } else if (readingTime < 60) {
      // Orange to Red
      const t = (readingTime - 30) / 30;
      bgColor = `rgb(${Math.round(251 + t * (239 - 251))}, ${Math.round(146 + t * (68 - 146))}, ${Math.round(60 + t * (68 - 60))})`;
    } else {
      bgColor = '#EF4444'; // Red for 60min+
    }
    readingBadge = `<span class="badge" style="background: ${bgColor}; color: white;">📖 ${readingTime}min</span>`;
  }

  // Build badges - always show age and reading time even if no classification
  const classificationBadges = classification ? `
    <span class="badge badge-intent">${classification.intent.label}</span>
    <span class="badge badge-status">${classification.status.label}</span>
    <span class="badge badge-type">${classification.contentType.label}</span>
  ` : '';

  const badges = [classificationBadges, ageBadge, readingBadge]
    .filter(b => b) // Remove empty strings
    .join('\n');

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
          ${entities.people.map(e => `<span class="entity-badge" style="display: inline-block; padding: 2px 8px; margin: 2px; background: #E8F5E9; color: #2E7D32; border-radius: 12px; cursor: pointer; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='#C8E6C9'" onmouseout="this.style.background='#E8F5E9'">${escapeHtml(e.word)}</span>`).join('')}
        </div>
      ` : ''}
      ${entities.organizations.length > 0 ? `
        <div class="entity-group">
          <span class="entity-label">🏢 Organizations:</span>
          ${entities.organizations.map(e => `<span class="entity-badge" style="display: inline-block; padding: 2px 8px; margin: 2px; background: #E3F2FD; color: #1565C0; border-radius: 12px; cursor: pointer; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='#BBDEFB'" onmouseout="this.style.background='#E3F2FD'">${escapeHtml(e.word)}</span>`).join('')}
        </div>
      ` : ''}
      ${entities.locations.length > 0 ? `
        <div class="entity-group">
          <span class="entity-label">📍 Locations:</span>
          ${entities.locations.map(e => `<span class="entity-badge" style="display: inline-block; padding: 2px 8px; margin: 2px; background: #FFF3E0; color: #E65100; border-radius: 12px; cursor: pointer; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='#FFE0B2'" onmouseout="this.style.background='#FFF3E0'">${escapeHtml(e.word)}</span>`).join('')}
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

  // Content search snippet
  const snippetHtml = tab._searchSnippet ? `
    <div class="content-snippet" style="margin-top: 8px; padding: 8px 12px; background: #E3F2FD; border-left: 3px solid #2196F3; border-radius: 4px; font-size: 12px; line-height: 1.4;">
      <span style="font-weight: 600; color: #1976D2;">💬 Content match:</span> <span style="color: #424242;">${escapeHtml(tab._searchSnippet)}</span>
    </div>
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
      ${snippetHtml}
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

  // Destroy existing charts before recreating
  destroyCharts(tabName);

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
    document.getElementById('people-chart-title').textContent = `👤 Top ${topPeople.length} People`;
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
    document.getElementById('orgs-chart-title').textContent = `🏢 Top ${topOrgs.length} Organizations`;
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
    document.getElementById('locations-chart-title').textContent = `📍 Top ${topLocs.length} Locations`;
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

  // Render histograms
  renderReadingTimeHistogram();
  renderAgeHistogram();
}

/**
 * Render reading time histogram with smooth animation (updates dynamically with filters)
 */
function renderReadingTimeHistogram() {
  const canvas = document.getElementById('reading-time-histogram');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Collect reading times from currently filtered tabs (like Airbnb UX)
  const readingTimes = filteredTabs
    .map(tab => getReadingTime(tab))
    .filter(time => time !== null);

  if (readingTimes.length === 0) {
    // Clear canvas if no data
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    histogramPreviousBuckets = null;
    return;
  }

  // Create histogram buckets (0-60 min, 5min buckets)
  const targetBuckets = Array(12).fill(0); // 0-5, 5-10, ..., 55-60
  readingTimes.forEach(time => {
    const bucketIndex = Math.min(Math.floor(time / 5), 11);
    targetBuckets[bucketIndex]++;
  });

  // Initialize previous buckets on first render
  if (!histogramPreviousBuckets) {
    histogramPreviousBuckets = Array(12).fill(0);
  }

  // Cancel any ongoing animation
  if (histogramAnimationFrame) {
    cancelAnimationFrame(histogramAnimationFrame);
  }

  // Animate from previous to target
  const startTime = performance.now();
  const duration = 300; // 300ms animation

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    // Interpolate bucket values
    const currentBuckets = histogramPreviousBuckets.map((prev, i) => {
      return prev + (targetBuckets[i] - prev) * easeProgress;
    });

    // Clear and draw
    const width = canvas.width = canvas.offsetWidth * 2; // 2x for hi-dpi
    const height = canvas.height = 160; // 2x for hi-dpi
    canvas.style.width = `${canvas.offsetWidth}px`;
    canvas.style.height = '80px';

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / currentBuckets.length;
    const maxCount = Math.max(...targetBuckets);

    // Get color from CSS variable
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    currentBuckets.forEach((count, i) => {
      const barHeight = maxCount > 0 ? (count / maxCount) * (height - 20) : 0;
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = primaryColor;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

      // Labels at bottom
      if (i % 2 === 0) { // Every other label to avoid crowding
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i * 5}`, x + barWidth / 2, height - 5);
      }
    });

    if (progress < 1) {
      histogramAnimationFrame = requestAnimationFrame(animate);
    } else {
      histogramPreviousBuckets = targetBuckets;
      histogramAnimationFrame = null;
    }
  }

  histogramAnimationFrame = requestAnimationFrame(animate);
}

// Age histogram animation state
let ageHistogramPreviousBuckets = null;
let ageHistogramAnimationFrame = null;

/**
 * Render age histogram with smooth animation (updates dynamically with filters)
 */
function renderAgeHistogram() {
  const canvas = document.getElementById('age-histogram');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Collect ages from currently filtered tabs
  const ages = filteredTabs.map(tab => {
    return Math.floor((Date.now() - (tab.lastUsed * 1000)) / (1000 * 60 * 60 * 24));
  });

  if (ages.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ageHistogramPreviousBuckets = null;
    return;
  }

  // Create histogram buckets (0-730 days in 30-day/1-month buckets)
  const targetBuckets = Array(24).fill(0); // 24 months
  ages.forEach(ageDays => {
    const bucketIndex = Math.min(Math.floor(ageDays / 30), 23);
    targetBuckets[bucketIndex]++;
  });

  // Initialize previous buckets on first render
  if (!ageHistogramPreviousBuckets) {
    ageHistogramPreviousBuckets = Array(24).fill(0);
  }

  // Cancel any ongoing animation
  if (ageHistogramAnimationFrame) {
    cancelAnimationFrame(ageHistogramAnimationFrame);
  }

  // Animate from previous to target
  const startTime = performance.now();
  const duration = 300; // 300ms animation

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    // Interpolate bucket values
    const currentBuckets = ageHistogramPreviousBuckets.map((prev, i) => {
      return prev + (targetBuckets[i] - prev) * easeProgress;
    });

    // Clear and draw
    const width = canvas.width = canvas.offsetWidth * 2; // 2x for hi-dpi
    const height = canvas.height = 160; // 2x for hi-dpi
    canvas.style.width = `${canvas.offsetWidth}px`;
    canvas.style.height = '80px';

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / currentBuckets.length;
    const maxCount = Math.max(...targetBuckets);

    // Get color from CSS variable
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    currentBuckets.forEach((count, i) => {
      const barHeight = maxCount > 0 ? (count / maxCount) * (height - 20) : 0;
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = primaryColor;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

      // Labels at bottom (every 3 months)
      if (i % 3 === 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const label = i === 0 ? '0' : `${i}mo`;
        ctx.fillText(label, x + barWidth / 2, height - 5);
      }
    });

    if (progress < 1) {
      ageHistogramAnimationFrame = requestAnimationFrame(animate);
    } else {
      ageHistogramPreviousBuckets = targetBuckets;
      ageHistogramAnimationFrame = null;
    }
  }

  ageHistogramAnimationFrame = requestAnimationFrame(animate);
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

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
  updateThemeButton();
}

/**
 * Update theme toggle button icon
 */
function updateThemeButton() {
  const btn = document.getElementById('theme-toggle');
  btn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
  btn.title = currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
}

console.log('[Analysis] UI loaded');
