# FiltreInfini - Development Guide for Claude

## Project Overview
Mobile-first Firefox extension for advanced tab management. User is fed up with Firefox mobile's "infinite tabs" UX and wants powerful, configurable tab management with a Main/Staging/Bin workflow.

## Core Principles

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

## License
GPLv3 - Freedom to use, modify, distribute

---

**Remember**: The goal is to scratch the user's itch with Firefox mobile's tab UX. Ship something useful fast, then make it great.
- remember never run webext ask user to reload in ff about:Debuggig
- remember never run firefox or web ext yourself, user always relads manually in about:debugging