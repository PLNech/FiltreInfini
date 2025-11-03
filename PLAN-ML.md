# ML-Powered Tab Classification - Implementation Plan

## Overview
3D Tab Classification System using Transformers.js + context features.

## Research-Backed Taxonomy

### Dimension 1: Intent (Broder 2002)
- **Labels**: `informational`, `navigational`, `transactional`
- **Source**: Broder, A. (2002). "A taxonomy of web search." SIGIR Forum 36(2)
- **Use**: Why user opened tab

### Dimension 2: Status (Tabs.do/CMU HCI 2021)
- **Labels**: `to-read`, `to-do`, `reference`, `maybe`, `done`
- **Source**: Chang et al. (2021). "Tabs.do: Task-Centric Browser Tab Management" CHI '21
- **Use**: Lifecycle stage / action required

### Dimension 3: Content-Type (WWW 2010)
- **Labels**: `content`, `communication`, `search`
- **Source**: White & Drucker (2010). "A characterization of online browsing behavior" WWW '10
- **Use**: Activity/content classification

---

## Context Features (Phase 1 - No History)

### Tab-Level Features
```javascript
{
  title: string,
  url: string,
  domain: string,
  lastUsed: timestamp,
  inactive: boolean,
  icon: string
}
```

### Session Context (Co-occurring Tabs)
```javascript
{
  coOccurringDomains: string[],      // Other tabs in session
  domainClusters: Map<domain, count>, // Domain frequency
  sessionAge: number,                 // Age of session
  temporalPattern: {
    allRecent: boolean,               // All tabs < 1 day
    hasStaleTabs: boolean,            // Any tabs > 7 days
    ageSpread: number                 // Temporal diversity
  }
}
```

### Heuristic Boosting
1. **Temporal decay**: `lastUsed > 7 days` → boost `reference`/`maybe`
2. **Domain clustering**: High co-occurrence → similar Status/Intent
3. **Search patterns**: `google.com` + recent → likely `informational` + `to-read`
4. **Communication**: `gmail.com`, `slack.com` → `communication`
5. **Inactive flag**: `inactive=true` → lower `to-do`, boost `maybe`

---

## TODO: Phase N - History Integration

**Question**: Should we access `places.sqlite` for deeper classification?
- **Pros**: Full browsing context, temporal patterns, revisit frequency
- **Cons**: Privacy concerns, complexity, large data volume
- **Decision**: START WITHOUT, add later if needed

**Location**: `/home/<username>/.mozilla/firefox/<profile>/places.sqlite`

**SQL Queries** (for future):
```sql
-- Get recent history for domain
SELECT url, title, visit_date
FROM moz_places p
JOIN moz_historyvisits h ON p.id = h.place_id
WHERE url LIKE '%github.com%'
ORDER BY visit_date DESC
LIMIT 100;

-- Get visit frequency
SELECT url, COUNT(*) as visit_count
FROM moz_historyvisits h
JOIN moz_places p ON h.place_id = p.id
WHERE visit_date > strftime('%s', 'now', '-7 days') * 1000000
GROUP BY url
ORDER BY visit_count DESC;
```

**Signals from History**:
- Revisit frequency → `reference` vs `to-read`
- Time-of-day patterns → `work` vs `personal`
- Session clustering → related tasks
- Abandoned tabs (opened but never visited) → `maybe`

**Mark as**: `TODO-PHASE-N: History integration for richer context`

---

## Model Architecture

### Model: `Xenova/distilbert-base-uncased-mnli`
- **Size**: ~67MB (one-time download)
- **Type**: Zero-shot classification
- **Cache**: IndexedDB via Transformers.js
- **Input**: 512 tokens max (truncate: `title + url_path + domain`)

### Inference Pattern
```javascript
// Parallel classification across 3 dimensions
const [intentScores, statusScores, contentScores] = await Promise.all([
  classifier(features, ['informational', 'navigational', 'transactional']),
  classifier(features, ['to-read', 'to-do', 'reference', 'maybe', 'done']),
  classifier(features, ['content', 'communication', 'search'])
]);
```

---

## Implementation Steps

### Week 1: Core System + Tests

#### Step 1: Dependencies ✅
```bash
npm install @xenova/transformers
```

#### Step 2: Unit Tests ✅
File: `tests/unit/ml-classifier.test.js`
- Feature extraction tests
- Context feature tests
- 3D classification tests (mocked)
- Batch processing tests
- Cache logic tests
- Output format tests

#### Step 3: MLClassifier Implementation
File: `lib/ml-classifier.js`
```javascript
class MLClassifier {
  // Singleton
  static instance = null;

  // State
  model = null;
  isLoading = false;

  // Methods
  async loadModel()                    // Lazy load, cache
  async classifyTab(tab, sessionContext) // 3D classification
  async classifyBatch(tabs)            // Batch of 10
  extractFeatures(tab)                 // title + url + domain → text
  extractSessionContext(allTabs)      // Co-occurring domains, temporal
  applyHeuristics(scores, context)     // Boost scores with heuristics
  async getOrClassify(tabId)           // Cache-first
}
```

#### Step 4: Context Feature Extractor
File: `lib/context-features.js`
```javascript
class ContextFeatures {
  static extractSessionContext(tabs) {
    return {
      totalTabs: tabs.length,
      coOccurringDomains: [...],
      domainClusters: {...},
      sessionAge: ...,
      temporalPattern: {...}
    };
  }

  static calculateTemporalPattern(tabs) {
    // Analyze tab ages
  }

  static getDomainClusters(tabs) {
    // Group by domain, count
  }
}
```

#### Step 5: Storage Schema Update
File: `lib/metadata-storage.js`

Add to metadata:
```javascript
{
  mlClassifications: {
    intent: {
      labels: ['informational', 'navigational', 'transactional'],
      scores: [0.85, 0.12, 0.45],
      topK: [{label: 'informational', score: 0.85}, ...]
    },
    status: {
      labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
      scores: [0.78, 0.34, 0.15, 0.08, 0.02],
      topK: [{label: 'to-read', score: 0.78}, ...]
    },
    contentType: {
      labels: ['content', 'communication', 'search'],
      scores: [0.92, 0.15, 0.03],
      topK: [{label: 'content', score: 0.92}]
    },
    metadata: {
      modelVersion: 'distilbert-v1',
      classifiedAt: timestamp,
      sessionContext: {
        totalTabs: 10,
        coOccurringDomains: ['github.com']
      }
    }
  }
}
```

---

### Week 2: Integration + Background Processing

#### Step 6: Integrate with Metadata Manager
File: `lib/metadata-manager.js`

After fetching metadata:
```javascript
async fetchMetadata(tabId) {
  // ... existing fetch ...

  // Trigger ML classification
  const allTabs = await getAllTabs();
  const sessionContext = ContextFeatures.extractSessionContext(allTabs);
  await mlClassifier.classifyAndCache(tabId, metadata, sessionContext);
}
```

#### Step 7: Background Worker (Optional for v0.2.0)
File: `workers/ml-worker.js`
```javascript
// Offload classification to Web Worker
self.onmessage = async (event) => {
  const { tabs, sessionContext } = event.data;
  const results = await mlClassifier.classifyBatch(tabs);
  self.postMessage(results);
};
```

#### Step 8: Batch Processing Pipeline
File: `lib/ml-pipeline.js`
```javascript
class MLPipeline {
  async classifyAllTabs(tabs) {
    const sessionContext = ContextFeatures.extractSessionContext(tabs);

    // Process in batches of 10
    for (let i = 0; i < tabs.length; i += 10) {
      const batch = tabs.slice(i, i + 10);
      await mlClassifier.classifyBatch(batch, sessionContext);
      await sleep(200); // Throttle
    }
  }
}
```

---

### Week 3: Feedback System + UI

#### Step 9: Feedback Manager
File: `lib/feedback-manager.js`
```javascript
const FeedbackManager = {
  feedbacks: [],

  add(tabId, isPositive, message, suggestedCategory = null) {
    const feedback = {
      tabId,
      isPositive,
      message,
      suggestedCategory,
      timestamp: Date.now(),
      tab: {...}  // Store tab snapshot
    };

    this.feedbacks.push(feedback);
    Storage.set('ml_feedbacks', this.feedbacks);
  },

  dump() {
    console.table(this.feedbacks);
    return this.feedbacks;
  },

  export() {
    const json = JSON.stringify(this.feedbacks, null, 2);
    // Download as JSON
  }
};

// Global console API
window.feedback = FeedbackManager;
```

Usage:
```javascript
// In browser console
feedback.add(true, "Perfect tech + work classification!")
feedback.add(false, "Should be reference not to-read", "reference")
feedback.dump()  // → Pretty table
feedback.export() // → Download JSON
```

#### Step 10: Update Categorizer
File: `lib/categorizer.js`
```javascript
categorizeTab(tab) {
  // Hybrid: ML if available, rule-based fallback
  if (tab.mlClassifications) {
    return {
      intent: tab.mlClassifications.intent.topK[0].label,
      status: tab.mlClassifications.status.topK[0].label,
      contentType: tab.mlClassifications.contentType.topK[0].label,
      source: 'ml'
    };
  }

  // Fallback to rule-based
  return this.ruleBased(tab);
}
```

#### Step 11: UI - Show ML Classifications
File: `ui/manager.js`

In tab item:
```javascript
// Show ML categories with confidence
if (tab.mlClassifications) {
  const mlBadge = document.createElement('div');
  mlBadge.className = 'ml-classifications';

  const intent = tab.mlClassifications.intent.topK[0];
  const status = tab.mlClassifications.status.topK[0];

  mlBadge.innerHTML = `
    <span class="ml-badge" title="${intent.score.toFixed(2)}">
      ${intent.label}
    </span>
    <span class="ml-badge" title="${status.score.toFixed(2)}">
      ${status.label}
    </span>
  `;
}
```

#### Step 12: UI - Feedback Buttons
```javascript
// Add feedback button to tab item
const feedbackBtn = document.createElement('button');
feedbackBtn.className = 'feedback-btn';
feedbackBtn.textContent = '👍/👎';
feedbackBtn.addEventListener('click', () => {
  showFeedbackModal(tab);
});
```

---

### Week 4: Phase 7 - Image Analysis (Future)

#### TODO: Vision Transformer for og:image
```javascript
import { pipeline } from '@xenova/transformers';

const imageClassifier = await pipeline(
  'zero-shot-image-classification',
  'Xenova/clip-vit-base-patch32'
);

// Classify thumbnail
const result = await imageClassifier(ogImageUrl, candidateLabels);

// Ensemble scoring
const finalScore = (textScore * 0.7) + (imageScore * 0.3);
```

---

## Performance Targets

- **Model size**: 67MB (cached in IndexedDB)
- **First load**: <3s (model download + init)
- **Subsequent loads**: <100ms (cached)
- **Batch latency**: <500ms for 10 tabs
- **Cache hit rate**: 90%+ after initial classification
- **Threshold**: Include label if `score > 0.3`

---

## Testing Strategy

### Unit Tests
- ✅ Feature extraction
- ✅ Context features (session, temporal)
- ✅ 3D classification (mocked)
- ✅ Batch processing
- ✅ Cache logic
- ✅ Output format

### Integration Tests
- [ ] End-to-end classification pipeline
- [ ] Cache hits/misses
- [ ] Background processing
- [ ] Feedback system

### Manual Testing
- [ ] Real tabs with various content types
- [ ] Compare ML vs rule-based accuracy
- [ ] Performance with 1000+ tabs
- [ ] Model load time

---

## Release Plan

### v0.2.0: ML Beta
- ✅ Core MLClassifier
- ✅ 3D taxonomy
- ✅ Session context features
- ✅ Feedback system
- ✅ UI integration
- ⏳ Background processing
- ⏳ Batch pipeline

### v0.3.0: ML Polish
- Image analysis (Phase 7)
- Improved heuristics
- User-defined categories
- Feedback-driven improvements

### v0.4.0: History Integration (Maybe)
- Access `places.sqlite`
- Revisit frequency signals
- Temporal patterns
- Session clustering

---

## References

1. **Broder Intent Taxonomy**: https://dl.acm.org/doi/10.1145/792550.792552
2. **Tabs.do (CMU HCI 2021)**: https://dl.acm.org/doi/10.1145/3472749.3474777
3. **CCS Content Types**: https://dl.acm.org/doi/10.1145/1772690.1772748
4. **Transformers.js**: https://huggingface.co/docs/transformers.js
5. **DistilBERT Model**: https://huggingface.co/Xenova/distilbert-base-uncased-mnli

---

## Open Questions

1. **History Access**: Wait for user request or proactive?
   - **Decision**: START WITHOUT, mark as TODO-PHASE-N

2. **Privacy**: Store classifications locally or allow export?
   - **Decision**: Local-only, optional export for debugging

3. **Category Customization**: User-defined categories?
   - **Decision**: v0.3.0 feature

4. **Model Updates**: How to handle new model versions?
   - **Decision**: Version in metadata, migrate on update

---

## File Structure

```
lib/
├── ml-classifier.js          # Core ML classification
├── context-features.js       # Session/temporal features
├── ml-pipeline.js            # Batch processing
├── feedback-manager.js       # User feedback system
└── metadata-storage.js       # Updated schema

tests/unit/
├── ml-classifier.test.js     # Unit tests
└── context-features.test.js  # Context extraction tests

workers/
└── ml-worker.js              # Background processing (optional)

ui/
└── manager.js                # UI integration
```

---

## Current Status (Updated 2025-11-03)

### ✅ Completed (v0.2.0-alpha)

- [x] **Dependencies**: @xenova/transformers installed, loaded via CDN
- [x] **Unit tests**: 75 tests passing (ml-classifier, context-features, sync-parser, query-parser)
- [x] **MLClassifier**: Full 3D classification with DistilBERT (~67MB model)
  - classifyTab(), classifyBatch(), classifyAllTabs()
  - Cache-first strategy (24h TTL)
  - Batch processing (10 tabs, 200ms throttle)
- [x] **Context features**: Session extraction + heuristic boosting
  - extractSessionContext(), applyHeuristics()
  - Temporal patterns, domain clustering
- [x] **Domain knowledge**: 130+ curated domains with category hints
- [x] **Feedback system**: Console API (window.feedback)
- [x] **ML Debug UI**: Modal with presets, live testing

### 🚧 In Progress (v0.2.0-beta)

- [ ] **Two-pass classification**: Context-aware refinement (see below)
- [ ] **Integration**: Auto-classify after metadata fetch
- [ ] **UI badges**: Show ML classifications in tab list
- [ ] **Classify All button**: Bulk classification trigger

### 📋 Pending (v0.3.0+)

- [ ] Background worker for offloading
- [ ] User-defined categories
- [ ] Feedback-driven improvements
- [ ] Phase 7: Image analysis (CLIP)
- [ ] Phase N: History integration (places.sqlite)

---

## Two-Pass Classification Strategy (v0.2.0-beta)

### Overview
Improve accuracy by learning from initial classifications and refining uncertain predictions.

### Pass 1: Build Classification Distribution Map
```javascript
// Classify all tabs with base context
const pass1Results = await classifyAllTabs(tabs, baseContext);

// Extract learned patterns
const patterns = {
  domainPatterns: {
    'github.com': { intent: 'informational', confidence: 0.85 },
    'amazon.com': { intent: 'transactional', confidence: 0.90 }
  },
  temporalPatterns: {
    'old': { status: 'reference', confidence: 0.70 },
    'recent': { status: 'to-read', confidence: 0.65 }
  },
  globalDistribution: {
    intent: { informational: 0.55, navigational: 0.30, transactional: 0.15 },
    status: { 'to-read': 0.40, reference: 0.25, ... }
  },
  uncertainTabs: [/* tabs with maxScore < 0.5 */]
};
```

### Pass 2: Context-Aware Refinement
```javascript
// Re-classify uncertain tabs with enriched context
const enrichedContext = {
  ...baseContext,
  learnedPatterns: patterns
};

for (const tab of uncertainTabs) {
  // Heuristics now use similar tabs' results
  const refined = await classifyTab(tab, enrichedContext);
  // Expected: Higher confidence, better accuracy
}
```

### Implementation Details

**extractClassificationPatterns(results)**
- Input: Pass 1 classification results
- Output: Learned patterns object
- Extracts domain→category mappings with confidence
- Groups by temporal patterns (old, recent, stale)
- Calculates global distribution across dimensions

**classifyAllTabsTwoPass(tabs, options)**
- Options: { confidenceThreshold: 0.5, enablePass2: true }
- Pass 1: Classify all tabs, collect results
- Extract patterns from Pass 1
- Pass 2: Re-classify tabs below threshold
- Progress callback: `{ pass: 1|2, processed, total }`

**applyHeuristics() enhancement**
- New parameter: `learnedPatterns`
- Priority: Learned patterns > Domain knowledge > Static heuristics
- Boost based on similar domain/temporal patterns

### Performance Targets

- **Pass 1**: Same as single-pass (~500ms per 10 tabs)
- **Pass 2**: Only uncertain tabs (~10-20% of total)
- **Total overhead**: < 30% vs single-pass
- **Accuracy improvement**: +15-25% on uncertain tabs

---

**Next**: Implement two-pass methods in ml-classifier.js
