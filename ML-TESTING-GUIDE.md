# ML Classification Testing Guide

## Quick Start: Test the ML System NOW! 🚀

### Step 1: Open the Extension

Your dev instance should already be running. If not:
```bash
npm run dev
```

### Step 2: Open FiltreInfini Manager

Click on the extension icon or navigate to the manager page.

### Step 3: Open ML Debug Modal

Click the **"🤖 ML Debug"** button in the top header (next to API Test button).

### Step 4: Try the Presets!

The modal opens with example data already loaded. Try these buttons:

1. **💻 Tech Docs** - Python documentation tab
2. **🛒 Shopping** - Apple Store product page
3. **💬 Social** - Gmail inbox
4. **📰 News** - CNN news article
5. **📚 Old Reference** - Old inactive documentation
6. **🎲 Mixed Batch** - Array of 3 different tabs

### Step 5: Test Classification

After loading a preset, click one of these buttons:

- **🔬 Classify Single Tab** - Classify one tab (3D taxonomy)
- **📊 Classify Batch** - Classify multiple tabs (if you loaded "Mixed Batch")
- **🧠 Test Context Features** - See session context extraction

### Step 6: View Results

The results will show:
- **Intent** (Broder 2002): informational, navigational, transactional
- **Status** (Tabs.do 2021): to-read, to-do, reference, maybe, done
- **Content-Type** (WWW 2010): content, communication, search

Each dimension shows:
- `labels`: All possible labels
- `scores`: Confidence scores (0-1)
- `topK`: Top predictions above 30% threshold

### Step 7: Test with Your Own Data

Edit the JSON in the textarea! Try your own tabs:

```json
{
  "id": "my-test",
  "title": "Your Tab Title Here",
  "url": "https://example.com/path",
  "domain": "example.com",
  "lastUsed": 1234567890,
  "inactive": false
}
```

### Step 8: Test Batch Classification

For batch testing, use an array:

```json
[
  {
    "id": "tab1",
    "title": "First Tab",
    "url": "https://example1.com",
    "domain": "example1.com",
    "lastUsed": 1234567890,
    "inactive": false
  },
  {
    "id": "tab2",
    "title": "Second Tab",
    "url": "https://example2.com",
    "domain": "example2.com",
    "lastUsed": 1234567890,
    "inactive": false
  }
]
```

## What to Expect

### First Run (Model Download)
- ⏳ **Loading time**: 10-30 seconds
- 📥 **Download**: ~67MB model (Transformers.js DistilBERT)
- 💾 **Caching**: Model is cached in IndexedDB - subsequent loads are instant!

### After Model is Cached
- ⚡ **Classification time**: 100-500ms per tab
- 🚀 **Batch processing**: ~500ms for 10 tabs

### Domain Knowledge Hints

If your test tab's domain is in our knowledge base (~120 domains), you'll see boosted scores:
- gmail.com → communication + navigational
- github.com → content + informational
- amazon.com → content + transactional
- docs.python.org → content + informational

## Console API Testing

While testing, you can also use the console:

```javascript
// Check feedback API
feedback.help()

// Add test feedback
feedback.add(true, "ML classification is accurate!")
feedback.add(false, "Should be 'reference' not 'to-read'", "reference")

// View feedback
feedback.dump()

// Export feedback
feedback.export()

// Get stats
feedback.getStats()
```

## Understanding the Results

### Example Output:

```json
{
  "classifications": {
    "intent": {
      "labels": ["informational", "navigational", "transactional"],
      "scores": [0.85, 0.12, 0.03],
      "topK": [
        { "label": "informational", "score": 0.85 }
      ]
    },
    "status": {
      "labels": ["to-read", "to-do", "reference", "maybe", "done"],
      "scores": [0.78, 0.15, 0.05, 0.02, 0.00],
      "topK": [
        { "label": "to-read", "score": 0.78 }
      ]
    },
    "contentType": {
      "labels": ["content", "communication", "search"],
      "scores": [0.92, 0.05, 0.03],
      "topK": [
        { "label": "content", "score": 0.92 }
      ]
    }
  },
  "metadata": {
    "modelVersion": "distilbert-v1",
    "classifiedAt": 1234567890000,
    "sessionContext": {
      "totalTabs": 1,
      "coOccurringDomains": ["docs.python.org"]
    }
  }
}
```

### Interpreting Scores:

- **> 0.7** - High confidence ✅
- **0.3 - 0.7** - Medium confidence ⚠️
- **< 0.3** - Low confidence (filtered from topK) ❌

### Heuristic Boosting:

The system applies heuristics to improve accuracy:
- **Old tabs** (>7 days) → boost "reference" and "maybe"
- **Known domains** → boost based on domain knowledge
- **Inactive tabs** → boost "maybe", reduce "to-do"
- **Communication sites** → boost "communication"
- **Search engines** → boost "search" and "informational"

## Common Issues

### "Cannot find module '@xenova/transformers'"
- Make sure you ran `npm install`
- Check that `node_modules/@xenova/transformers` exists

### "Failed to load model"
- Check internet connection (first load downloads model)
- Check browser console for detailed errors
- Try clearing IndexedDB cache

### "Model taking too long to load"
- First load can take 10-30 seconds (downloading 67MB)
- Subsequent loads should be < 100ms (cached)
- Check Network tab in DevTools

### Dynamic import error
- Make sure you're testing in the extension context (not plain HTML file)
- Check that all scripts are loaded in manager.html

## Next Steps

After testing:
1. ✅ Verify classifications are accurate
2. 📝 Use feedback API to log corrections
3. 🔬 Test with your real synced tabs
4. 💡 Suggest improvements via feedback

## Debug Console

Open browser console (F12) to see detailed logs:
- `[MLClassifier] Loading model...`
- `[MLClassifier] Model loaded in Xms`
- `[Context] Session context extracted`
- `[Feedback] Added: ...`

Happy testing! 🎉
