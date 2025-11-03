# Changelog

All notable changes to FiltreInfini will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-11-03

### Added
- **Firefox Sync Tab Import**: Import tabs from Firefox Sync data to work around Android limitation
  - Import button with guided extraction process
  - Parses synced-tabs JSON from Firefox desktop console
  - Visual indicators showing device name and sync date
  - Supports multiple devices simultaneously
  - Persistent storage of imported tabs
- Progressive tab discovery system for Firefox Android compatibility
- Event listeners to track tab activation, creation, and updates
- Persistent tab database in storage.local

### Fixed
- **Mobile Text Overflow**: Fixed unreadable text on mobile vertical mode - titles and domains now wrap properly instead of being cut off
- **Firefox Android Tab Discovery**: Implemented workaround for Firefox Android limitation where `browser.tabs.query()` doesn't return unloaded tabs
  - Extension now tracks tabs as you cycle through them
  - Builds persistent database of discovered tabs across sessions
  - Merges tracked tabs with currently visible tabs for complete view
  - NEW: Import from Firefox Sync data for instant access to all mobile tabs

### Documentation
- Created `ANDROID_TABS_ISSUE.md` documenting Firefox Android limitation and workarounds
- Added import guidance modal with extraction script

## [0.1.0] - 2025-01-27 (Initial Release)

### Added
- **Query Language**: Powerful filtering with domain, age, title, URL, and free-text search
  - Age operators: `>`, `>=`, `<`, `<=`, `=` with units: d (days), w (weeks), m (months), y (years)
  - Special keywords: `age=today`
  - Domain wildcards: `domain:*.github.com`
  - Combined queries: `domain:github.com age>1m claude`

- **Metadata System**:
  - Auto-fetch metadata on page load
  - Rich Open Graph data extraction (title, description, images)
  - Reading time estimation
  - HTTP status code detection
  - Thumbnail previews in list view
  - Search by description with ranking (title > description > URL)

- **Three-Tier Workflow**:
  - Main, Staging, and Bin groups
  - Bulk operations (move tabs between groups, close multiple tabs)
  - Persistent storage across sessions

- **Smart Filters**:
  - Quick filters by age (1 week, 2 weeks, 1 month, 6 months, 1+ years)
  - Category filters (Tech, Reading, Videos, Shopping, etc.)
  - Broken tab filter (4xx/5xx HTTP errors)
  - Internal tabs filter (about:, moz-extension:, etc.)

- **Mobile-First UI**:
  - Touch-optimized interface
  - Large touch targets (44px+)
  - Responsive design
  - Smooth scrolling
  - Thumbnail previews with lazy loading

- **Export & Management**:
  - CSV export functionality
  - Domain-based grouping view
  - Brand color coding for domains
  - Automatic categorization

### Technical
- Manifest V3 compatible
- Firefox 109+ desktop support
- Firefox 120+ Android support
- Runtime permission request flow
- Cross-version API compatibility
- Lazy metadata loading with cache
- Batch fetching with throttling (5 tabs/100ms)

### Developer Experience
- Unit tests with Vitest
- Linting with web-ext
- Comprehensive documentation
- Mobile testing guide
- GitHub Actions for releases

---

## Release Notes

### What is FiltreInfini?

FiltreInfini is a powerful tab management extension designed for Firefox mobile (and desktop). Born from frustration with Firefox mobile's "infinite tabs" UX, it provides:

- **Powerful queries** to find exactly what you're looking for
- **Rich metadata** to help organize documentation, articles, and resources
- **Three-tier workflow** (Main/Staging/Bin) for progressive tab management
- **Mobile-first design** with touch-optimized controls

### Installation

Download the `.xpi` file from [GitHub Releases](https://github.com/PLNech/FiltreInfini/releases) and install via `about:addons`.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

### License

GPL-3.0-or-later. See [LICENSE](LICENSE) for details.
