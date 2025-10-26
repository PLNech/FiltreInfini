# Mobile Testing & Firefox Add-ons Release Guide

## 🧪 Testing on Mobile (NOW)

### Option 1: Direct Installation (Fastest)

1. **Build the extension:**
   ```bash
   npm run build
   ```
   This creates `web-ext-artifacts/filtre_infini-0.1.0.zip`

2. **Transfer to your phone:**
   - Upload the `.zip` file to a cloud service (Dropbox, Google Drive, etc.)
   - Or use `adb push` if connected via USB:
     ```bash
     adb push web-ext-artifacts/filtre_infini-0.1.0.zip /sdcard/Download/
     ```

3. **Install on Firefox Android:**
   - Open Firefox on your Android device
   - Go to `about:addons`
   - Tap the gear icon ⚙️
   - Select "Install Add-on from file"
   - Navigate to the `.zip` file and select it

### Option 2: web-ext Android (For Development)

```bash
# Make sure your phone is connected via USB with debugging enabled
adb devices

# Run the extension on your phone
npm run dev:android
```

**Requirements:**
- Android device with USB debugging enabled
- Firefox for Android installed
- `adb` installed on your computer

### Option 3: Firefox Nightly Collection (Best for testing)

1. Create a Firefox account at https://accounts.firefox.com/

2. Create an Add-on collection:
   - Go to https://addons.mozilla.org/
   - Sign in
   - Go to "Collections" → "Create a collection"
   - Name it something like "FiltreInfini Test"

3. Upload your extension temporarily:
   - Use web-ext to sign it:
     ```bash
     web-ext sign --api-key=YOUR_KEY --api-secret=YOUR_SECRET
     ```
   - Or manually upload to AMO for self-distribution

4. On Firefox Nightly (Android):
   - Settings → About Firefox Nightly
   - Tap logo 5 times to enable custom collection
   - Enter your collection owner ID and name
   - Restart Firefox
   - Install from your collection

## 📦 Firefox Add-ons Submission (Early Release)

### Step 1: Prepare for Submission

1. **Ensure manifest is complete:**
   ```json
   {
     "author": "Your Name",  // ← Add this
     "homepage_url": "https://github.com/yourname/filtre-infini",  // ← Add this
     "icons": {  // ← Already done
       "48": "icons/icon-48.png",
       "96": "icons/icon-96.png",
       "128": "icons/icon-128.png"
     }
   }
   ```

2. **Create icons if missing:**
   ```bash
   # Check if icons exist
   ls icons/

   # If not, create simple colored squares or use an icon generator
   ```

3. **Run linter:**
   ```bash
   npm run lint
   ```

4. **Test build:**
   ```bash
   npm run build
   ```

### Step 2: Create Developer Account

1. Go to https://addons.mozilla.org/developers/
2. Sign in with Firefox Account
3. Accept the developer agreement
4. Set up 2FA (recommended)

### Step 3: Submit Extension

1. **Go to Submit page:**
   https://addons.mozilla.org/developers/addon/submit/upload-unlisted

2. **Choose distribution:**
   - **"On this site"** (Recommended for early testing)
     - Will be reviewed by Mozilla
     - Takes 1-3 days for initial review
     - Can mark as "Experimental" for faster review
     - Available on AMO after approval

   - **"On your own"** (Self-distribution)
     - Faster (automatic signing)
     - You distribute the `.xpi` file yourself
     - No AMO listing
     - Good for testing phase

3. **Upload your `.zip` file:**
   ```bash
   npm run build
   # Upload: web-ext-artifacts/filtre_infini-0.1.0.zip
   ```

4. **Fill in metadata:**
   - **Name:** FiltreInfini
   - **Summary:** Advanced tab management for Firefox mobile - powerful queries, bulk operations, and a three-tier workflow
   - **Description:** (Expand on features)
   - **Categories:** Tabs, Productivity
   - **Tags:** tabs, mobile, productivity, organization
   - **License:** GNU GPL v3.0 or later
   - **Privacy Policy:** (Required if collecting data - we're not, so explain that)

5. **Screenshots:** (Take 3-5 screenshots)
   - Main tab list view
   - Query search in action
   - Groups view
   - Metadata modal
   - Bulk operations

6. **Support info:**
   - Support Email or URL
   - GitHub issues URL

### Step 4: Mark as Experimental (Optional - Faster Review)

- Check "This add-on is experimental"
- Helps get faster review for testing
- Users must opt-in to see experimental add-ons
- Can remove this flag later

### Step 5: Wait for Review

**For "On this site" submission:**
- Initial review: 1-3 days
- You'll get email when reviewed
- Common rejection reasons:
  - Missing privacy policy
  - Too broad permissions
  - Code obfuscation
  - Trademark issues

**For "On your own" submission:**
- Automatic signing: ~10 minutes
- Download signed `.xpi`
- Distribute however you want

### Step 6: After Approval

1. **Share the link:**
   ```
   https://addons.mozilla.org/firefox/addon/filtre-infini/
   ```

2. **Monitor reviews and feedback**

3. **Update process:**
   - Increment version in `manifest.json`
   - Build and upload new version
   - Each update gets reviewed (usually faster)

## 🧪 Testing Checklist Before Submission

### Core Functionality
- [ ] Extension loads without errors
- [ ] Tab list displays correctly
- [ ] Query language works (domain, age, text filters)
- [ ] Main/Staging/Bin groups work
- [ ] Bulk operations work
- [ ] Metadata loading works
- [ ] Permission request flow works
- [ ] Export to CSV works

### Mobile-Specific
- [ ] Touch targets are large enough (44px minimum)
- [ ] Scrolling is smooth
- [ ] No horizontal overflow
- [ ] Works in portrait and landscape
- [ ] Thumbnails load correctly
- [ ] Metadata modal is readable

### Performance
- [ ] Works with 50+ tabs
- [ ] Works with 100+ tabs
- [ ] No memory leaks
- [ ] Batch fetching doesn't freeze UI

### Edge Cases
- [ ] Works with 0 tabs
- [ ] Works with internal tabs (about:)
- [ ] Works with tabs without favicons
- [ ] Handles failed metadata gracefully
- [ ] Storage persists across restarts

## 🚀 Quick Start Commands

```bash
# Run tests
npm run test:unit           # Run unit tests
npm run test:unit:watch     # Watch mode
npm run test:unit:ui        # Visual UI for tests

# Build and test
npm run build               # Build extension
npm run lint                # Lint code
npm run dev                 # Test on desktop
npm run dev:android         # Test on mobile (via adb)

# For submission
npm run build               # Creates zip in web-ext-artifacts/
```

## 📝 Quick Manifest Updates Needed

Add these to `manifest.json` before submission:

```json
{
  "author": "Your Name",
  "homepage_url": "https://github.com/yourname/filtre-infini",
  "developer": {
    "name": "Your Name",
    "url": "https://github.com/yourname"
  }
}
```

## 🔗 Useful Links

- **AMO Developer Hub:** https://addons.mozilla.org/developers/
- **Submission Guide:** https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- **Review Policies:** https://extensionworkshop.com/documentation/publish/add-on-policies/
- **Mobile Testing:** https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/
- **web-ext docs:** https://extensionworkshop.com/documentation/develop/web-ext-command-reference/

## 💡 Tips

1. **Start with self-distribution** ("On your own") to test the signing process
2. **Mark as experimental** for faster review during testing phase
3. **Take good screenshots** - they're crucial for user adoption
4. **Write a clear privacy policy** even if simple ("We don't collect any data")
5. **Test on multiple devices** if possible (different screen sizes)
6. **Monitor the review queue** - reviews can take longer during holidays

---

**Ready to test?** Start with Option 1 (Direct Installation) - it's the fastest way to get it on your phone!

**Ready to submit?** Use self-distribution first to test the process, then submit to AMO when ready for users.
