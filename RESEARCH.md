### Extension Structure
```
filtre-infini/
├── manifest.json
├── popup/
│   ├── popup.html          # Main UI entry point
│   ├── popup.js            # UI controller
│   └── styles/
│       ├── base.css        # Reset, variables, typography
│       ├── components.css  # Cards, buttons, inputs
│       └── layouts.css     # Grid, spacing, responsive
├── ui/
│   ├── swipe-cards.js      # SpeedDating interface
│   ├── list-view.js        # Tabular interface
│   ├── query-input.js      # QL interface with syntax highlighting
│   └── stats-dashboard.js  # Statistics view
├── background/
│   └── background.js       # Tab operations, group management
├── lib/
│   ├── tab-query.js        # Query engine (domain, age, title filters)
│   ├── query-parser.js     # QL parser with AST
│   ├── group-manager.js    # Main/Staging/Bin group logic
│   ├── export.js           # CSV export logic
│   └── storage.js          # storage.local wrapper
├── icons/
│   └── icon-*.png          # 48, 96, 128 sizes
└── README.md
```

### Core Components

#### 1. Tab Query Engine (`lib/tab-query.js`)
```javascript
class TabQuery {
  async findByDomain(pattern) {
    // Support wildcards: *example* or example.com
    return browser.tabs.query({url: `*${pattern}*`});
  }
  
  async findByAge(olderThanDays) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const allTabs = await browser.tabs.query({});
    return allTabs.filter(tab => tab.lastAccessed < cutoff);
  }
  
  async findByTitle(searchTerm) {
    const allTabs = await browser.tabs.query({});
    return allTabs.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
  
  // TODO: Phase 2 - Add content search with content scripts
  async findByContent(searchTerm) {
    throw new Error('Not implemented yet - Phase 2');
  }
}
```

#### 2. Group Manager (`lib/group-manager.js`)
```javascript
class GroupManager {
  // Groups stored in storage.local as:
  // { tabId: { group: 'main|staging|bin', dateSwiped: timestamp } }
  
  async getGroup(tabId) {
    const data = await storage.get(tabId);
    return data?.group || 'main';
  }
  
  async setGroup(tabId, group) {
    const metadata = {
      group,
      dateSwiped: group === 'bin' ? Date.now() : null
    };
    await storage.set(tabId, metadata);
  }
  
  async getTabsInGroup(group) {
    const allTabs = await browser.tabs.query({});
    const grouped = [];
    for (let tab of allTabs) {
      const tabGroup = await this.getGroup(tab.id);
      if (tabGroup === group) {
        grouped.push(tab);
      }
    }
    return grouped;
  }
  
  // Auto-delete bin tabs older than 2 days
  async cleanupBin() {
    const binTabs = await this.getTabsInGroup('bin');
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    
    for (let tab of binTabs) {
      const metadata = await storage.get(tab.id);
      if (metadata.dateSwiped < twoDaysAgo) {
        await browser.tabs.remove(tab.id);
        await storage.remove(tab.id);
      }
    }
  }
}
```

#### 3. Swipe Cards UI (`ui/swipe-cards.js`)
```javascript
class SwipeCard {
  constructor(tab, groupManager) {
    this.tab = tab;
    this.groupManager = groupManager;
    this.startX = 0;
    this.currentX = 0;
    this.isDragging = false;
  }
  
  render() {
    return `
      <div class="card" data-tab-id="${this.tab.id}">
        <div class="card-header">
          <img class="favicon" src="${this.tab.favIconUrl}" />
          <h3 class="title">${this.escapeHtml(this.tab.title)}</h3>
        </div>
        <div class="metadata">
          <span class="domain">${this.extractDomain(this.tab.url)}</span>
          <span class="age">${this.formatAge(this.tab.lastAccessed)}</span>
        </div>
        <!-- TODO: Phase 2 - Add content preview -->
        <div class="actions">
          <button class="btn-staging">Staging →</button>
          <button class="btn-bin">Bin ×</button>
        </div>
      </div>
    `;
  }
  
  attachSwipeHandlers(element) {
    element.addEventListener('touchstart', (e) => {
      this.startX = e.touches[0].clientX;
      this.isDragging = true;
    });
    
    element.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;
      this.currentX = e.touches[0].clientX;
      const deltaX = this.currentX - this.startX;
      // TODO: Phase 2 - Add visual feedback (card translation)
      element.style.transform = `translateX(${deltaX}px)`;
    });
    
    element.addEventListener('touchend', async (e) => {
      const deltaX = this.currentX - this.startX;
      const SWIPE_THRESHOLD = 80; // pixels
      
      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        if (deltaX > 0) {
          // Swipe right - previous group
          await this.moveToPreviousGroup();
        } else {
          // Swipe left - next group
          await this.moveToNextGroup();
        }
      } else {
        // Reset position
        element.style.transform = 'translateX(0)';
      }
      
      this.isDragging = false;
    });
  }
  
  async moveToNextGroup() {
    const currentGroup = await this.groupManager.getGroup(this.tab.id);
    const nextGroup = {
      'main': 'staging',
      'staging': 'bin',
      'bin': 'bin' // Stay in bin
    }[currentGroup];
    
    await this.groupManager.setGroup(this.tab.id, nextGroup);
    // TODO: Phase 2 - Add haptic feedback
    // TODO: Phase 2 - Animate card exit
  }
}
```

#### 4. Query Language Parser (`lib/query-parser.js`)
```javascript
class QueryParser {
  // Parse queries like: "domain: wikipedia AND age > 7d"
  // TODO: Phase 3 - Full implementation with AST
  
  parse(queryString) {
    // Basic implementation for MVP
    const filters = {
      domain: null,
      age: null,
      title: null
    };
    
    // Simple regex-based parsing for Phase 1
    const domainMatch = queryString.match(/domain:\s*([^\s]+)/);
    if (domainMatch) filters.domain = domainMatch[1];
    
    const ageMatch = queryString.match(/age\s*>\s*(\d+)d/);
    if (ageMatch) filters.age = parseInt(ageMatch[1]);
    
    const titleMatch = queryString.match(/title:\s*"([^"]+)"/);
    if (titleMatch) filters.title = titleMatch[1];
    
    return filters;
  }
  
  // TODO: Phase 3 - Add syntax highlighting
  tokenize(queryString) {
    // Return array of {type, value, color} for highlighting
    throw new Error('Not implemented - Phase 3');
  }
  
  // TODO: Phase 3 - Autocomplete suggestions
  getSuggestions(partialQuery, cursorPosition) {
    throw new Error('Not implemented - Phase 3');
  }
}
```

#### 5. Export Functionality (`lib/export.js`)
```javascript
async function exportToCSV(tabs, groupManager) {
  const header = 'Title,URL,Domain,Date Opened,Last Accessed,Age (days),Group\n';
  
  const rows = await Promise.all(tabs.map(async (tab) => {
    const group = await groupManager.getGroup(tab.id);
    const age = Math.floor((Date.now() - tab.lastAccessed) / (24 * 60 * 60 * 1000));
    const domain = extractDomain(tab.url);
    
    return [
      escapeCSV(tab.title),
      escapeCSV(tab.url),
      escapeCSV(domain),
      new Date(tab.lastAccessed).toISOString(),
      new Date(tab.lastAccessed).toISOString(),
      age,
      group
    ].join(',');
  }));
  
  const csv = header + rows.join('\n');
  
  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `filtre-infini-tabs-${Date.now()}.csv`;
  a.click();
  
  // TODO: Phase 4 - Add JSON export format
  // TODO: Phase 4 - Add HTML report format
}

function escapeCSV(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
```# FiltreInfini: Mobile Tab Management Extension Research

**Project Codename:** FiltreInfini  
**Target Platform:** Firefox for Android  
**Architecture:** Mobile-first, local-only, private  
**Last Updated:** October 26, 2025

### Manifest Configuration

```json
{
  "manifest_version": 2,
  "name": "FiltreInfini - Advanced Tab Manager",
  "version": "0.1.0",
  "description": "Powerful mobile-first tab management with swipe interface and smart filters",
  
  "permissions": [
    "tabs",
    "storage"
  ],
  
  "browser_action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "48": "icons/icon-48.png",
      "96": "icons/icon-96.png"
    },
    "default_title": "FiltreInfini"
  },
  
  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png"
  },
  
  "background": {
    "scripts": ["background/background.js"],
    "persistent": false
  },
  
  "browser_specific_settings": {
    "gecko": {
      "id": "filtre-infini@example.com",
      "strict_min_version": "120.0"
    },
    "gecko_android": {
      "strict_min_version": "120.0"
    }
  }
}
```

**Notes**:
- Manifest V2 for maximum compatibility (V3 also works)
- Non-persistent background page for better performance
- Minimum Firefox 120 (when open extensions launched on Android)
- `browser_action` works on mobile as menu item

---

## Code Style Guidelines

### JavaScript Conventions
```javascript
// Use modern ES6+ syntax
const tabs = await browser.tabs.query({});

// Descriptive variable names (not too terse)
const olderThanDays = 7; // Good
const d = 7; // Avoid

// TODO comments are structured and actionable
// TODO: Phase 2 - Add swipe gesture detection
// See: https://developer.mozilla.org/...

// Async/await over promises
async function closeTabs(tabIds) {
  return await browser.tabs.remove(tabIds);
}

// Error handling with helpful messages
try {
  await closeTabs(ids);
} catch (error) {
  console.error('Failed to close tabs:', error);
  showError('Could not close tabs. They may have already been closed.');
}
```

### CSS Conventions
```css
/* BEM-inspired naming */
.card { }
.card__header { }
.card__title { }
.card--staging { }

/* CSS Custom Properties for theming */
:root {
  --color-bg: #FAFAF9;
  --color-text: #1A1A1A;
  --color-main: #3B82F6;
  --spacing-md: 16px;
  --border-radius: 12px;
}

/* Mobile-first media queries */
.grid {
  grid-template-columns: 1fr;
}

@media (min-width: 600px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

### File Organization
- One class per file
- Related functions grouped together
- Clear imports/exports
- Comments explain "why", not "what"
- TODOs mark future work clearly

---

## Design & Brand Guidelines

### Visual Identity
**Codename**: FiltreInfini (Filter Infinite)
**Core Aesthetic**: Digital Paper - Clean, modern, sophisticated

### Design Principles
1. **Clarity Over Decoration**: Information hierarchy first, flourishes second
2. **Touch-First**: All interactions optimized for thumb navigation
3. **Confidence in Simplicity**: Powerful features presented elegantly
4. **Respect for Content**: Tab information is sacred - present it beautifully
5. **Progressive Disclosure**: Show what's needed, hide complexity until requested

### Typography
**Font Philosophy**: Digital paper aesthetic with excellent readability

**Recommended Font Stack**:
```css
/* Headings: Modern, slightly technical feel */
font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 
             'Segoe UI', 'Roboto', sans-serif;

/* Body/UI: Clean, highly legible */
font-family: 'Inter', -apple-system, BlinkMacSystemFont,
             'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;

/* Code/Technical (query language): Monospace */
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 
             'Consolas', monospace;
```

**Type Scale**:
- Page Title: 24px, semi-bold
- Section Headers: 18px, medium
- Tab Titles: 16px, regular
- Metadata: 14px, regular
- Small Text: 12px, regular

### Color Palette
**Philosophy**: Calm, sophisticated, high contrast for readability

**Primary Palette**:
- **Background**: `#FAFAF9` (Warm white, digital paper)
- **Surface**: `#FFFFFF` (Pure white for cards/elevated elements)
- **Text Primary**: `#1A1A1A` (Near black, high contrast)
- **Text Secondary**: `#666666` (Medium gray for metadata)
- **Text Tertiary**: `#999999` (Light gray for hints)

**Accent Colors** (Semantic):
- **Main Group**: `#3B82F6` (Bright blue - active, primary)
- **Staging Group**: `#F59E0B` (Amber - caution, review needed)
- **Bin Group**: `#EF4444` (Red - danger, will be deleted)
- **Success**: `#10B981` (Green - for confirmations)
- **Syntax Highlighting**:
  - Keywords: `#8B5CF6` (Purple)
  - Operators: `#06B6D4` (Cyan)
  - Values: `#EC4899` (Pink)
  - Strings: `#14B8A6` (Teal)

**Interaction States**:
- Hover: Subtle scale (1.02) + shadow
- Active/Pressed: Scale (0.98)
- Disabled: 40% opacity
- Focus: 2px solid outline in accent color

### Spacing System
**8px Base Unit** for consistent rhythm
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Component Design

#### Cards (SpeedDating Interface)
```
┌─────────────────────────────────────┐
│ [favicon] Tab Title Here            │ ← 16px bold
│ example.com • 3 days old            │ ← 14px gray
│                                     │
│ Preview of page content appears     │ ← 14px, 2 lines max
│ here with subtle fade at bottom...  │
│                                     │
│ [Staging →] [← Main] [Bin ×]       │ ← Action hints
└─────────────────────────────────────┘
```
- Rounded corners: 12px
- Shadow: `0 2px 8px rgba(0,0,0,0.08)`
- Padding: 16px
- Swipe gesture: 80px minimum for trigger
- Card size: Full width - 32px margin (16px each side)

#### List View Rows
```
☐ [icon] Tab Title               age  domain.com
```
- Height: 56px (touch-friendly)
- Checkbox: 24px tap target
- Separators: 1px `#E5E5E5`
- Selected: Light blue background `#EFF6FF`

#### Query Language Input
```
┌─────────────────────────────────────┐
│ domain: wikipedia AND age > 7d     │ ← Syntax highlighted
│ ╰─────────╯         ╰────────╯     │ ← Underlines on match
│                                     │
│ [Run Query] [Clear]                │
└─────────────────────────────────────┘
```
- Monospace font for input
- Real-time syntax highlighting
- Autocomplete dropdown: White card, shadow
- Error messages: Red text, icon, helpful suggestion

### Animation & Motion
**Philosophy**: Snappy but not jarring, purposeful movement

**Timings**:
- Quick interactions: 150ms (button press, toggle)
- Standard transitions: 250ms (card swipe, page change)
- Slow reveals: 400ms (query results appear)

**Easing**:
- Default: `cubic-bezier(0.4, 0.0, 0.2, 1)` (Material Design standard)
- Bounce (swipe): `cubic-bezier(0.68, -0.55, 0.265, 1.55)`
- Smooth (fade): `ease-in-out`

**Key Animations**:
- Swipe gesture: Card follows finger, bounces back if not threshold
- Delete from Bin: Fade out + collapse (stagger for multiple)
- Tab count updates: Number morphs with slight scale pulse
- Query results: Fade in, stagger by 50ms per item

### Mobile UX Patterns

#### Touch Targets
- Minimum: 44px × 44px (Apple HIG standard)
- Preferred: 48dp (Material Design standard)
- Spacing between: 8px minimum

#### Gestures
- **Swipe left**: Send to next group (Main→Staging→Bin)
- **Swipe right**: Send to previous group (Bin→Staging→Main)
- **Long press**: Select mode (multi-select in list view)
- **Pull to refresh**: Re-query / update counts
- **Double tap**: Quick preview (open in background)

#### Navigation
- Bottom tab bar (thumb-friendly):
  - [Cards] [List] [Query] [Stats]
- Floating Action Button (FAB) for primary action
- Top bar: Title + export button
- Back gesture: Browser native (don't override)

#### Keyboard Behavior
- Auto-capitalize: Off for query language
- Auto-correct: Off for technical input
- Return key: "Search" or "Done" based on context
- Dismiss keyboard on scroll

### Accessibility
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Focus indicators: Clear, 2px outlines
- Touch targets: 44px minimum
- Screen reader: Proper ARIA labels
- Reduced motion: Respect `prefers-reduced-motion`

### Empty States
**Philosophy**: Helpful, not judgmental

**Examples**:
- No tabs in Staging: "Your staging area is empty. Swipe tabs here to review later."
- No tabs in Bin: "Nothing scheduled for deletion. Swipe tabs here when you're done with them."
- No search results: "No tabs match '[query]'. Try a different filter."
- First time use: Brief tutorial cards explaining swipe mechanic

### Loading & Performance
- Skeleton screens while loading
- Progressive rendering (show first 20 results immediately)
- Lazy load card previews
- Debounce search: 300ms
- Show count immediately, load details progressively

### Micro-interactions
- Swipe feedback: Haptic (if available)
- Success actions: Checkmark animation
- Deletion: Trash can icon fills
- Export: Download icon pulses
- Refresh: Circular progress

### Error Handling
**Philosophy**: Clear, actionable, never blame the user

**Error Message Pattern**:
```
[Icon] What happened
       Why it happened
       [Action Button]
```

**Examples**:
- "Can't close this tab" → "This tab is currently active. Switch to another tab first."
- "Query syntax error" → "Expected 'AND' or 'OR' after 'domain:'. Try: domain: example AND age > 7d"

### Responsive Behavior
**Primarily mobile**, but should work on tablets
- Phone (< 600px): Single column, full-width cards
- Tablet (600-900px): Two-column grid for cards
- Desktop (> 900px): Three columns, sidebar nav

---

## Tab Management Research Insights

### User Psychology (Research-Backed)
1. **The 8-Tab Threshold**: Studies show median stress point at 8 open tabs
2. **Fear of Missing Out**: Users keep tabs open because they fear losing information
3. **Tabs as To-Do Lists**: Many use open tabs as task reminders
4. **Tab Bankruptcy**: When overwhelmed, users close everything and start fresh
5. **Domain Patterns**: Users naturally group by website/domain in their minds
6. **Time Decay**: Tabs get less relevant over time but users don't close them

### Common Management Patterns
1. **Time-Based Cleanup**: "Close tabs older than X days"
2. **Domain-Based**: "Close all tabs from [site]"
3. **Project Grouping**: Organize tabs by work/personal/hobby
4. **Frequency-Based**: Pin frequently used, close rarely accessed
5. **Read-Later Workflow**: Save article, close tab, read from saved list
6. **One-Tab Rule**: Try to work with minimal tabs for focus

### Why Users Keep Too Many Tabs
- Reminders: "I'll read this later"
- Research: "I need these for my project"
- Fear: "What if I can't find it again?"
- Procrastination: "I'll decide what to do with this... eventually"
- Context: "These all relate to what I'm working on"

### How FiltreInfini Addresses These
1. **Staging Group** → Solves "read later" without keeping tabs open
2. **Bin with 2-Day Delay** → Addresses fear of losing information
3. **Domain Filters** → Aligns with how users mentally group tabs
4. **Age-Based Cleanup** → Automated time decay handling
5. **SpeedDating UI** → Makes triage fun, not overwhelming
6. **Export Function** → Ultimate safety net - nothing is truly lost

---

## Executive Summary

FiltreInfini is a Firefox mobile extension for advanced tab management. After evaluating cross-device sync approaches, **mobile-first local management is the only viable path** due to Firefox Sync's lack of extension APIs for remote tab control.

**Key Decision:** Build a native mobile extension with full local tab management capabilities rather than attempting desktop-to-mobile control via sync.

---

## Project Goals

### Primary Objectives
- Manage massive tab collections on mobile Firefox (100+ tabs common, some users have 1000+)
- Query tabs by domain, age, content, patterns
- Bulk operations (close, export, organize)
- Private, offline-first, no external services
- Excellent mobile UX for complex queries

### User Persona
- Heavy tab user across devices
- Frustrated with passive-aggressive "you have too many tabs" messaging
- Wants sophisticated filtering and management
- Values privacy and local control
- Comfortable with technical queries but needs good UX

---

## Use Cases & Requirements

### Core Use Cases
1. **Domain-based management**
   - "How many tabs from thezvi substack?"
   - "Close all wikipedia.org tabs"
   - Pattern matching on URLs

2. **Time-based operations**
   - Close tabs opened more than X days ago
   - Close tabs not accessed since X days
   - Age-based filtering

3. **Content search**
   - Find tabs containing specific text/sentence
   - Search in titles (easy)
   - Search in page content (requires content scripts)

4. **Data export**
   - Export all tabs to CSV
   - Include metadata: URL, title, last accessed, age

5. **Bulk operations**
   - Close multiple tabs matching criteria
   - Save/restore tab collections
   - Organize by patterns

---

## Technical Feasibility

### What Works ✅
- **Full tabs API access on mobile**: Query, close, create, update all work
- **Local storage**: `storage.local` fully supported on Firefox Android
- **Permissions**: Can request `tabs` permission without issues
- **UI flexibility**: Can build custom popup/page interfaces
- **Offline operation**: Everything works without network

### What Doesn't Work ❌
- **Firefox Sync API for extensions**: Does NOT exist - cannot access or manage tabs on remote devices
- **storage.sync on mobile**: Not yet synced to Firefox Account ([Bug 1625257](https://bugzilla.mozilla.org/show_bug.cgi?id=1625257))
- **Remote tab control**: No API to close tabs on other devices
- **Bookmark API on mobile**: Not supported on Firefox Android

### What's Limited ⚠️
- **Tab metadata**:
  - ✅ Available: `id`, `url`, `title`, `favIconUrl`, `lastAccessed`
  - ❌ Not available: "last read" time, custom metadata
  - Workaround: Use `lastAccessed` (when tab was last active)
  
- **Content search**:
  - Searching tab page content requires content scripts
  - Heavy operation, needs careful implementation
  - Title/URL search much more practical

---

## Firefox Mobile Extension Ecosystem

### Current State (Oct 2025)
- **Full extension support launched**: December 2023
- **Available extensions**: 400+ on AMO
- **API parity**: Nearly complete with desktop
- **Development**: Same process as desktop, debug via ADB

### Extension Support
- Extensions work on Firefox for Android (not iOS due to Apple restrictions)
- Can test on Android Nightly, Beta, or Release
- Manifest V2 and V3 supported
- Most WebExtension APIs available

### Key APIs Available on Mobile
```javascript
// Core APIs confirmed working on Android:
browser.tabs.*           // Full support
browser.storage.local    // Works
browser.storage.session  // Works
browser.runtime.*        // Works
browser.browserAction.*  // Works (UI integration)
```

### APIs NOT Available on Mobile
```javascript
browser.bookmarks.*      // Not supported
browser.storage.sync     // Supported but doesn't sync (bug)
browser.windows.*        // Mobile is single-window
browser.commands.*       // No keyboard shortcuts on mobile
browser.devtools.*       // No devtools on mobile
```

---

## Implementation Architecture

### Recommended Tech Stack
- **Manifest**: V2 or V3 (both work, V3 more future-proof)
- **UI Framework**: Vanilla JS or lightweight library
  - Mobile needs fast, lean code
  - Consider Preact if framework needed (3kb)
  - Avoid React (too heavy for mobile extension)
- **Storage**: `storage.local` for all data
- **Styling**: Mobile-first CSS, touch-friendly UI

### Extension Structure
```
filtre-infini/
├── manifest.json
├── popup/
│   ├── popup.html          # Main UI
│   ├── popup.js            # Query interface
│   └── popup.css           # Mobile-optimized styles
├── background/
│   └── background.js       # Tab operations
├── icons/
│   └── icon-*.png
└── lib/
    ├── tab-queries.js      # Query engine
    ├── filters.js          # Domain/time/content filters
    └── export.js           # CSV export logic
```

### Core Components

#### 1. Tab Query Engine
```javascript
// Query tabs with flexible filters
class TabQuery {
  async findByDomain(pattern) {
    return browser.tabs.query({url: pattern});
  }
  
  async findByAge(olderThanDays) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const allTabs = await browser.tabs.query({});
    return allTabs.filter(tab => tab.lastAccessed < cutoff);
  }
  
  async findByTitle(searchTerm) {
    const allTabs = await browser.tabs.query({});
    return allTabs.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
}
```

#### 2. Bulk Operations
```javascript
async function closeTabs(tabIds) {
  return browser.tabs.remove(tabIds);
}

async function exportToCSV(tabs) {
  const csv = tabs.map(tab => 
    `"${tab.title}","${tab.url}",${tab.lastAccessed}`
  ).join('\n');
  return csv;
}
```

#### 3. Mobile UI Patterns
- Swipe gestures for common actions
- Bottom sheet for filters
- Quick action buttons
- Preset filters (common queries saved)
- Stats dashboard (tab counts by domain/age)

---

## API Deep Dive: tabs API

### Key Methods for FiltreInfini

#### Query Tabs
```javascript
// Get all tabs
browser.tabs.query({});

// Filter by URL pattern
browser.tabs.query({url: "*wikipedia.org*"});

// Get current tab
browser.tabs.query({active: true, currentWindow: true});
```

#### Tab Object Properties
```javascript
{
  id: 123,
  url: "https://example.com/page",
  title: "Example Page",
  favIconUrl: "https://example.com/favicon.ico",
  lastAccessed: 1698342123456,  // Unix timestamp in ms
  active: false,
  windowId: 1,
  index: 5
}
```

#### Close Tabs
```javascript
// Close single tab
browser.tabs.remove(tabId);

// Close multiple tabs
browser.tabs.remove([id1, id2, id3]);
```

#### Listen to Tab Events
```javascript
// Tab created
browser.tabs.onCreated.addListener((tab) => {});

// Tab updated (URL changed, etc)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {});

// Tab closed
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {});
```

---

## Permissions Required

### manifest.json Permissions
```json
{
  "permissions": [
    "tabs",           // Required for tab operations
    "storage",        // For local data persistence
    "activeTab"       // For current tab access (optional, more restricted)
  ]
}
```

### Permission Notes
- `"tabs"` permission shows user warning about "Access browser tabs"
- Necessary for accessing `tab.url` and `tab.title`
- Cannot be avoided for our use cases
- Auto-granted on mobile (no user prompt during install currently)

---

## Mobile-Specific Considerations

### UI Constraints
- Small screen (mobile optimized layouts required)
- Touch interactions (larger tap targets, swipe gestures)
- Portrait orientation primary (test landscape too)
- System keyboard for text input
- Limited vertical space

### Performance
- Mobile devices have less RAM
- Many tabs open = memory pressure
- Content scripts for page text search = expensive
- Optimize for lean operations
- Consider pagination for large result sets

### Testing
- Requires Android device or emulator
- Debug via `adb` and `about:debugging`
- Test on various screen sizes
- Battery/performance monitoring

---

## Content Search Implementation

### Challenge
Searching page content (not just title/URL) requires:
1. Inject content script into each tab
2. Extract page text
3. Search text
4. Return results

### Approach
```javascript
// Content script to extract text
// content.js
browser.runtime.sendMessage({
  type: 'pageText',
  text: document.body.innerText
});

// Background script to coordinate
async function searchTabContent(searchTerm) {
  const tabs = await browser.tabs.query({});
  const results = [];
  
  for (let tab of tabs) {
    try {
      // Inject content script
      await browser.tabs.executeScript(tab.id, {
        file: 'content.js'
      });
      // Wait for response with page text
      // Search for term
      // Add to results if match
    } catch (e) {
      // Handle tabs where injection fails
    }
  }
  return results;
}
```

### Limitations
- Cannot inject into `about:*` pages
- Cannot inject into `chrome:*` pages  
- Cannot inject into PDFs (without permission)
- Heavy operation for 100+ tabs
- Consider lazy/on-demand searching

---

## Alternative: Hacky Sync Workarounds

These are NOT recommended but documented for completeness:

### "About Sync" Extension Method
- Install "About Sync" debug extension
- Access `about:sync` page
- View raw sync data as JSON
- Extract tab data from other devices
- **Problem**: Read-only, no way to close remote tabs

### Bookmark-Based Sync
- Export tabs as bookmarks
- Sync via Firefox Sync (bookmarks DO sync)
- Import/manage on other device
- **Problem**: Clunky, bookmarks API not on mobile

### Self-Hosted Sync Service
- Build custom backend
- Extension posts tab data to server
- Other devices fetch from server
- **Problem**: Infrastructure, accounts, privacy concerns

**Verdict**: Not worth the complexity. Go local.

---

## Development Workflow

### Setup
```bash
# Install web-ext
npm install -g web-ext

# Install ADB (Android Debug Bridge)
# Linux: apt-get install android-tools-adb
# Mac: brew install android-platform-tools
# Windows: Download from Android SDK

# Connect device via USB or WiFi
adb devices

# Run extension on mobile
web-ext run --target firefox-android --android-device=<device-id>
```

### Debug
```
1. Enable USB debugging on Android device
2. Connect device to computer
3. Open about:debugging in desktop Firefox
4. Enable device connection
5. Install extension to device
6. Debug via DevTools
```

### Test
- Test on real device (emulators okay for development)
- Test with 50+ tabs open
- Test various domains, URLs
- Test edge cases (no tabs, all tabs match filter, etc)

---

## Privacy & Security

### Data Handling
- ✅ All data stays on device (`storage.local`)
- ✅ No network requests required
- ✅ No analytics, no tracking
- ✅ User has full control

### Permissions
- Extension needs `tabs` permission (shows URLs)
- Inherent trust: extension can see all tabs
- Clearly communicate in description
- Open source recommended for trust

---

## Architecture Decisions ✅

### 1. Tech Stack: Vanilla JS
**Decision**: Pure vanilla JavaScript, no frameworks
**Rationale**: 
- Showcase-quality clean code
- Open source excellence - this will be a reference implementation
- Maximum performance on mobile
- No build system complexity
- Direct WebExtension API usage

### 2. Multiple UI Modes
**Decision**: Three distinct interfaces for different workflows

#### A. Query Language (QL) Interface
- Custom domain-specific query language
- Syntax highlighting with color-coded expression parts
- Autocomplete UX with value suggestions
- Examples:
  - `date_open < 2025-10-12`
  - `url: *example*`
  - `domain: wikipedia.org AND age > 7d`
- Progressive parser with helpful error messages
- Visual feedback as user types

#### B. SpeedDating Swipe Interface
**The core innovation**: Card-based triage system with 3 groups
- **Main**: Active tabs (default location)
- **Staging**: Tabs to review/revisit (like "read later")
- **Bin**: Marked for deletion

**Workflow**:
1. User browses cards from any group (Main/Staging/Bin)
2. Each card shows: title, URL, favicon, domain, age, last accessed, content preview
3. Swipe gestures:
   - Swipe Main → sends to Staging
   - Swipe Staging → sends to Bin
   - Swipe Bin → auto-delete after 2 days (adds `date_swiped` metadata)
4. Touch-friendly, mobile-optimized card UI
5. Statistics: "25 tabs in Main, 12 in Staging, 8 in Bin"

**Key feature**: Bin is a safety net, not immediate deletion
- Tabs in Bin automatically deleted after 2 days
- Can rescue from Bin before deletion
- Visual countdown timer on Bin tabs

#### C. List View Interface
- Tabular view of all tabs
- Multi-select with checkboxes
- Bulk actions: Send to Staging, Send to Bin, Close Now, Export
- Sort by: age, domain, last accessed, title
- Filter while viewing
- Compact for power users who want overview

### 3. Preset Filters (Inspired by Tab Management Research)
**Decision**: Build smart presets based on real user patterns

**Built-in Presets**:
1. **Ancient Tabs**: `age > 30d` - Tabs open more than a month
2. **Forgotten Tabs**: `last_accessed > 14d` - Not viewed in 2 weeks
3. **News Sites**: `domain: (news|reddit|hn)` - News/social domains
4. **Shopping Tabs**: `domain: (amazon|ebay|shop)` - E-commerce sites
5. **Wikipedia Rabbit Hole**: `domain: wikipedia.org` - All Wikipedia tabs
6. **YouTube Queue**: `domain: youtube.com` - Video tabs
7. **Duplicates**: Find multiple tabs with same URL
8. **Today's Tabs**: `date_open: today` - Tabs opened today
9. **This Week**: `date_open: 7d` - Recent tabs
10. **Tab Bankruptcy**: All tabs (for when you want to start fresh)

**Research-backed rationale**:
- Studies show 8 tabs is stress point - help users stay under
- Users keep tabs as reminders - Staging group solves this
- Fear of losing information - Bin with 2-day delay solves this
- Domain-based cleanup is common pattern
- Time-based cleanup is most requested

### 4. Export Format
**Decision**: CSV only for MVP
- Simple, universal format
- Opens in Excel, Google Sheets, any text editor
- Columns: Title, URL, Domain, Date Opened, Last Accessed, Age (days), Current Group
- Future: JSON, HTML report (marked as TODO)

### 5. Content Search
**Decision**: Build in progressive phases, use TODOs extensively
- **Phase 1** (MVP): URL and title search only
- **Phase 2** (TODO): Add content script for full-text search
- **Phase 3** (TODO): Optimize with caching, lazy loading
- Clearly mark in code: `// TODO: Phase 2 - Implement content search`
- Document performance considerations

### 6. Tab Groups API
**Decision**: Not implemented for MVP
- Firefox Android tab groups API status unclear
- Not essential for core functionality
- Marked as `// TODO: Research Firefox Android tab groups support`

### 7. Localization
**Decision**: English-only MVP
- Focus on making the best English experience first
- i18n infrastructure can be added later
- Code structure should be i18n-ready (avoid hardcoded strings)

---

## Key Findings Summary

### Critical Insights
1. **Firefox Sync API doesn't exist for extensions** - desktop controlling mobile tabs is impossible
2. **Mobile extensions have full tabs API** - local management fully supported
3. **storage.sync doesn't work yet** - use storage.local only
4. **Content search is expensive** - title/URL search more practical
5. **Mobile UI is constraining** - must optimize for touch and small screens

### Recommended Architecture
- **Mobile-first extension** with local tab management
- **Lean UI** with preset filters and custom queries
- **Export functionality** for backup/analysis
- **No external dependencies** - pure WebExtension APIs
- **Progressive enhancement** - start with URL/title search, add content search later

---

## Resources & References

### Official Documentation
- [Firefox Extension Workshop](https://extensionworkshop.com/)
- [WebExtension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [tabs API Reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs)
- [Developing for Firefox Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
- [Differences: Desktop vs Android](https://extensionworkshop.com/documentation/develop/differences-between-desktop-and-android-extensions/)

### Key Bugs & Issues
- [Bug 1625257 - storage.sync doesn't sync on Android](https://bugzilla.mozilla.org/show_bug.cgi?id=1625257)
- [Feature Request: Remote tab closing](https://connect.mozilla.org/t5/ideas/send-close-tab-request-to-other-device-via-sync-remotely-close/idi-p/2092)

### Community Resources
- [Firefox Add-ons Discourse](https://discourse.mozilla.org/c/add-ons/35)
- [WebExtensions Examples](https://github.com/mdn/webextensions-examples)
- [tabs-tabs-tabs Example](https://github.com/mdn/webextensions-examples/tree/main/tabs-tabs-tabs)

### Tools
- [web-ext CLI Tool](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
- [Android Debug Bridge (ADB)](https://developer.android.com/studio/command-line/adb)
- [Firefox Android Nightly](https://play.google.com/store/apps/details?id=org.mozilla.fenix)

---

## Next Steps: Progressive Development with TODOs

### Phase 1: MVP Foundation (Week 1)
**Goal**: Working extension with basic tab query and close functionality

**Core Features**:
1. ✅ Manifest.json setup
2. ✅ Basic popup UI skeleton
3. ✅ Tab query engine (URL, title, age filters)
4. ✅ Close tabs functionality
5. ✅ Simple list view
6. ✅ CSV export

**TODO Markers for Phase 2+**:
```javascript
// TODO: Phase 2 - Add SpeedDating swipe interface
// TODO: Phase 2 - Implement Staging/Bin groups
// TODO: Phase 2 - Add content script for full-text search
// TODO: Phase 3 - Syntax highlighting for query language
// TODO: Phase 3 - Autocomplete suggestions
```

### Phase 2: SpeedDating Interface (Week 2)
**Goal**: Card-based swipe UI with Main/Staging/Bin groups

**Features**:
1. ✅ Card component with tab metadata
2. ✅ Swipe gesture detection
3. ✅ Three-group system (Main/Staging/Bin)
4. ✅ Persist group assignments in storage.local
5. ✅ Auto-delete from Bin after 2 days
6. ✅ Statistics dashboard

**TODO Markers for Phase 3+**:
```javascript
// TODO: Phase 3 - Add haptic feedback for swipes
// TODO: Phase 3 - Optimize card rendering for 100+ tabs
// TODO: Phase 4 - Add undo for swipe actions
```

### Phase 3: Query Language (Week 3)
**Goal**: Custom QL with syntax highlighting and autocomplete

**Features**:
1. ✅ Query parser (domain, age, url, title operators)
2. ✅ Syntax highlighting (color-coded tokens)
3. ✅ Autocomplete dropdown
4. ✅ Error messages with suggestions
5. ✅ Preset queries (Ancient Tabs, Forgotten, etc.)

**TODO Markers for Phase 4+**:
```javascript
// TODO: Phase 4 - Add regex support to query language
// TODO: Phase 4 - Save custom queries
// TODO: Phase 5 - Query history
```

### Phase 4: Polish & Performance (Week 4)
**Goal**: Refined UX, optimizations, testing

**Features**:
1. ✅ Mobile UX refinement (touch targets, gestures)
2. ✅ Loading states and skeleton screens
3. ✅ Error handling polish
4. ✅ Performance optimization (lazy loading, debounce)
5. ✅ Empty states with helpful messaging
6. ✅ Comprehensive testing on real device

**TODO Markers for Future**:
```javascript
// TODO: Future - Content search with page text extraction
// TODO: Future - i18n infrastructure
// TODO: Future - Export to JSON/HTML
// TODO: Future - Tab groups API integration (if available)
// TODO: Future - Statistics/analytics view
// TODO: Future - Dark mode
```

### Development Workflow Emphasis
**Use TODOs Profusely**:
- Every feature not in current phase gets a TODO
- TODOs should be specific and actionable
- Include phase number in TODO comments
- Mark completed TODOs as ✅ in commit messages

**Example TODO Structure**:
```javascript
// ============================================
// TODO: Phase 2 - Swipe Gesture Detection
// ============================================
// Implement touch event handlers for swipe:
// - touchstart: record initial position
// - touchmove: calculate delta, show visual feedback
// - touchend: trigger action if threshold met
// See: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events
// ============================================

function handleSwipe(tab) {
  // CURRENT: Just clicking button to stage
  // TODO: Phase 2 - Replace with swipe gesture
  stageTab(tab);
}
```

### Testing Strategy
**Phase 1**: Manual testing with 10-20 tabs
**Phase 2**: Manual testing with 50-100 tabs, real mobile device
**Phase 3**: User testing with tab hoarders (100+ tabs)
**Phase 4**: Performance profiling, edge cases, stress tests

### Release Strategy
**MVP Release**: After Phase 1 complete
- Submit to AMO as unlisted (for testing)
- Share with small group for feedback

**Public Beta**: After Phase 2 complete
- List on AMO publicly
- Gather user feedback
- Iterate based on real usage

**v1.0**: After Phase 4 complete
- Stable, polished, tested
- Open source on GitHub
- Promote as reference implementation

---

**End of Research Document**  
*Ready to build FiltreInfini with Claude Code.*