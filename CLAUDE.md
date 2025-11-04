# FiltreInfini - Development Guide for Claude

## Project Overview
Mobile-first Firefox extension for advanced tab management. User is fed up with Firefox mobile's "infinite tabs" UX and wants powerful, configurable tab management with a Main/Staging/Bin workflow.

## Core Principles

### 0. Working Practices
- **Always leverage TODO feature**: Use TodoWrite tool with detailed task breakdown (1.1, 1.2, 2.1, etc.) to plan and track all work
- **Data Minimization CRITICAL**: When handling sensitive data (history, auth tokens, personal info), ensure Claude NEVER sees it at glance - only user derives value through local processing

### 1. MVP-First Development
- **Start small, validate fast**: Test UX patterns and data loading before going deep
- **Don't follow rigid phase plans**: Find our own pace based on what works
- **Validate assumptions early**: Use TDD to test browser API behavior

### 2. Technical Decisions (LOCKED)
- ✅ **Manifest V3 only**: Future-proof, no V2
- ✅ **Full-page UI**: Not popup (better for touch events, more space)
- ✅ **Vanilla JS**: Clean, showcase-quality code
- ✅ **Desktop prototyping**: Use Playwright for testing
- ✅ **storage.local only**: storage.sync doesn't work on Android
- ✅ **TDD approach**: Test API assumptions, don't assume docs are correct

### 3. Feature Priorities
1. **List View** (Priority 1): Tabular interface with bulk operations
2. **Query Language** (Priority 1): Domain-specific filtering with syntax highlighting
3. **Main/Staging/Bin Groups**: Core workflow (Bin has 2-day auto-delete)
4. **Swipe UI**: Nice-to-have, but only if feasible (test early!)

### 4. Git Workflow
- **Commit early, commit often**: Small, atomic commits
- **Descriptive messages**: What and why
- **Clean history**: Each feature is traceable

## Architecture

### File Structure
```
filtre-infini/
├── manifest.json              # V3 manifest
├── ui/
│   ├── manager.html          # Full-page interface
│   ├── manager.js            # UI controller
│   └── styles/
│       ├── base.css          # Variables, reset
│       ├── components.css    # UI components
│       └── layouts.css       # Grid, spacing
├── lib/
│   ├── tab-query.js          # Query engine
│   ├── query-parser.js       # QL parser
│   ├── group-manager.js      # Main/Staging/Bin logic
│   ├── export.js             # CSV export
│   └── storage.js            # storage.local wrapper
├── background/
│   └── background.js         # Service worker (alarms, cleanup)
├── tests/
│   ├── playwright/           # E2E tests
│   └── unit/                 # Unit tests
├── icons/
│   └── icon-*.png
├── CLAUDE.md                 # This file
├── RESEARCH.md               # User's research (reference only)
├── README.md                 # Public-facing docs
└── LICENSE                   # GPLv3
```

### Core Components

#### 1. Tab Query Engine (`lib/tab-query.js`)
- Domain filtering: `domain: wikipedia.org`
- Age filtering: `age > 7d`
- Title search: `title: "search term"`
- URL pattern matching: `url: *example*`
- **TEST FIRST**: Verify browser.tabs.query() behavior on Firefox

#### 2. Group Manager (`lib/group-manager.js`)
- Three groups: Main (default), Staging, Bin
- Persist in storage.local: `{ tabId: { group, dateSwiped } }`
- Auto-delete from Bin after 2 days (background service worker + alarms API)
- **TEST FIRST**: Verify storage.local works, verify alarms API

#### 3. Query Language Parser (`lib/query-parser.js`)
- MVP: Simple regex-based parsing
- Later: Proper AST with syntax highlighting
- Error messages with helpful suggestions
- **TEST FIRST**: Write parser tests before implementing

#### 4. UI Manager (`ui/manager.html` + `manager.js`)
- List view with checkboxes
- Bulk action buttons
- Query input (will add syntax highlighting later)
- Statistics dashboard
- **TEST WITH PLAYWRIGHT**: Verify UI interactions work

## Development Workflow

### 1. Test-Driven Development
```javascript
// ALWAYS write test first
describe('TabQuery.findByAge', () => {
  it('should find tabs older than 7 days', async () => {
    // Test assumptions about browser.tabs.query()
  });
});

// Then implement
class TabQuery {
  async findByAge(days) { ... }
}
```

### 2. API Validation Priority
Test these assumptions IMMEDIATELY:
- ✅ `browser.tabs.query()` works on Firefox
- ✅ `tab.lastAccessed` exists and is accurate
- ✅ `storage.local` persists data
- ✅ `alarms` API works for background cleanup
- ✅ Full-page extension UI can access browser APIs

### 3. Commit Strategy
```bash
# Small, focused commits
git commit -m "feat: add TabQuery.findByDomain with wildcard support"
git commit -m "test: verify tab.lastAccessed property exists"
git commit -m "fix: handle tabs without favIconUrl"
```

### 4. TODO Comments in Code
Use structured TODOs liberally:
```javascript
// TODO: Add syntax highlighting to query input
// See RESEARCH.md Phase 3 for design

// TODO: Optimize for 100+ tabs - implement virtual scrolling
// Current implementation loads all tabs into DOM

// TODO: Test swipe gestures feasibility
// May not work in extension context - validate before implementing
```

## Testing Strategy

### Playwright Setup
- Test extension loading on Firefox
- Test tabs API behavior
- Test UI interactions (list view, bulk actions)
- Mock tab data for consistent tests

### Unit Tests
- TabQuery methods
- Query parser
- Group manager logic
- Export formatting

### Manual Testing Checklist
- [ ] Works with 0 tabs
- [ ] Works with 1 tab
- [ ] Works with 100+ tabs
- [ ] Handles tabs without favIconUrl
- [ ] Handles about:* pages
- [ ] Storage persists across browser restarts
- [ ] Auto-delete from Bin after 2 days

## MVP Feature List

### Phase 1: Core Functionality (THIS IS THE FOCUS)
- [ ] List all tabs in table view
- [ ] Domain filter (simple: exact match)
- [ ] Age filter (simple: older than X days)
- [ ] Assign tabs to Main/Staging/Bin groups
- [ ] Persist groups in storage.local
- [ ] Bulk close tabs
- [ ] CSV export (basic)

### Phase 2: Query Language
- [ ] Parse simple queries: `domain: X AND age > 7d`
- [ ] Syntax highlighting (basic)
- [ ] Preset queries (Ancient Tabs, Forgotten, etc.)

### Phase 3: Polish
- [ ] Auto-delete from Bin (2-day delay)
- [ ] Statistics dashboard
- [ ] Empty states
- [ ] Error handling polish

### MAYBE Later (Don't Commit Yet)
- Swipe interface (if touch events work)
- Advanced query operators (regex, OR, NOT)
- Content search (requires content scripts)

## User Feedback Integration

User said:
- "Priority is list view and Query lang"
- "Swipe UI was just a UX idea, if can't be pulled we find another way"
- "Let's find our own pace"

Translation:
- Don't get stuck on swipe UI if it's hard
- Focus on practical list view + powerful queries
- Ship something working fast, iterate from there

## Key References

### Browser APIs
- `browser.tabs.query()` - Main workhorse
- `browser.storage.local` - Persistence
- `browser.alarms` - Background cleanup
- `browser.downloads.download()` - For CSV export

### Design System
See RESEARCH.md for:
- Color palette
- Typography
- Spacing system
- Component designs

Use design system but **don't over-engineer** - MVP first!

## Questions to Resolve Early

1. ✅ Can we use Playwright to test Firefox extensions? (VALIDATE THIS)
2. ✅ Does tab.lastAccessed work reliably?
3. ✅ Can full-page extension UI use browser.tabs API?
4. ⏳ Do touch events work in extension pages? (Test when we try swipe UI)

## Anti-Patterns to Avoid

❌ **Don't**: Build all phases before testing
✅ **Do**: Build list view, test with real tabs, iterate

❌ **Don't**: Assume browser API works as documented
✅ **Do**: Write tests to verify actual behavior

❌ **Don't**: Over-engineer the query parser initially
✅ **Do**: Simple regex parsing MVP, enhance later

❌ **Don't**: Try to make it perfect before releasing
✅ **Do**: Ship MVP locally, use it daily, fix pain points

## Success Criteria

### MVP is "done" when:
- ✅ Can view all tabs in list
- ✅ Can filter by domain (exact match)
- ✅ Can filter by age (older than X days)
- ✅ Can assign tabs to groups
- ✅ Can bulk close tabs
- ✅ Groups persist across sessions
- ✅ Can export to CSV
- ✅ Works on Firefox desktop (then test mobile)

### Ready for daily use when:
- ✅ Auto-delete from Bin works
- ✅ Query language supports AND/OR
- ✅ No bugs when dealing with 100+ tabs
- ✅ Clear UX for all actions

## Browser History Integration

### Purpose
Leverage browser history to provide deeper insights, better classification, and "never lost" confidence for tab management. History adds temporal context and visit patterns that dramatically improve the user experience.

### Privacy-First Design (CRITICAL)

**Data Minimization Principle:**
- Claude (AI) must NEVER see raw history data
- All processing happens locally in the browser extension
- Store ONLY aggregated domain statistics (never raw URLs or titles)
- User derives value through local processing only

**What We Store:**
- ✅ Domain visit counts (e.g., "github.com: 150 visits")
- ✅ Time patterns (morning/afternoon/evening distribution)
- ✅ First/last visit timestamps
- ✅ Co-occurrence data (domain pairs visited together)

**What We NEVER Store:**
- ❌ Raw URLs with paths (e.g., /user/secret-project)
- ❌ Page titles
- ❌ Individual visit timestamps
- ❌ Browsing content or form data

**Privacy Controls:**
- Start disabled by default (opt-in required)
- Time range limits (7d, 30d, 90d, 1y, all)
- Domain exclusions (never analyze banking, health sites)
- Clear cache button (delete all cached data)
- K-anonymity threshold (min 3 visits before showing details)

### Platform Support

**Desktop Firefox:**
- Full history API support via `browser.history.search()` and `browser.history.getVisits()`
- All history features available

**Firefox Android:**
- ⚠️ History API NOT available (Firefox limitation)
- Fallback: Tab-event pseudo-history (tracks tabs after extension install)
- Limited but better than nothing

### Key Features

**Cross-Integration (Enrich Tabs):**
- **Prominent history badges**: Visit count, last visit, "safe to close" indicator
- **Referrer chains**: "Arrived from Google → Wikipedia"
- **Never lost assurance**: "This tab exists in history" badge
- **Better classification**: Use visit patterns to improve intent detection

**History-Only Features:**
- **Visit timeline**: Calendar heatmap of browsing activity
- **Top domains chart**: Bar chart of most-visited sites
- **Search history**: Find URLs you visited before
- **Session summaries**: Recent browsing sessions with duration
- **Co-occurrence graph**: Domains visited together

### Architecture

**Storage:**
- IndexedDB for aggregates (10x faster than storage.local)
- Database: "FiltreInfini-History"
- Stores: domainStats, coOccurrence, sessionSummaries

**Components:**
- `lib/history-settings.js` - Privacy settings manager
- `lib/history-storage.js` - IndexedDB wrapper
- `lib/history-analyzer.js` - History analysis engine
- `lib/history-enricher.js` - Tab enrichment with history context
- `ui/history-timeline.html` - History-only insights page

**Data Flow:**
1. User enables history in settings (opt-in)
2. Background worker fetches history via browser.history API
3. Analyzer aggregates by domain (privacy-safe)
4. Aggregates stored in IndexedDB (no raw data)
5. UI reads aggregates to show badges and insights
6. User sees value, AI never sees raw history

### Implementation Phases

**Phase 0: Foundation** (Week 1)
- Settings UI, IndexedDB wrapper, platform detection

**Phase 1: Basic Analysis** (Week 2)
- History analyzer, startup trigger, background re-analysis

**Phase 2: Tab Enrichment** (Week 3)
- History badges on tab cards (PROMINENT - key feature!)
- Safe-to-close indicators

**Phase 3: History Features** (Week 4)
- Timeline chart, top domains, search history
- Add "History Insights" link directly in panel

**Phase 4: Advanced Integration** (Weeks 5-6)
- Referrer chains, co-occurrence, journey detection

**Phase 5: Polish** (Week 7)
- Privacy audit, performance optimization, documentation

**Phase 6: Mobile Fallback** (Future)
- Tab-event pseudo-history for Firefox Android

### Testing Requirements

**Privacy Audit:**
- ✓ No raw URLs in IndexedDB
- ✓ K-anonymity enforced
- ✓ Domain exclusions work
- ✓ No console.log() data leaks

**Performance Benchmarks:**
- Initial analysis (100k items): <30 seconds
- Incremental updates: <5 seconds
- Tab enrichment (100 tabs): <1 second
- Timeline render: <2 seconds

**Manual Testing:**
- [ ] History analysis with 10k, 50k, 100k items
- [ ] Opt-in flow clear and functional
- [ ] Badges prominent and informative
- [ ] Settings work (time range, exclusions)
- [ ] Clear cache removes all data
- [ ] Android fallback (tab events)

### User Decisions

✅ **Default state**: Opt-in (disabled by default, requires explicit enable)
✅ **Badge style**: Prominent (key feature, not subtle)
✅ **Android support**: Yes (include tab-event fallback in Phase 6)
✅ **Search history**: Important early (include in Phase 3)
✅ **Panel integration**: Add history page link directly in panel

### Reference
See `RESEARCH_HISTORY.md` for:
- Complete API documentation
- Code examples
- Detailed architecture diagrams
- Privacy strategies
- Implementation roadmap

## License
GPLv3 - Freedom to use, modify, distribute

---

**Remember**: The goal is to scratch the user's itch with Firefox mobile's tab UX. Ship something useful fast, then make it great.
- remember never run webext ask user to reload in ff about:Debuggig
- remember never run firefox or web ext yourself, user always relads manually in about:debugging