# GroveMusic TODOs

## Phase 0: Foundation (Current)
- [x] Set up Cloudflare project structure (wrangler.toml)
- [x] Configure D1 database with schema
- [x] Set up KV namespaces
- [ ] Create Vectorize index
- [ ] Set up R2 bucket
- [ ] Implement Google OAuth
- [ ] Basic SvelteKit shell with GroveEngine patterns

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
1. Run `pnpm install` to install dependencies
2. Set up Cloudflare account and get API credentials
3. Create D1 database: `wrangler d1 create grovemusic-db`
4. Create KV namespaces: `wrangler kv namespace create CACHE`
5. Get Last.fm API key from https://www.last.fm/api/account/create
6. Set up Google OAuth credentials in Google Cloud Console
7. Copy `secrets_template.json` to `secrets.json` and fill in values

---

## API Keys Needed
- [ ] Last.fm API key
- [ ] Google OAuth Client ID/Secret
- [ ] Anthropic API key (for Claude)
- [ ] Cloudflare Account ID & API Token

---

*See `grovemusic-spec.md` for full specification*
