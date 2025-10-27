# Firefox Android: Tabs API Limitation

## The Problem

**Critical Issue**: `browser.tabs.query()` does NOT return unloaded/discarded tabs on Firefox Android.

This means FiltreInfini cannot see tabs that existed before the extension was installed, or tabs that have been unloaded from memory. The extension only sees tabs that are:
- Currently active/loaded in memory
- Created after the extension was installed
- Accessed/activated after the extension was installed

## Root Cause

**Mozilla Bug**: [Bug 1583281](https://bugzilla.mozilla.org/show_bug.cgi?id=1583281) - "Expose all tabs to the tabs API on Android, including discarded tabs"

- **Status**: NEW (unresolved) - Open for 6 years
- **Impact**: Blocks 5 other bugs, duplicated 6 times
- **Technical Issue**: GeckoView needs to add delegate mechanism to provide complete tab lists including discarded tabs
- **No Workarounds**: The bug report contains no documented workarounds

## Platform Behavior Difference

| Feature | Firefox Desktop | Firefox Android |
|---------|----------------|-----------------|
| `tabs.query({})` returns unloaded tabs | ✅ Yes | ❌ No |
| Can query discarded tab metadata | ✅ Yes | ❌ No |
| Tab lifecycle events fire for existing tabs | ✅ Yes | ❌ No |

## Potential Workarounds for v0.1.1

### Option 1: Progressive Discovery (RECOMMENDED)
Track tabs as users interact with them:

```javascript
// In background.js
const knownTabs = new Map();

// Track tabs as they're activated
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  knownTabs.set(tabId, {
    url: tab.url,
    title: tab.title,
    lastAccessed: Date.now()
  });
  await browser.storage.local.set({ knownTabs: Array.from(knownTabs.entries()) });
});

// Track new tabs
browser.tabs.onCreated.addListener((tab) => {
  knownTabs.set(tab.id, {
    url: tab.url,
    title: tab.title,
    lastAccessed: tab.lastAccessed || Date.now()
  });
});

// Track tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    knownTabs.set(tabId, {
      url: tab.url,
      title: tab.title,
      lastAccessed: tab.lastAccessed || knownTabs.get(tabId)?.lastAccessed || Date.now()
    });
  }
});

// Clean up closed tabs
browser.tabs.onRemoved.addListener((tabId) => {
  knownTabs.delete(tabId);
});

// On startup, restore known tabs from storage
browser.runtime.onStartup.addListener(async () => {
  const { knownTabs: stored } = await browser.storage.local.get('knownTabs');
  if (stored) {
    knownTabs.clear();
    stored.forEach(([id, data]) => knownTabs.set(id, data));
  }
});
```

**Pros:**
- Works within Firefox Android limitations
- Builds knowledge progressively
- No user friction

**Cons:**
- Only sees tabs user visits after install
- Doesn't immediately show all existing tabs
- Requires patience to build full picture

### Option 2: Onboarding Flow
Show a clear message on first run:

```
┌─────────────────────────────────────────────┐
│  Welcome to FiltreInfini!                   │
│                                             │
│  ⚠️  Firefox Android Limitation             │
│                                             │
│  Due to a Firefox Android limitation,      │
│  FiltreInfini can only see tabs that you   │
│  interact with.                            │
│                                             │
│  To populate your tab list:                │
│  1. Swipe through your tabs once           │
│  2. FiltreInfini will detect them          │
│  3. All future tabs are tracked           │
│     automatically                          │
│                                             │
│  [Learn More] [Get Started]               │
└─────────────────────────────────────────────┘
```

**Pros:**
- Sets clear expectations
- Educates users about limitation
- Provides actionable steps

**Cons:**
- Requires manual work from users
- Friction on first use
- Defeats "instant utility" value prop

### Option 3: Background Tab Pinger (EXPERIMENTAL)
Attempt to "wake up" tabs by querying them:

```javascript
// Try to discover hidden tabs by ID scanning
// WARNING: This is hacky and may not work
async function attemptTabDiscovery() {
  const discoveredTabs = [];

  // Try tab IDs from 1 to 10000 (Firefox tab IDs are sequential)
  for (let i = 1; i < 10000; i++) {
    try {
      const tab = await browser.tabs.get(i);
      discoveredTabs.push(tab);
    } catch (e) {
      // Tab doesn't exist, continue
    }
  }

  return discoveredTabs;
}
```

**Pros:**
- Could theoretically discover hidden tabs

**Cons:**
- Very slow (thousands of API calls)
- May not work (browser.tabs.get() might fail for unloaded tabs)
- Could trigger rate limiting or performance issues
- Not officially supported

### Option 4: Wait for Mozilla Fix
Monitor Bug 1583281 and implement when fixed.

**Pros:**
- Proper long-term solution

**Cons:**
- Bug is 6 years old with no timeline
- Can't rely on this

## Recommended Approach for v0.1.1

**Hybrid Solution:**

1. **Implement Progressive Discovery (Option 1)** as the core mechanism
2. **Add Onboarding Message (Option 2)** to set expectations
3. **Document limitation clearly** in README and store listing
4. **Add "Scan Status" indicator** showing:
   - Total tabs discovered so far
   - Last scan time
   - "Keep using Firefox to discover more tabs" message

## User Experience Impact

**Before (Expected):**
- Install extension
- See all 100+ existing tabs immediately
- Start filtering/organizing

**After (Reality):**
- Install extension
- See only currently active tab
- Must browse through tabs once to populate
- Extension becomes more useful over time

## Future Solutions

1. **Monitor Mozilla Bug**: Subscribe to Bug 1583281 for updates
2. **Test Firefox Nightly**: Check if newer versions fix this
3. **Explore GeckoView API**: If we ever build a custom browser wrapper
4. **Alternative Data Sources**: Could we use Firefox Sync API or sessionstore files?

## Related Resources

- [Bug 1583281](https://bugzilla.mozilla.org/show_bug.cgi?id=1583281) - Main tracking bug
- [Mozilla Discourse Discussion](https://discourse.mozilla.org/t/tabs-query-doesnt-return-unloaded-tabs-in-firefox-for-android/122188)
- [Extension Workshop - Android Differences](https://extensionworkshop.com/documentation/develop/differences-between-desktop-and-android-extensions/)

---

**Status**: Awaiting decision on which workaround(s) to implement for v0.1.1
