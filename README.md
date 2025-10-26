# FiltreInfini

**Advanced Tab Management for Firefox Mobile**

Fed up with Firefox mobile's "infinite tabs" UX? So are we.

FiltreInfini is a powerful, privacy-focused Firefox extension that gives you sophisticated control over your tab chaos.

## Features

- 🔍 **Powerful Query Language**: Filter tabs by domain, age, title, and more
- 📋 **List View**: Bulk operations on tabs with multi-select
- 🗂️ **Three-Tier Workflow**: Main → Staging → Bin (with 2-day safety net)
- 📊 **Export**: CSV export for backup and analysis
- 🔒 **Private**: All data stays on your device, no cloud services
- 📱 **Mobile-First**: Designed for Firefox Android from the ground up

## Status

🚧 **MVP in Development** - Not yet released

## Development

See [CLAUDE.md](./CLAUDE.md) for development guidelines.

### Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Load extension in Firefox
npm run dev
```

### Testing

```bash
# Run Playwright tests
npm run test:e2e

# Run unit tests
npm run test:unit
```

## Architecture

- **Manifest V3**: Future-proof extension architecture
- **Vanilla JS**: Clean, performant, showcase-quality code
- **storage.local**: All data stays on device
- **Full-page UI**: Better UX than popup for complex operations

## License

GPLv3 - See [LICENSE](./LICENSE) for details

## Contributing

This is a personal itch-scratching project, but contributions welcome once MVP is stable.

---

Built with frustration and determination. 🔥
