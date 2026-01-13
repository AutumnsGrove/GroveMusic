# Aria

**Music curation and playlist generation powered by AI**

A service that creates personalized playlists based on seed tracks, using music metadata APIs, vector similarity matching, and LLM-powered explanations. An aria is a self-contained melody — and that's exactly what we create for you.

**Domain:** [aria.grove.place](https://aria.grove.place)
**Status:** ⏸️ **On Hold** (as of January 2026)

> **Internal codename:** GroveMusic — used in code, infrastructure, and deployments

> **Follow development progress:** [autumnsgrove.com/blog](https://autumnsgrove.com/blog)

---

## Project Status

This project is currently **on hold** due to challenges in the legal and technical landscape for music metadata at scale.

**Why the pause:**
- Legal developments around large-scale music dataset availability (see `SpotifyDataset_LegalResearch_2026-01.md`)
- Gap between legal alternatives (~35M tracks) and the scale needed for the original vision (~256M tracks)
- Need to reassess approach and data sources before proceeding

**The vision lives on:**
The idea of intelligent, AI-powered music curation remains compelling and viable. Aria may return when:
- Legal music metadata sources reach sufficient scale
- Alternative approaches to audio feature extraction mature
- The legal landscape around music data becomes clearer

The codebase, architecture, and research remain here as a foundation for future exploration.

---

## Features

- **Seed-based playlist generation** - Enter a song, get a cohesive playlist that shares "musical DNA"
- **Multi-source metadata** - Combines Last.fm tags, MusicBrainz data, and vector embeddings
- **AI-powered explanations** - Each track comes with a reason why it fits your playlist
- **Smart curation** - Balances popular tracks, deep cuts, and hidden gems
- **Credit system** - Fair usage with Free, Basic, and Pro tiers

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit |
| Backend | Cloudflare Workers |
| Stateful Processing | Durable Objects |
| Database | Cloudflare D1 |
| Caching | Cloudflare KV |
| Vector Storage | Cloudflare Vectorize |
| Object Storage | Cloudflare R2 |
| Auth | Google OAuth 2.0 |

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Cloudflare account
- Last.fm API key
- Google OAuth credentials

### Setup

```bash
# Install dependencies
pnpm install

# Copy secrets template
cp secrets_template.json secrets.json
# Edit secrets.json with your API keys

# Create Cloudflare resources
wrangler d1 create grovemusic-db
wrangler kv namespace create CACHE
wrangler kv namespace create SESSIONS
wrangler kv namespace create RATE_LIMITS
wrangler kv namespace create CONFIG

# Apply database schema
wrangler d1 execute grovemusic-db --file=schema.sql

# Run locally
pnpm dev
```

### Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte components
│   │   ├── generator/  # Seed input, config, progress
│   │   ├── playlist/   # Playlist display, export
│   │   └── shared/     # Common UI components
│   ├── server/         # Backend logic
│   │   ├── api/        # API handlers
│   │   ├── pipeline/   # Pipeline workers
│   │   ├── services/   # External API clients
│   │   └── db/         # Database queries
│   └── types/          # TypeScript interfaces
└── routes/             # SvelteKit pages
```

## Pipeline Overview

```
Input → Resolve → Enrich → Generate → Score → Curate → Explain → Output
         │          │         │         │        │         │
    MusicBrainz  Last.fm   Similar   Multi-   Balance   LLM
    lookup       tags      tracks    dimension categories explanations
                           Vector    scoring
                           search
```

## Documentation

- **[grovemusic-spec.md](grovemusic-spec.md)** - Full project specification
- **[AgentUsage/](AgentUsage/)** - Development workflow guides

## License

Private - Part of the Grove ecosystem
