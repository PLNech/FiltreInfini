# ML Model Loading Debug Guide

## Quick Status Check

### 1. Check Background Console
1. Open Firefox: `about:debugging#/runtime/this-firefox`
2. Find FiltreInfini extension
3. Click "Inspect" → Opens background console
4. Look for: `[ML Worker] Script loaded - initializing ML classification worker...`

**Expected**: This message should appear immediately when extension loads
**If missing**: ml-worker.js isn't loading - check manifest.json

### 2. Check UI Console
1. Open manager page (click extension icon)
2. Open browser console (F12)
3. Look for:
   ```
   [ModelPreloader] ✓ embeddings loaded in 3.1s
   [ModelPreloader] ✓ classification loaded in 48.3s
   ```

**Expected**: Models load successfully in UI
**Status**: ✅ Working!

### 3. Test Classification
#### Option A: Single Tab (🧠 button)
1. Click 🧠 button on any tab in list
2. Check background console for:
   ```
   [ML Worker] Loading model: classification
   [ML Worker] Importing Transformers.js from vendor...
   [ML Worker] Environment configured for local models
   [ML Worker] ✓ Transformers.js loaded
   [ML Worker] Creating pipeline...
   [ML Worker] ✓ Model loaded in 18500ms
   ```

#### Option B: ML Debug Modal
1. Click "🤖 ML Debug" button
2. Click "🔬 Classify Single Tab"
3. Should see classification results

#### Option C: Individual Model Tests
1. Click "🤖 ML Debug" button
2. Try:
   - `📊 Test Embeddings` - should work (loads in ~3s)
   - `🎯 Test Classification` - should work (loads in ~20s)
   - `🔖 Test NER` - should work (loads in ~30s)

## Current Status

### ✅ Working
- Model files downloaded (946MB in `lib/vendor/models/`)
- UI model loading (embeddings + classification)
- Popup menu shows model status
- Individual model tests in ML Debug UI

### ⚠️ Recently Fixed (Test Needed)
- Background worker classification
  - **FIXED**: Export MLClassifierWorker to `self` (Firefox background scope)
  - **FIXED**: Added safety checks before using MLClassifierWorker
  - **TEST**: Check background console for "[ML Worker] Script loaded" message
  - **TEST**: Status should show `{loading: true}` then `{ready: true}`
  - If still failing, check if "MLClassifierWorker not defined" error appears

## Common Issues

### Issue: "Error in input stream"
**Cause**: Trying to load from CDN (not local files)
**Fix**: Check `env.allowRemoteModels = false` and `env.localModelPath` is set

### Issue: "JSON.parse: unexpected end of data"
**Cause**: Model config files are empty (0 bytes)
**Fix**: Re-download with `curl -L` (follow redirects)
```bash
cd lib/vendor/models/embeddings
curl -L "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json" -o tokenizer.json
```

### Issue: "self.registration is undefined"
**Cause**: Using Service Worker API in extension background script
**Fix**: Use `browser.runtime.getURL()` instead of `self.registration.scope`

### Issue: Background worker never loads
**Possible causes**:
1. ml-worker.js has syntax error - check background console
2. Dynamic `import()` failing - check CSP settings
3. Message handlers not receiving messages - add debug logs

## Next Steps

1. **Check background console** for "[ML Worker] Script loaded" message
2. If missing, add more debug logs to ml-worker.js
3. If present, check why `getInstance()` isn't being called
4. **Set up Playwright tests** to automate this checking

## Model Files Structure

```
lib/vendor/models/
├── embeddings/           # 109MB - all-MiniLM-L6-v2
│   ├── config.json
│   ├── tokenizer.json
│   ├── tokenizer_config.json
│   ├── special_tokens_map.json
│   └── onnx/
│       ├── model.onnx              # 87MB
│       └── model_quantized.onnx    # 22MB
│
├── classification/       # 321MB - distilbert-base-uncased-mnli
│   ├── config.json
│   ├── tokenizer.json
│   ├── tokenizer_config.json
│   ├── special_tokens_map.json
│   ├── vocab.txt
│   └── onnx/
│       ├── model.onnx              # 256MB
│       └── model_quantized.onnx    # 65MB
│
└── ner/                 # 516MB - bert-base-NER
    ├── config.json
    ├── tokenizer.json
    ├── tokenizer_config.json
    ├── special_tokens_map.json
    ├── vocab.txt
    └── onnx/
        ├── model.onnx              # 418MB
        └── model_quantized.onnx    # 105MB
```

All files should have content (>0 bytes). If any are empty, re-download with curl.
