# GroveMusic TODOs

## Phase 0: Foundation (Current)
- [x] Set up Cloudflare project structure (wrangler.toml)
- [x] Configure D1 database with schema
- [x] Set up KV namespaces (CACHE, SESSIONS, RATE_LIMITS, CONFIG)
- [x] Create Vectorize index (grovemusic-tracks)
- [x] Set up R2 bucket (grovemusic-storage)
- [ ] Implement Google OAuth
- [x] Basic SvelteKit shell with landing page

## Phase 1: Core Pipeline
- [ ] Track Resolver Worker (MusicBrainz + Last.fm)
- [ ] Track Enricher Worker
- [ ] Candidate Generator Worker
- [ ] Similarity Scorer Worker
- [ ] Pipeline Durable Object orchestration
- [ ] Basic progress tracking

## Phase 2: LLM Integration
- [ ] LLM provider abstraction
- [ ] Claude integration
- [ ] Prompt templates for explanations
- [ ] Playlist ordering logic

## Phase 3: Frontend
- [ ] Seed track input UI (`SeedTrackInput.svelte`)
- [ ] Pipeline progress view (`PipelineProgress.svelte`)
- [ ] Playlist display (JSON + Markdown views)
- [ ] User history page
- [ ] Profile/credits page

## Phase 4: Credit System
- [ ] Credit checking/reservation logic
- [ ] Transaction logging
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
- [ ] Implement dynamic vector promotion (3+ queries → Vectorize)
- [ ] Set up cron job for background promotion
- [ ] Monitor performance and costs (~$6/month target)
- [ ] Document operational procedures
- [ ] Deploy to production

---

## Immediate Next Steps
1. ~~Run `pnpm install` to install dependencies~~ ✅
2. ~~Set up Cloudflare resources (D1, KV, R2, Vectorize)~~ ✅
3. Get Last.fm API key from https://www.last.fm/api/account/create
4. Set up Google OAuth credentials in Google Cloud Console
5. Get Anthropic API key from https://console.anthropic.com
6. Copy `secrets_template.json` to `secrets.json` and fill in values
7. Run `pnpm dev` to start local development

---

## API Keys Needed
- [ ] Last.fm API key
- [ ] Google OAuth Client ID/Secret
- [ ] Anthropic API key (for Claude)
- [ ] Cloudflare Account ID & API Token

---

*See `grovemusic-spec.md` for full specification*
*See `spotify-metadata-spec.md` for Spotify integration details*
