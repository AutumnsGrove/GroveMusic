# GroveMusic TODOs

## Current Status: Phase S1 (Spotify Integration) + Phase 1 (Core Pipeline)

We're building out the Spotify metadata integration service layer while the
core pipeline services are already in place. Torrenting not yet available.

---

## Phase 0: Foundation ✅ Complete
- [x] Set up Cloudflare project structure (sst.config.ts)
- [x] Configure D1 database with schema (schema.sql)
- [x] Set up KV namespaces (CACHE, SESSIONS, RATE_LIMITS, CONFIG)
- [x] Create Vectorize index (grovemusic-tracks)
- [x] Set up R2 bucket (grovemusic-storage)
- [x] Implement Heartwood OAuth (src/lib/services/auth.ts)
- [x] Basic SvelteKit shell with landing page
- [x] TypeScript types for all data models (src/lib/types/index.ts)

## Phase 1: Core Pipeline (Services Ready, Orchestration Pending)
- [x] Last.fm service (src/lib/services/lastfm.ts)
- [x] MusicBrainz service (src/lib/services/musicbrainz.ts)
- [x] Pipeline Durable Object skeleton (workers/pipeline/)
- [x] API routes: /api/generate, /api/runs, /api/auth/*
- [ ] Wire up Track Resolver stage
- [ ] Wire up Track Enricher stage
- [ ] Wire up Candidate Generator stage
- [ ] Wire up Similarity Scorer stage
- [ ] Test end-to-end pipeline flow

## Phase 2: LLM Integration (Service Ready, Integration Pending)
- [x] LLM service with Claude support (src/lib/services/llm.ts)
- [x] Track explanation generation
- [x] Playlist ordering logic
- [ ] Prompt templates stored in KV
- [ ] Integrate into pipeline curating stage

## Phase 3: Frontend (Components Created, Wiring Pending)
- [x] Seed track input UI (SeedTrackInput.svelte)
- [x] Pipeline progress view (PipelineProgress.svelte)
- [x] Playlist display component (PlaylistView.svelte)
- [x] User credits component (UserCredits.svelte)
- [ ] User history page
- [ ] Profile/credits page

## Phase 4: Credit System
- [x] Credit types and calculations (src/lib/types/index.ts)
- [x] Credit reservation in /api/generate
- [ ] Transaction logging to D1
- [ ] Basic subscription tiers
- [ ] Stripe integration (optional)

## Phase 5: Polish & Launch
- [ ] Error handling improvements
- [ ] Rate limiting refinement
- [ ] Caching optimization
- [ ] Performance tuning
- [ ] Beta testing

---

## Spotify Metadata Integration (Post-MVP)

### Phase S0: Research & Acquisition
- [ ] Download metadata torrents from Anna's Archive
- [ ] Verify data integrity with provided checksums
- [ ] Document exact file inventory and sizes
- [ ] Set up local environment with SQLite tools
- [ ] Explore database schemas and sample data

### Phase S1: Storage Setup
- [x] Create R2 bucket for partitioned SQLite databases (SpotifyStorage in sst.config.ts)
- [x] Create D1 tables for hot data and cross-references (spotify-schema.sql)
- [x] Create SpotifyMetadataService with 4-layer caching (src/lib/services/spotify.ts)
- [x] Create promotion cron worker skeleton (workers/spotify-promotion/)
- [ ] Create Vectorize index for audio features (15M vectors)
- [ ] Partition source databases by Spotify ID prefix (3,844 partitions)
- [ ] Upload partitions to R2

### Phase S2: Cross-Reference Building
- [ ] Download MusicBrainz ISRC dump (or use API)
- [ ] Build ISRC → MBID lookup table
- [ ] Run cross-reference matching pipeline
- [ ] Analyze match rates and quality
- [ ] Store results in D1

### Phase S3: Audio Feature Integration
- [x] Implement audio feature normalization (13-dim in types/index.ts)
- [x] Implement similarity query functions (SpotifyMetadataService)
- [x] Implement co-occurrence score functions (SpotifyMetadataService)
- [ ] Generate vectors for popular tracks (popularity ≥ 30)
- [ ] Upload to Vectorize in batches
- [ ] Integrate into candidate generation pipeline

### Phase S4: Playlist Mining
- [ ] Implement co-occurrence mining algorithm
- [ ] Run on playlist dataset (48-72 hours estimated)
- [ ] Store significant pairs in D1 (PMI + Jaccard scores)
- [ ] Implement co-occurrence score function
- [ ] Integrate into similarity scoring

### Phase S5: Pipeline Integration
- [ ] Update Track Enricher to fetch Spotify features
- [ ] Update Candidate Generator with new sources
- [ ] Update Similarity Scorer with new dimensions (audio: 25%, cooccurrence: 25%)
- [ ] Adjust scoring weights based on testing
- [ ] A/B test old vs new pipeline

### Phase S6: Optimization & Launch
- [x] Implement dynamic vector promotion logic (SpotifyMetadataService.recordAccess)
- [x] Set up cron job for background promotion (workers/spotify-promotion/)
- [ ] Monitor performance and costs (~$6/month target)
- [ ] Document operational procedures
- [ ] Deploy to production

---

## Immediate Next Steps

### For Core Pipeline (can do now):
1. Wire up pipeline stages in workers/pipeline/src/index.ts
2. Test Last.fm + MusicBrainz resolution flow
3. Implement candidate generation with existing services
4. Test end-to-end playlist generation

### For Spotify Integration (blocked on torrents):
1. Download metadata torrents from Anna's Archive
2. Partition databases using scripts in spotify-metadata-spec.md
3. Upload partitions to R2: `pnpm wrangler r2 object put ...`
4. Apply schema: `pnpm wrangler d1 execute grovemusic-spotify-cache --file=spotify-schema.sql`
5. Run cross-reference matching pipeline

### API Keys Needed
- [ ] Last.fm API key - https://www.last.fm/api/account/create
- [ ] Heartwood OAuth (Grove SSO) - already configured
- [ ] Anthropic API key - https://console.anthropic.com
- [ ] Cloudflare Account ID & API Token

---

*See `grovemusic-spec.md` for full specification*
*See `spotify-metadata-spec.md` for Spotify integration details*
