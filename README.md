# FiltreInfini

> Advanced tab management for Firefox mobile - powerful queries, bulk operations, and a three-tier workflow

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Firefox](https://img.shields.io/badge/Firefox-109%2B-orange)](https://www.mozilla.org/firefox/)
[![Mobile](https://img.shields.io/badge/Mobile-120%2B-green)](https://www.mozilla.org/firefox/mobile/)

## Why FiltreInfini?

Firefox mobile's "infinite tabs" are great... until you have 200 of them. FiltreInfini gives you powerful tools to:

- 🔍 **Find tabs instantly** with a domain-specific query language
- 📊 **Rich metadata** - see thumbnails, reading times, and descriptions
- 🎯 **Three-tier workflow** - Main → Staging → Bin (with auto-delete)
- ⚠️ **Detect broken tabs** - find 404s and dead links
- 📱 **Mobile-first** - designed for touch with large targets

## Installation

### From GitHub Releases (Self-Distribution)

1. **Download** the latest `.xpi` or `.zip` from [Releases](https://github.com/PLNech/FiltreInfini/releases)
2. **Open Firefox** on your device (mobile or desktop)
3. **Navigate to** `about:addons`
4. **Click** the gear icon ⚙️
5. **Select** "Install Add-on from file"
6. **Choose** the downloaded file

### From Source

```bash
git clone https://github.com/PLNech/FiltreInfini.git
cd FiltreInfini
npm install
npm run build
# Install web-ext-artifacts/filtre_infini-0.1.0.zip via about:addons
```

## Features

### Query Language

Powerful, composable filters:

```
# Find old GitHub tabs
domain:github.com age>1m

# Find forgotten documentation
age>2w reading

# Combine filters
domain:*.atlassian.net age>1w confluence
```

**Supported filters:**
- `domain:example.com` - exact or wildcard (`*.example.com`)
- `age>7d` - with operators `>`, `>=`, `<`, `<=`, `=`
- Units: `d` (days), `w` (weeks), `m` (months), `y` (years), `today`
- Free text searches title, URL, and **descriptions**

### Rich Metadata

- **Thumbnails** from Open Graph images
- **Reading time** estimates (e.g., `github.com (4min)`)
- **HTTP status** detection (404, 500, etc.)
- **Smart search** ranking (title > description > URL)
- **Auto-fetch** on load with intelligent caching

### Three-Tier Workflow

1. **Main** - Active tabs you're working with
2. **Staging** - Tabs you want to review later
3. **Bin** - Mark for deletion (auto-delete after 2 days)

Bulk operations: Select multiple tabs → Move to group or close

### Smart Filters

**By Age:**
- 1 Week+, 2 Weeks+, 1 Month+, 6 Months+, 1+ Years, 2+ Years, 3+ Years

**By Category:**
- 💻 Tech, 📚 Reading, 🎬 Videos, 🎭 Sorties, 🛒 Shopping, 💬 Social, 💼 Work

**Special:**
- ⚠️ **Broken** (4xx/5xx HTTP errors)
- 🔧 **Internal** (about:, moz-extension:, etc.)

### Mobile-First Design

- Large touch targets (44px+)
- Smooth scrolling
- Responsive layout
- Lazy loading images
- No horizontal overflow

## Development

### Prerequisites

- Node.js 20+
- Firefox 109+ (desktop) or 120+ (Android)

### Setup

```bash
# Install dependencies
npm install

# Run tests
npm run test:unit
npm run test:unit:watch  # Watch mode

# Lint
npm run lint

# Build
npm run build

# Test on desktop
npm run dev

# Test on Android (requires adb)
npm run dev:android
```

### Project Structure

```
filtre-infini/
├── manifest.json           # MV3 manifest
├── ui/                     # Full-page interface
│   ├── manager.html
│   ├── manager.js
│   └── styles/
├── lib/                    # Core logic
│   ├── tab-query.js       # Query engine
│   ├── query-parser.js    # QL parser
│   ├── group-manager.js   # Main/Staging/Bin
│   ├── metadata-*.js      # Metadata system
│   └── storage.js         # storage.local wrapper
├── background/            # Service worker
│   └── background.js      # Alarms, cleanup
├── content-scripts/       # Metadata extraction
│   └── metadata-extractor.js
└── tests/                 # Vitest + Playwright
    ├── unit/
    └── playwright/
```

### Testing

```bash
# Unit tests
npm run test:unit           # Run once
npm run test:unit:watch     # Watch mode
npm run test:unit:ui        # Visual UI

# Mobile testing guide
See MOBILE_TESTING_AND_RELEASE.md
```

## Contributing

Contributions welcome! This project was built with [Claude Code](https://claude.com/claude-code).

### Co-Authored Commits

This project uses collaborative development. All commits include:

```
🤖 Generated with Claude Code (https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Guidelines

1. Run tests: `npm run test:unit`
2. Lint: `npm run lint`
3. Follow existing code style
4. Update CHANGELOG.md
5. Add tests for new features

## Roadmap

- [x] Query language with age/domain/text filters
- [x] Metadata extraction (OG, reading time, thumbnails)
- [x] Three-tier workflow (Main/Staging/Bin)
- [x] Broken tab detection
- [x] Description search with ranking
- [ ] Faceted filters with sliders (age, reading time)
- [ ] Advanced metadata (GitHub issues, Confluence pages)
- [ ] Swipe UI (if feasible on mobile)
- [ ] Content search (full-text)

## Tech Stack

- **Vanilla JavaScript** - No frameworks
- **Manifest V3** - Future-proof
- **storage.local** - Works on Android
- **Vitest** - Unit testing
- **web-ext** - Build & dev tools

## Browser Support

- Firefox Desktop 109+
- Firefox Android 120+

## License

GPL-3.0-or-later - See [LICENSE](LICENSE)

## Credits

- **Author**: [PLNech](https://github.com/PLNech)
- **Built with**: [Claude Code](https://claude.com/claude-code)

---

**Made with ☕ and 🤖 by [PLNech](https://github.com/PLNech) & [Claude Code](https://claude.com/claude-code)**
