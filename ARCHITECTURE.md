# FiltreInfini Architecture

## Metadata Storage Design

### Storage Schema

All tab metadata stored in `storage.local` with lean, efficient structure:

```javascript
// Key: "tab-{tabId}"
{
  // Group Management (existing)
  group: "main" | "staging" | "bin",
  dateSwiped: timestamp | null,

  // Page Metadata (new)
  metadata: {
    // Fetched once, cached
    fetchedAt: timestamp,
    httpCode: 200 | 404 | 500 | null,  // null = not yet fetched

    // Open Graph tags
    og: {
      title: string,
      description: string,
      image: string,
      type: string,
      siteName: string
    },

    // Standard meta tags
    meta: {
      description: string,
      keywords: string[],
      author: string,
      charset: string,
      viewport: string
    },

    // Content analysis
    content: {
      wordCount: number,
      readingTimeMinutes: number,  // Based on 200 WPM average
      hasImages: boolean,
      hasVideo: boolean,
      language: string
    }
  }
}
```

### Fetching Strategy

1. **Lazy Loading**: Only fetch metadata when:
   - User opens tab details modal
   - User explicitly requests "Refresh metadata"
   - Auto-fetch on idle (low priority background task)

2. **Content Script Injection**:
   ```javascript
   // content-metadata.js
   // Extracts OG tags, meta tags, word count
   // Sends to background script via messaging
   ```

3. **HTTP Code Detection**:
   - Check `document.readyState`
   - Listen for `error` events
   - Parse response headers if accessible
   - Fallback: mark as "unknown" if can't determine

4. **Reading Time Calculation**:
   ```javascript
   // Simple algorithm
   const text = document.body.innerText;
   const wordCount = text.split(/\s+/).length;
   const readingTime = Math.ceil(wordCount / 200); // 200 WPM
   ```

### Cache Invalidation

- **Never auto-refresh** (bandwidth conscious)
- **TTL**: None by default (metadata doesn't change)
- **Manual refresh**: Button in details modal
- **Clear on tab URL change**: `tabs.onUpdated` listener

### UI Indicators

**List View Enhancements**:
- ⚠️ Warning emoji for `httpCode !== 200`
- 🔴 Red badge for 404
- 🟡 Orange badge for 500/503
- 📖 Reading time badge: "5 min read"

**Filters**:
- "Broken Tabs" - filter for 404/500
- "Long Reads" - articles > 10 min
- "Quick Reads" - articles < 3 min

### Performance Considerations

**Batch Processing**:
- Fetch metadata for max 10 tabs at once
- Queue remaining tabs
- Throttle requests: 100ms between fetches

**Storage Limits**:
- `storage.local` quota: ~5MB
- 1000 tabs * 5KB/tab = 5MB (at limit)
- Compress metadata if needed
- Purge old metadata for closed tabs

## Groups View Architecture

### Masonry Layout

**Grid Structure**:
```
┌─────────────┬─────────────┬─────────────┐
│ Category 1  │ Category 2  │ Category 3  │
│ github.com  │ youtube.com │ medium.com  │
│ (15 tabs)   │ (8 tabs)    │ (12 tabs)   │
│             │             │             │
│ [URLs...]   │ [URLs...]   │ [URLs...]   │
└─────────────┴─────────────┴─────────────┘
```

**Card Component**:
- Header: Domain name + favicon + count
- Body: List of tab titles (truncated)
- Footer: Category badge + bulk actions
- Click to expand/collapse

**Grouping Logic**:
- Phase 1: Group by Category (1 category = 1 group)
- Phase 2: Decouple - allow custom groups
- Phase 3: Nested groups (Category > Domain)

### View Switching

**Tab Navigation**:
```
[List View] [Groups View]
```

- State persisted in UI (not storage)
- URL hash: `#list` or `#groups`
- Keyboard shortcut: `G` for groups, `L` for list

## Future: NLP & Content Analysis

**Planned Features**:
- Sentiment analysis
- Topic extraction (ML-based)
- Language detection (beyond meta tags)
- Duplicate content detection
- Summary generation

**Architecture Prep**:
- Store `content.rawText` (first 5000 chars)
- Add `content.nlp` object for future analysis
- Use Web Workers for heavy processing

---

## Code Organization

```
lib/
├── metadata-fetcher.js    # Content script injection, OG/meta extraction
├── metadata-storage.js    # Storage wrapper with caching logic
├── reading-time.js        # Reading time calculation
└── http-status.js         # HTTP code detection

content-scripts/
└── content-metadata.js    # Injected into tabs to extract metadata

ui/
├── components/
│   ├── details-modal.js   # Tab details modal
│   └── groups-view.js     # Masonry groups layout
```

## Testing Strategy

1. **Metadata Fetching**:
   - Test with 404 pages
   - Test with pages without OG tags
   - Test with PDFs (no DOM)
   - Test with `about:` pages (no access)

2. **Performance**:
   - Test with 1000 tabs
   - Measure metadata fetch time
   - Validate storage quota usage

3. **Cache**:
   - Verify metadata persists
   - Verify no duplicate fetches
   - Test manual refresh

---

**Status**: Architecture documented, ready for implementation post-commit.
