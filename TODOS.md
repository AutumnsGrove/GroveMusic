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
