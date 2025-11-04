# Domain Ontology - 1M+ Categorized Domains

## Overview
The extension fetches a categorized list of 1M+ domains from GitHub releases to provide rich insights into browsing habits. Built from professional sources including DMOZ (1.5M human-curated domains), Tranco Top 1M, FortiGuard taxonomy (95 categories), and IAB Content Taxonomy (350+ categories).

Categories include: gaming, adult, productivity, learning, entertainment, finance, health, sports, travel, business, arts, shopping, science, reference, and more.

## Architecture
- **Fetch once**: Extension downloads JSON from GitHub releases on first run
- **Cache locally**: Stored in `browser.storage.local` for 7 days
- **Fallback**: 50+ most popular sites embedded for offline use
- **Auto-update**: Checks for new version weekly

## Hosting
File hosted at: `https://github.com/PLNech/FiltreInfini/releases/latest/download/domains-1m.json`

## JSON Format
```json
{
  "version": "2025.01.04",
  "updated": "2025-01-04T00:00:00Z",
  "count": 1001938,
  "sources": ["DMOZ", "Tranco", "UT1", "Moz", "Manual"],
  "categories": {
    "steam.com": "gaming",
    "github.com": "tech",
    "pornhub.com": "adult",
    "notion.so": "productivity",
    "coursera.org": "learning",
    "netflix.com": "entertainment",
    "paypal.com": "finance",
    "webmd.com": "health",
    "espn.com": "sports",
    "booking.com": "travel",
    ...1M+ more
  }
}
```

## Categories (22 active)
- **business** (223k): Corporate sites, B2B services, professional services
- **blog** (130k): Medium, Substack, personal blogs
- **arts** (116k): Museums, galleries, creative arts, design
- **shopping** (89k): Amazon, eBay, e-commerce
- **tech** (83k): GitHub, Stack Overflow, developer tools
- **entertainment** (78k): Netflix, Spotify, Hulu, streaming
- **sports** (57k): ESPN, NFL, NBA, sports news
- **science** (41k): Research, academia, scientific publications
- **health** (39k): WebMD, health clinics, medical info
- **reference** (29k): Wikipedia, dictionaries, encyclopedias
- **gaming** (27k): Steam, Epic Games, Twitch, IGN, Roblox
- **adult** (27k): Adult content sites (comprehensive coverage)
- **news** (24k): CNN, BBC, NYT, journalism
- **social** (915): Twitter, Reddit, Facebook, Instagram
- **family** (168): Family-friendly content, parenting
- **home** (48): Home improvement, real estate
- **learning** (30): Coursera, Udemy, Khan Academy, MOOCs
- **travel** (20): Booking.com, Airbnb, travel planning
- **video** (16): YouTube, Vimeo, video hosting
- **productivity** (5): Notion, Trello, Asana, Slack
- **finance** (4): PayPal, banking, crypto
- **other**: Everything else not categorized

## Generating the Dataset

### Data Sources

1. **Tranco Top 100k** (https://tranco-list.eu/)
   ```bash
   curl -o tranco.csv https://tranco-list.eu/top-1m.csv.zip
   unzip tranco.csv.zip
   head -n 100000 top-1m.csv > tranco-100k.csv
   ```

2. **UT1 Blacklist** (http://dsi.ut-capitole.fr/blacklists/)
   - Download categorized lists
   - Categories: adult, gambling, games, social_networks, shopping, etc.

3. **Cloudflare Radar** (https://radar.cloudflare.com/domains)
   - Top domains by category

### Blending with AI

Use Claude (or GPT) to merge datasets:

```
I have three datasets:
1. Tranco top 100k domains (no categories)
2. UT1 blacklist with categories for ~50k domains
3. Cloudflare Radar top sites with categories

Please create a JSON file with 100,000 domains categorized as:
gaming, adult, productivity, learning, entertainment, finance, health,
sports, travel, tech, blog, social, shopping, news, video, other

Format:
{
  "version": "2025.01.04",
  "count": 100000,
  "categories": {
    "domain.com": "category",
    ...
  }
}

Use UT1 categories where available, infer from domain names otherwise.
For ambiguous sites, use "other".
```

### Manual Curation

Top 500 sites should be manually verified:
- Gaming: steam.com, epicgames.com, roblox.com, etc.
- Adult: (check UT1 adult category)
- Productivity: notion.so, trello.com, asana.com
- Learning: coursera.org, udemy.com, khanacademy.org

### Publishing

1. Generate `domains-100k.json`
2. Create GitHub release:
   ```bash
   git tag -a v1.0.0 -m "Initial ontology v1.0.0"
   git push origin v1.0.0
   ```
3. Upload `domains-100k.json` to release assets
4. Extension will fetch from:
   `https://github.com/PLNech/FiltreInfini/releases/latest/download/domains-100k.json`

### Updating

1. Regenerate dataset quarterly
2. Increment version (e.g., `2025.04.01`)
3. Create new release
4. Extension auto-updates within 7 days

## Privacy
- **No tracking**: Extension never reports back which domains you visit
- **Local storage**: All data cached locally
- **Optional**: Can be disabled in settings
- **Fallback**: Works offline with embedded 50-site list

## File Size
- **Uncompressed**: ~2-3MB (100k domains)
- **Gzipped**: ~500KB (GitHub auto-serves gzipped)
- **Cache**: Stored in browser.storage.local (unlimited on desktop)

## Performance
- **First load**: ~1-2 seconds to fetch and cache
- **Cached**: Instant lookup
- **Memory**: ~10MB in memory (100k domains)

## Maintenance
- Update quarterly with new Tranco top 100k
- Add new popular sites manually
- Community contributions welcome!
