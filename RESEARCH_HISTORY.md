# Browser History Integration Research & Design
**FiltreInfini Tab Manager - Privacy-Preserving History Analysis**

**Research Date:** 2025-01-15
**Status:** Research Complete - Ready for Implementation

---

## 1. API REFERENCE

### 1.1 WebExtensions History API

**Manifest Permission Required:**
```json
{
  "permissions": ["history"]
}
```

#### Core Methods

##### `browser.history.search(query)`
Searches browser history for pages matching criteria.

**Parameters (query object):**
- `text` (string): Search terms (split at spaces, matches URL and title)
- `startTime` (number|string|Date, optional): Minimum visit time (milliseconds since epoch, defaults to 24h ago)
- `endTime` (number|string|Date, optional): Maximum visit time
- `maxResults` (number, optional): Maximum results to return (default: 100, minimum: 1)

**Returns:** `Promise<HistoryItem[]>` - Sorted in reverse chronological order

**Examples:**
```javascript
// Last 24 hours
await browser.history.search({ text: "" });

// All history ever
await browser.history.search({ text: "", startTime: 0 });

// Most recent "mozilla" visit
await browser.history.search({
  text: "mozilla",
  startTime: 0,
  maxResults: 1
});

// Last 7 days
const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
await browser.history.search({ text: "", startTime: weekAgo });
```

##### `browser.history.getVisits(details)`
Retrieves all visits to a specific URL.

**Parameters:**
- `details` (object): `{ url: string }`

**Returns:** `Promise<VisitItem[]>` - All visits to that URL, reverse chronological

**Example:**
```javascript
const visits = await browser.history.getVisits({
  url: "https://developer.mozilla.org"
});
// visits[0].visitTime, visits[0].transition, etc.
```

##### Other Methods (Less Critical)
- `browser.history.addUrl(details)` - Add URL to history
- `browser.history.deleteUrl(details)` - Remove URL from history
- `browser.history.deleteRange(range)` - Remove visits in time range
- `browser.history.deleteAll()` - Clear all history

#### Types

##### `HistoryItem`
Represents a page in browser history.

```typescript
interface HistoryItem {
  id: string;                    // Unique identifier
  url?: string;                  // Page URL
  title?: string;                // Page title
  lastVisitTime?: number;        // Last visit (ms since epoch)
  visitCount?: number;           // Total visits to this URL
  typedCount?: number;           // Times user typed URL in address bar
}
```

##### `VisitItem`
Represents a single visit to a page.

```typescript
interface VisitItem {
  id: string;                          // HistoryItem ID this visit belongs to
  visitId: string;                     // Unique identifier for this visit
  visitTime?: number;                  // When visit occurred (ms since epoch)
  referringVisitId: string;            // Visit ID of referrer (for chains!)
  transition: TransitionType;          // How navigation occurred
}
```

##### `TransitionType` (enum string)
Describes how browser navigated to page:

| Value | Meaning |
|-------|---------|
| `"link"` | User clicked a link |
| `"typed"` | User typed URL or selected from suggestions |
| `"auto_bookmark"` | User clicked bookmark or history item |
| `"auto_subframe"` | Automatically loaded iframe |
| `"manual_subframe"` | User-loaded iframe (creates back/forward entry) |
| `"generated"` | User clicked non-URL suggestion in address bar |
| `"auto_toplevel"` | Command line or start page |
| `"form_submit"` | User submitted form |
| `"reload"` | Reload button, Enter in address bar, session restore, reopen closed tab |
| `"keyword"` | Generated using keyword search |
| `"keyword_generated"` | Corresponds to keyword search visits |

#### Events

##### `browser.history.onVisited`
Fired when user visits a page.

```javascript
browser.history.onVisited.addListener((result) => {
  // result is a HistoryItem
  console.log(`Visited: ${result.url}`);
});
```

##### `browser.history.onVisitRemoved`
Fired when URLs removed from history.

```javascript
browser.history.onVisitRemoved.addListener((removed) => {
  if (removed.allHistory) {
    console.log("All history cleared");
  } else {
    console.log(`Removed URLs: ${removed.urls}`);
  }
});
```

##### `browser.history.onTitleChanged`
Fired when page title updated in history.

### 1.2 Firefox Places Database (Direct Access - Advanced)

**Note:** WebExtensions cannot directly access places.sqlite. This is for reference only if considering native messaging or external analysis tools.

**Database Location:** `<profile>/places.sqlite`

**Key Tables:**

#### `moz_places`
Main table of URLs (visited or not).

```sql
CREATE TABLE moz_places (
  id INTEGER PRIMARY KEY,
  url LONGVARCHAR,
  title LONGVARCHAR,
  rev_host LONGVARCHAR,         -- Reversed hostname for sorting
  visit_count INTEGER,
  hidden INTEGER,
  typed INTEGER,
  favicon_id INTEGER,
  frecency INTEGER,             -- Firefox's frequency+recency score
  last_visit_date INTEGER,
  guid TEXT
);
```

#### `moz_historyvisits`
One entry per visit (can have multiple visits to same URL).

```sql
CREATE TABLE moz_historyvisits (
  id INTEGER PRIMARY KEY,
  from_visit INTEGER,           -- Parent visit (for referrer chains!)
  place_id INTEGER,             -- Foreign key to moz_places
  visit_date INTEGER,
  visit_type INTEGER,           -- Similar to TransitionType
  session INTEGER               -- Session grouping
);
```

**Example Query:**
```sql
SELECT
  datetime(v.visit_date/1000000, 'unixepoch') as visit_time,
  p.url,
  p.title,
  v.visit_type,
  v.session
FROM moz_places p
JOIN moz_historyvisits v ON p.id = v.place_id
WHERE v.visit_date > ?
ORDER BY v.visit_date DESC;
```

**Advantage over WebExtensions API:** `session` field and `from_visit` chains are more detailed than `referringVisitId`.

### 1.3 Platform Support

**CRITICAL FINDING:** History API is **NOT supported on Firefox Android** as of 2025.

- **Desktop Firefox:** Full support (history API works as documented)
- **Firefox Android:** **No history API support** (confirmed via Mozilla documentation)
  - Workaround: Could use `tabs.onActivated` + `tabs.onCreated` to build local history
  - See existing `ProgressiveTabTracker` in background.js as starting point

**Implication:** History features must be desktop-only initially, or use tab events fallback for mobile.

---

## 2. PRIVACY STRATEGY

### 2.1 Core Privacy Principle

**Data Minimization:** Claude (or any external service) should NEVER see raw history data. All processing happens locally in the extension. Only aggregated, anonymized insights are stored.

### 2.2 Privacy-Preserving Techniques

#### A. Local-Only Processing
- All history queries run in background worker or UI context
- Raw history data never leaves browser
- Never send URLs, titles, or visit times to external services

#### B. Aggregation at Source
Instead of storing:
```javascript
// BAD - exposes raw history
{
  url: "https://github.com/user/secret-project",
  visitTime: 1234567890,
  title: "Confidential Project"
}
```

Store only aggregates:
```javascript
// GOOD - aggregated stats only
{
  domain: "github.com",
  visitCount: 47,
  firstVisit: 1234567890,
  lastVisit: 1234599999,
  averageSessionDuration: 15.2, // minutes
  timeDistribution: {
    morning: 0.2,   // 20% of visits
    afternoon: 0.5,
    evening: 0.3
  }
}
```

#### C. K-Anonymity for Domains
Group domains with low visit counts:

```javascript
// Domains with < 5 visits grouped as "OTHER"
const domainGroups = {
  "github.com": 150,
  "stackoverflow.com": 89,
  "developer.mozilla.org": 45,
  "OTHER": 23  // Aggregate of all domains with <5 visits
};
```

#### D. Differential Privacy (Optional, Advanced)
Add noise to aggregates if exposing statistics:

```javascript
function addLaplaceNoise(value, sensitivity, epsilon) {
  const scale = sensitivity / epsilon;
  const noise = laplacianRandom(scale);
  return Math.max(0, Math.round(value + noise));
}

// Example: Add noise to visit count
const noisyVisitCount = addLaplaceNoise(actualCount, 1, 0.5);
```

#### E. Time-Based Retention
Only analyze recent history, purge old aggregates:

```javascript
const RETENTION_PERIODS = {
  detailed: 7 * 24 * 60 * 60 * 1000,    // 7 days
  aggregated: 90 * 24 * 60 * 60 * 1000, // 90 days
  summary: Infinity                       // Keep domain counts forever
};
```

#### F. Opt-Out Controls
Settings to control what gets analyzed:

```javascript
const privacySettings = {
  enableHistoryAnalysis: true,
  historyTimeRange: "90d",  // 1w, 1m, 6m, 1y, all
  excludeDomains: ["bank.com", "health.gov"],
  excludePrivateBrowsing: true,
  shareAnonymousStats: false
};
```

### 2.3 What to Store vs. Compute

**Store in IndexedDB (aggregated only):**
- Domain visit frequencies (no URLs)
- Time-of-day patterns
- Co-occurrence matrices (domain pairs)
- Session summaries (duration, domain count)

**Compute on-demand (never store):**
- Specific URLs visited
- Full referrer chains (just show "you came from X")
- Individual visit timestamps
- Page titles

**Never touch:**
- Passwords, form data, cookies
- Private browsing history (if Firefox exposes flag)

---

## 3. FEATURE MATRIX

### Legend
- **Type:** History-only | Cross-integration | Privacy control
- **Priority:** P0 (must-have) | P1 (should-have) | P2 (nice-to-have)
- **Desktop/Mobile:** Desktop support only initially (no Android history API)

| Feature | Type | Priority | Description | Privacy Level |
|---------|------|----------|-------------|---------------|
| **A. Journey Assessment** |
| Referrer chains | Cross | P1 | "You arrived here from Google → Wikipedia → This page" | Compute-only |
| Incomplete journeys | Cross | P2 | "You researched X but never finished" | Aggregated |
| "Been here before" badge | Cross | P0 | Show visit count on tab cards | Aggregated |
| Journey timeline | History-only | P2 | Visualize browsing path for last N hours | Compute-only |
| **B. Better Classification** |
| Visit frequency enrichment | Cross | P0 | Use visitCount to improve intent classification | Aggregated |
| Temporal patterns | Cross | P1 | Detect work hours vs. leisure patterns | Aggregated |
| Recency factor | Cross | P0 | Boost priority of recently-visited tabs | Aggregated |
| **C. History-based Similarity** |
| Co-visited tabs | Cross | P1 | "Tabs you visited around same time" | Aggregated matrix |
| Similar browsing sessions | Cross | P2 | "Tabs from similar past sessions" | Aggregated |
| Domain clustering | History-only | P2 | Group domains by co-occurrence | Aggregated |
| **D. Tab Closure Confidence** |
| "Never lost" indicator | Cross | P0 | "This tab exists in history" badge | Boolean only |
| Safe-to-close score | Cross | P1 | Confidence based on visit frequency | Aggregated |
| "Not visited in X days" | Cross | P0 | Show last visit time | Aggregated |
| **E. History-only Features** |
| Visit timeline | History-only | P1 | Calendar heatmap of browsing activity | Aggregated |
| Top domains chart | History-only | P1 | Bar chart of most-visited domains | Aggregated |
| Search history | History-only | P2 | Find URLs you visited before | Compute-only |
| Export history CSV | History-only | P2 | Export aggregated stats only | Aggregated |
| **F. Privacy Controls** |
| Enable/disable history | Privacy | P0 | Master toggle for history features | N/A |
| Time range selector | Privacy | P0 | Limit analysis to recent history | N/A |
| Domain exclusions | Privacy | P1 | Never analyze certain domains | N/A |
| View stored data | Privacy | P1 | Show user what's cached | N/A |
| Clear history cache | Privacy | P0 | Delete all aggregated data | N/A |

---

## 4. ARCHITECTURE

### 4.1 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Firefox Browser                         │
│                                                              │
│  ┌────────────────┐         ┌─────────────────────┐        │
│  │ browser.history│         │  browser.tabs.query │        │
│  │   (Desktop)    │         │   (All platforms)   │        │
│  └────────┬───────┘         └──────────┬──────────┘        │
│           │                             │                    │
└───────────┼─────────────────────────────┼───────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│          Background Worker (background.js)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │  HistoryAnalyzer (NEW)                           │      │
│  │  - fetchHistory(timeRange)                       │      │
│  │  - analyzeVisitPatterns(urls)                    │      │
│  │  - buildReferrerChains(url)                      │      │
│  │  - computeCoOccurrence(domains)                  │      │
│  │  - enrichTabWithHistory(tab)                     │      │
│  └──────────────────┬───────────────────────────────┘      │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────┐      │
│  │  HistoryStorage (NEW)                            │      │
│  │  - Stores ONLY aggregated data in IndexedDB      │      │
│  │  - Never stores raw URLs/titles                  │      │
│  └──────────────────┬───────────────────────────────┘      │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
                      ▼
          ┌─────────────────────┐
          │   IndexedDB         │
          │   "history-cache"   │
          │                     │
          │  Stores:            │
          │  - Domain stats     │
          │  - Time patterns    │
          │  - Co-occurrence    │
          │  - Session summaries│
          └─────────────────────┘
                      │
                      │ (read for enrichment)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer                                 │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ manager.html │  │ analysis.html│  │ settings.html│     │
│  │ (Tab Cards)  │  │ (History-only│  │ (Privacy)    │     │
│  │              │  │  Features)   │  │              │     │
│  │ Shows:       │  │              │  │ Controls:    │     │
│  │ - Visit count│  │ Shows:       │  │ - Enable/    │     │
│  │ - Last visit │  │ - Timeline   │  │   disable    │     │
│  │ - "In history│  │ - Top domains│  │ - Time range │     │
│  │   badge"     │  │ - Patterns   │  │ - Exclusions │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Storage Strategy

#### browser.storage.local (Existing)
- Tab groups (Main/Staging/Bin)
- Tab metadata (content, reading time, etc.)
- Extension settings

#### IndexedDB (NEW - for history aggregates)
- Much faster for large datasets (10x+ vs. storage.local)
- Can store millions of records
- Supports indexes for fast lookups

**Schema:**

```javascript
// Database: "FiltreInfini-History"
// Version: 1

// Store: "domainStats"
{
  domain: "github.com",           // Primary key
  visitCount: 150,
  firstVisit: 1234567890,
  lastVisit: 1234599999,
  typedCount: 12,
  avgSessionDuration: 15.2,
  timeDistribution: {
    "00-06": 2,
    "06-12": 45,
    "12-18": 78,
    "18-24": 25
  },
  dayDistribution: {
    mon: 30, tue: 28, wed: 25, thu: 22, fri: 20, sat: 15, sun: 10
  }
}

// Store: "coOccurrence"
{
  domainPair: "github.com|stackoverflow.com",  // Primary key
  coVisitCount: 42,
  timeProximity: 15.5  // Average minutes between visits
}

// Store: "sessionSummaries"
{
  sessionId: "2025-01-15-morning",  // Primary key
  startTime: 1234567890,
  endTime: 1234570000,
  duration: 35,  // minutes
  uniqueDomains: 8,
  totalVisits: 23,
  dominantDomain: "github.com"
}

// Store: "tabHistory" (temporary, cleared on startup)
{
  tabId: 123,  // Primary key
  url: "https://github.com/...",  // (OK to store temporarily)
  visitCount: 5,
  lastVisit: 1234567890,
  firstVisit: 1234560000,
  avgTimeBetweenVisits: 86400000,  // 1 day
  referrerChain: ["google.com", "github.com"]  // Last 2 only
}
```

### 4.3 Component Architecture

#### New Files to Create

```
lib/
├── history-analyzer.js        # Core history analysis logic
├── history-storage.js         # IndexedDB wrapper for aggregates
├── history-enricher.js        # Enriches tabs with history context
└── history-settings.js        # Privacy settings manager

ui/
├── history-timeline.html      # History-only features page
├── history-timeline.js
└── settings.html              # Privacy controls (ALREADY EXISTS: popup.html)

background/
└── background.js              # Add history event listeners
```

---

## 5. CODE EXAMPLES

### 5.1 Basic History Analysis

```javascript
// lib/history-analyzer.js

class HistoryAnalyzer {
  constructor() {
    this.settings = new HistorySettings();
    this.storage = new HistoryStorage();
  }

  async analyzeHistory() {
    const settings = await this.settings.get();

    if (!settings.enabled) {
      console.log('History analysis disabled');
      return;
    }

    console.log(`Analyzing history (range: ${settings.timeRange})`);
    const startTime = this.getStartTime(settings.timeRange);
    const allHistory = await this.fetchAllHistory(startTime);

    console.log(`Fetched ${allHistory.length} history items`);

    // Filter excluded domains
    const filtered = allHistory.filter(item => {
      const domain = new URL(item.url).hostname;
      return !settings.excludeDomains.includes(domain);
    });

    // Aggregate by domain
    const domainStats = this.aggregateByDomain(filtered);

    // Store in IndexedDB
    for (const [domain, stats] of Object.entries(domainStats)) {
      await this.storage.saveDomainStats(domain, stats);
    }

    await this.settings.set({ lastAnalyzed: Date.now() });
    console.log(`Analysis complete. Processed ${Object.keys(domainStats).length} domains`);
  }

  async fetchAllHistory(startTime) {
    const allItems = [];
    const batchSize = 1000;

    while (true) {
      const batch = await browser.history.search({
        text: "",
        startTime: startTime,
        maxResults: batchSize,
      });

      if (batch.length === 0) break;
      allItems.push(...batch);
      if (batch.length < batchSize) break;

      const lastTimestamp = batch[batch.length - 1].lastVisitTime;
      startTime = lastTimestamp + 1;
    }

    return allItems;
  }

  aggregateByDomain(historyItems) {
    const stats = {};

    for (const item of historyItems) {
      try {
        const url = new URL(item.url);
        const domain = url.hostname;

        if (!stats[domain]) {
          stats[domain] = {
            visitCount: 0,
            firstVisit: Infinity,
            lastVisit: 0,
            typedCount: 0,
            timeDistribution: {},
            dayDistribution: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
          };
        }

        stats[domain].visitCount += item.visitCount || 1;
        stats[domain].typedCount += item.typedCount || 0;
        stats[domain].firstVisit = Math.min(stats[domain].firstVisit, item.lastVisitTime);
        stats[domain].lastVisit = Math.max(stats[domain].lastVisit, item.lastVisitTime);

        // Time distribution
        const hour = new Date(item.lastVisitTime).getHours();
        const timeSlot = `${Math.floor(hour / 6) * 6}-${Math.floor(hour / 6) * 6 + 6}`;
        stats[domain].timeDistribution[timeSlot] = (stats[domain].timeDistribution[timeSlot] || 0) + 1;

        // Day distribution
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const day = dayNames[new Date(item.lastVisitTime).getDay()];
        stats[domain].dayDistribution[day]++;

      } catch (error) {
        console.warn(`Failed to parse URL: ${item.url}`, error);
      }
    }

    return stats;
  }

  getStartTime(timeRange) {
    const now = Date.now();
    const ranges = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
      'all': 0
    };
    return now - (ranges[timeRange] || ranges['90d']);
  }
}
```

### 5.2 IndexedDB Storage

```javascript
// lib/history-storage.js

class HistoryStorage {
  constructor() {
    this.db = null;
    this.dbName = 'FiltreInfini-History';
    this.version = 1;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('domainStats')) {
          const domainStore = db.createObjectStore('domainStats', { keyPath: 'domain' });
          domainStore.createIndex('visitCount', 'visitCount', { unique: false });
          domainStore.createIndex('lastVisit', 'lastVisit', { unique: false });
        }

        if (!db.objectStoreNames.contains('coOccurrence')) {
          db.createObjectStore('coOccurrence', { keyPath: 'domainPair' });
        }

        if (!db.objectStoreNames.contains('sessionSummaries')) {
          const sessionStore = db.createObjectStore('sessionSummaries', { keyPath: 'sessionId' });
          sessionStore.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  }

  async saveDomainStats(domain, stats) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domainStats'], 'readwrite');
      const store = transaction.objectStore('domainStats');
      const data = { domain, ...stats };
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDomainStats(domain) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['domainStats'], 'readonly');
      const store = transaction.objectStore('domainStats');
      const request = store.get(domain);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    if (!this.db) await this.init();

    const storeNames = ['domainStats', 'coOccurrence', 'sessionSummaries'];

    for (const storeName of storeNames) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log('All history cache cleared');
  }
}
```

---

## 6. IMPLEMENTATION ROADMAP

### Phase 0: Foundation (Week 1)
- Add `"history"` permission to manifest.json
- Create IndexedDB wrapper (lib/history-storage.js)
- Create settings manager (lib/history-settings.js)
- Create settings UI (ui/settings.html)
- Add platform detection
- Update CLAUDE.md

### Phase 1: Basic Analysis (Week 2)
- Create history analyzer (lib/history-analyzer.js)
- Run analysis on extension startup
- Add background alarm for periodic re-analysis
- Test with real Firefox history

### Phase 2: Tab Enrichment (Week 3)
- Create history enricher (lib/history-enricher.js)
- Update manager.html with history badges
- Add "safe to close" indicator
- Test with varied history patterns

### Phase 3: History Features (Week 4)
- Create history timeline page (ui/history-timeline.html)
- Implement timeline chart
- Implement top domains chart
- Add search history feature

### Phase 4: Advanced Integration (Weeks 5-6)
- Implement referrer chains
- Implement co-occurrence analysis
- Implement journey detection (experimental)

### Phase 5: Polish (Week 7)
- Privacy audit
- Performance optimization
- UX polish
- Documentation

### Phase 6: Mobile Fallback (Future)
- Tab-event-based history tracker for Android

---

## 7. KEY CONSIDERATIONS

### Performance
- Initial analysis (100k items): <30 seconds target
- Incremental updates: <5 seconds
- Tab enrichment (100 tabs): <1 second
- Timeline chart render: <2 seconds

### Privacy Trade-offs

| Data Type | Privacy | Utility | Store? |
|-----------|---------|---------|--------|
| Raw URLs | ❌ Very risky | ✓ High | ❌ NO |
| Domain names | ⚠️ Some risk | ✓ High | ✓ YES (aggregated) |
| Visit counts | ✓ Low risk | ✓ High | ✓ YES |

### Platform Constraints
- Desktop-only initially (no Android history API)
- Option to add tab-event fallback for Android in Phase 6

---

## 8. OPEN QUESTIONS

### Decisions Needed
1. **Default state**: Start enabled or disabled? → Recommend: Disabled (opt-in)
2. **Badge prominence**: Subtle or prominent? → Recommend: Subtle
3. **Android priority**: Build tab-event fallback? → Recommend: Gather feedback first
4. **Search history**: Include in Phase 3? → Recommend: Yes

### Technical Uncertainties
1. Referrer chain reliability (test in Phase 4)
2. IndexedDB performance at scale (benchmark in Phase 1)
3. History API rate limits (test pagination in Phase 1)

---

**Document Status:** Research Complete - Ready for Implementation
**Next Step:** Create detailed TODO breakdown and begin Phase 0
