# GroveMusic - Project Specification

**Version:** 1.0.0  
**Last Updated:** December 2025
**Domain:** music.grove.place  
**Status:** Planning Phase
**Author:** Autumn Brown, Claude, Grove.place team

---

## Executive Summary

GroveMusic is a music curation and playlist generation service that creates personalized playlists based on seed tracks. Using a combination of music metadata APIs, vector similarity matching, and LLM-powered explanations, GroveMusic analyzes a user's input track and generates cohesive playlists that share "musical DNA" with the seed.

The service is part of the Grove ecosystem and will be hosted as a subdomain of grove.place, leveraging the existing GroveEngine infrastructure built on Cloudflare.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Data Models](#data-models)
4. [External API Integrations](#external-api-integrations)
5. [Pipeline Flow](#pipeline-flow)
6. [Credit System](#credit-system)
7. [Authentication & Authorization](#authentication--authorization)
8. [Caching Strategy](#caching-strategy)
9. [Rate Limiting](#rate-limiting)
10. [Frontend Specification](#frontend-specification)
11. [Database Schema](#database-schema)
12. [API Endpoints](#api-endpoints)
13. [Future Considerations](#future-considerations)
14. [Development Phases](#development-phases)

---

## Architecture Overview

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit | UI/UX, SSR where needed |
| **Backend Framework** | GroveEngine | Multi-tenant infrastructure |
| **Compute** | Cloudflare Workers | API handlers, orchestration |
| **Stateful Processing** | Durable Objects | Pipeline execution, session state |
| **Relational Data** | Cloudflare D1 | Users, runs, playlists, credits |
| **Caching** | Cloudflare KV | API response caching, session data |
| **Vector Storage** | Cloudflare Vectorize | Track similarity comparisons |
| **Object Storage** | Cloudflare R2 | Long-term result storage, exports |
| **Auth** | Google OAuth 2.0 | User authentication |

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         music.grove.place                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │   SvelteKit  │───▶│   Worker     │───▶│    Durable Object        │  │
│  │   Frontend   │    │   Router     │    │    (Pipeline Runner)     │  │
│  └──────────────┘    └──────────────┘    └────────────┬─────────────┘  │
│                                                        │                 │
│                           ┌────────────────────────────┼────────────┐   │
│                           │                            │            │   │
│                           ▼                            ▼            ▼   │
│                    ┌────────────┐              ┌─────────┐    ┌─────┐  │
│                    │  Vectorize │              │   D1    │    │ KV  │  │
│                    │  (Tracks)  │              │ (Data)  │    │Cache│  │
│                    └────────────┘              └─────────┘    └─────┘  │
│                                                      │                  │
│                                                      ▼                  │
│                                                 ┌─────────┐            │
│                                                 │   R2    │            │
│                                                 │(Archive)│            │
│                                                 └─────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             ┌───────────┐   ┌───────────┐   ┌───────────┐
             │  Last.fm  │   │MusicBrainz│   │  LLM API  │
             │    API    │   │    API    │   │ (Claude)  │
             └───────────┘   └───────────┘   └───────────┘
```

---

## Core Components

### 1. Pipeline Durable Object (`MusicPipelineDO`)

The central processing unit that orchestrates playlist generation. Each pipeline run executes within a single Durable Object instance, maintaining state throughout the multi-step process.

**Responsibilities:**
- Receive and validate seed track input
- Orchestrate API calls to external services
- Manage pipeline state and progress
- Handle retries and error recovery
- Store intermediate results
- Emit progress events to client

**State Management:**
```typescript
interface PipelineState {
  runId: string;
  userId: string;
  status: 'pending' | 'resolving' | 'enriching' | 'generating' | 'explaining' | 'complete' | 'failed';
  seedTrack: SeedTrackInput;
  resolvedTrack: ResolvedTrack | null;
  candidatePool: CandidateTrack[];
  scoredCandidates: ScoredTrack[];
  finalPlaylist: PlaylistTrack[];
  progress: number; // 0-100
  error: PipelineError | null;
  startedAt: number;
  completedAt: number | null;
}
```

### 2. Track Resolver Worker (`track-resolver`)

Handles the initial lookup and resolution of seed track input to canonical track data.

**Flow:**
1. Parse user input (text search)
2. Query MusicBrainz for track identification
3. Query Last.fm for additional metadata
4. Return unified track object or disambiguation options

### 3. Track Enricher Worker (`track-enricher`)

Enriches resolved tracks with additional metadata needed for similarity matching.

**Data Sources:**
- Last.fm tags and similar tracks
- MusicBrainz relationships and credits
- (Future) Spotify audio features

### 4. Candidate Generator Worker (`candidate-generator`)

Generates a pool of potential playlist tracks based on the enriched seed track.

**Strategies:**
- Last.fm similar tracks API
- Last.fm similar artists → top tracks
- Tag-based discovery
- Vector similarity search (Vectorize)

### 5. Similarity Scorer Worker (`similarity-scorer`)

Scores candidate tracks against the seed track across multiple dimensions.

**Scoring Dimensions:**
- Tag overlap (genre, mood, era)
- Artist relationship (same artist, similar artist, collaborator)
- Temporal proximity (release year)
- Vector similarity (if embeddings exist)
- Popularity balance (ensuring mix of known/unknown)

### 6. LLM Curator Worker (`llm-curator`)

Uses LLM to provide human-readable explanations and final curation.

**Responsibilities:**
- Generate "reason" field for each track
- Suggest playlist flow/ordering
- Identify any tracks that don't fit
- Create overall playlist narrative

**Provider Abstraction:**
```typescript
interface LLMProvider {
  name: 'claude' | 'deepseek' | 'kimi';
  generateExplanations(context: CurationContext): Promise<TrackExplanation[]>;
  suggestOrdering(tracks: ScoredTrack[]): Promise<OrderedTrack[]>;
}
```

### 7. Vector Index (Cloudflare Vectorize)

Stores track embeddings for similarity search.

**Index Configuration:**
- **Name:** `grovemusic-tracks`
- **Dimensions:** 1536 (compatible with common embedding models)
- **Metric:** Cosine similarity

**Embedding Strategy:**
- Generate embeddings from combined track metadata (tags, description, artist info)
- Store with track identifiers as metadata
- Query for K-nearest neighbors during candidate generation

---

## Data Models

### Core Types

```typescript
// Input from user
interface SeedTrackInput {
  query: string;           // "Song Name by Artist"
  playlistSize: number;    // 15-100, default 15
  preferences?: {
    eraRange?: [number, number];  // [1990, 2024]
    moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
    popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
  };
}

// After resolution
interface ResolvedTrack {
  mbid: string;            // MusicBrainz ID
  title: string;
  artist: string;
  artistMbid: string;
  album?: string;
  albumMbid?: string;
  releaseYear?: number;
  duration?: number;       // milliseconds
  lastfmUrl?: string;
  // Future: spotifyId, spotifyFeatures
}

// Enriched with metadata
interface EnrichedTrack extends ResolvedTrack {
  tags: Tag[];             // [{name: 'neo-soul', count: 100}, ...]
  similarTracks: string[]; // MBIDs from Last.fm
  similarArtists: string[];
  topListeners?: number;
  playcount?: number;
}

// Scored candidate
interface ScoredTrack extends EnrichedTrack {
  scores: {
    tagOverlap: number;      // 0-1
    artistSimilarity: number; // 0-1
    temporalProximity: number; // 0-1
    vectorSimilarity: number; // 0-1
    popularityFit: number;    // 0-1
    overall: number;          // 0-10 weighted composite
  };
  category: 'popular' | 'deep-cut' | 'hidden-gem';
}

// Final playlist track
interface PlaylistTrack extends ScoredTrack {
  position: number;
  reason: string;           // LLM-generated explanation
  flowRole: 'opener' | 'builder' | 'peak' | 'valley' | 'closer' | 'transition';
  similarityScore: number;  // 1-10 for user display
}

// Complete run result
interface PlaylistRun {
  id: string;
  userId: string;
  seedTrack: ResolvedTrack;
  playlist: PlaylistTrack[];
  config: SeedTrackInput;
  creditsUsed: number;
  createdAt: Date;
  processingTimeMs: number;
  cached: boolean;
}
```

### Tag Type

```typescript
interface Tag {
  name: string;
  count: number;        // Frequency/weight from source
  source: 'lastfm' | 'musicbrainz' | 'user';
}
```

---

## External API Integrations

### Last.fm API

**Base URL:** `https://ws.audioscrobbler.com/2.0/`

**Required Endpoints:**

| Endpoint | Purpose | Cache Duration |
|----------|---------|----------------|
| `track.search` | Find tracks by name | 24 hours |
| `track.getInfo` | Track metadata, tags | 24 hours |
| `track.getSimilar` | Similar tracks | 7 days |
| `artist.getInfo` | Artist metadata | 24 hours |
| `artist.getSimilar` | Similar artists | 7 days |
| `artist.getTopTracks` | Artist's top tracks | 24 hours |
| `tag.getTopTracks` | Tracks by tag | 24 hours |

**Rate Limits:** 5 requests/second (with API key)

**Implementation Notes:**
- All responses should be cached in KV
- Use API key authentication
- Handle 429 responses with exponential backoff

### MusicBrainz API

**Base URL:** `https://musicbrainz.org/ws/2/`

**Required Endpoints:**

| Endpoint | Purpose | Cache Duration |
|----------|---------|----------------|
| `recording` | Track lookup by MBID | 30 days |
| `recording?query=` | Track search | 24 hours |
| `artist` | Artist metadata | 30 days |
| `release` | Album metadata | 30 days |

**Rate Limits:** 1 request/second (be respectful!)

**Implementation Notes:**
- MUST include User-Agent header: `GroveMusic/1.0 (music.grove.place)`
- Implement request queue to enforce rate limit
- Cache aggressively—MB data rarely changes

### Spotify API (Future - Research Required)

**Status:** 🔬 Needs Research

**Potential Uses:**
- Audio features (tempo, energy, valence, danceability)
- Preview URLs for playback
- Playlist export

**Research Questions:**
- What tier of API access is needed?
- OAuth flow requirements for user features
- Rate limits and quotas
- Terms of service for commercial use

**Placeholder Interface:**
```typescript
interface SpotifyIntegration {
  // To be defined after research
  getAudioFeatures(trackId: string): Promise<AudioFeatures | null>;
  searchTrack(query: string): Promise<SpotifyTrack[]>;
  exportPlaylist(userId: string, tracks: PlaylistTrack[]): Promise<string>; // playlist URL
}
```

### LLM Provider APIs

**Primary (Development):** Claude (Anthropic)
**Future Options:** Deepseek, Kimi K2

**Abstraction Layer:**
```typescript
interface LLMConfig {
  provider: 'claude' | 'deepseek' | 'kimi';
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

interface LLMService {
  config: LLMConfig;
  
  generateTrackExplanations(
    seedTrack: EnrichedTrack,
    candidates: ScoredTrack[]
  ): Promise<Map<string, string>>; // mbid -> explanation
  
  suggestPlaylistOrder(
    tracks: ScoredTrack[]
  ): Promise<string[]>; // ordered mbids
  
  generatePlaylistNarrative(
    seedTrack: EnrichedTrack,
    playlist: PlaylistTrack[]
  ): Promise<string>;
}
```

**Prompt Templates:**
Store in KV or D1 for easy iteration:
- `prompt:track-explanation`
- `prompt:playlist-ordering`
- `prompt:playlist-narrative`

---

## Pipeline Flow

### Stage Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE EXECUTION FLOW                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1] INPUT          [2] RESOLVE        [3] ENRICH        [4] GENERATE   │
│  ─────────────────────────────────────────────────────────────────────  │
│  User submits  ───▶ Parse query   ───▶ Fetch tags   ───▶ Query          │
│  seed track         MusicBrainz        Last.fm           similar        │
│  + config           lookup             metadata          tracks API     │
│                                                          Vector search  │
│                                                                          │
│  [5] SCORE          [6] CURATE         [7] EXPLAIN       [8] OUTPUT     │
│  ─────────────────────────────────────────────────────────────────────  │
│  Multi-dimension ─▶ Balance       ───▶ LLM generates ──▶ Format JSON   │
│  similarity         categories         explanations      Format MD      │
│  scoring            Select final       Order tracks      Store results  │
│                     N tracks                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Detailed Stage Specifications

#### Stage 1: Input Validation
- Validate query is non-empty
- Validate playlist size (15-100)
- Check user has sufficient credits
- Reserve credits (deduct pending)

#### Stage 2: Track Resolution
- Parse "Song by Artist" or "Artist - Song" formats
- Query MusicBrainz with parsed components
- If ambiguous, return disambiguation options to user
- Store resolved track with MBID

#### Stage 3: Track Enrichment
- Parallel fetch:
  - Last.fm `track.getInfo` (tags, playcount)
  - Last.fm `track.getSimilar` (similar tracks)
  - Last.fm `artist.getSimilar` (similar artists)
  - MusicBrainz relationships (if needed)
- Merge into EnrichedTrack

#### Stage 4: Candidate Generation
- **Strategy 1:** Last.fm similar tracks (direct)
- **Strategy 2:** Similar artists → their top tracks
- **Strategy 3:** Top tags → tracks with those tags
- **Strategy 4:** Vectorize KNN search (if embeddings exist)
- Deduplicate by MBID
- Target: 3-5x desired playlist size in candidates

#### Stage 5: Similarity Scoring
- For each candidate, compute:
  - `tagOverlap`: Jaccard similarity of tag sets
  - `artistSimilarity`: 1.0 if same artist, 0.8 if in similar artists, else 0
  - `temporalProximity`: Gaussian decay from seed year
  - `vectorSimilarity`: Cosine sim if embeddings exist, else 0.5
  - `popularityFit`: Based on playcount percentile
- Compute weighted overall score

#### Stage 6: Curation & Selection
- Sort by overall score
- Apply category quotas:
  - 35% from top popularity tier ("popular")
  - 50% from mid-tier ("deep-cuts")
  - 15% from low popularity ("hidden-gems")
- Select top N tracks meeting quota distribution
- Remove any tracks that are too similar to each other

#### Stage 7: LLM Explanation
- Batch tracks to LLM with seed track context
- Request:
  - 2-3 sentence explanation per track
  - Suggested flow role (opener, builder, etc.)
  - Overall playlist narrative
- Parse and attach to tracks

#### Stage 8: Output Generation
- Generate JSON output with full data
- Generate Markdown output for display
- Store run in D1
- Archive full result to R2
- Finalize credit deduction
- Return to client

### Error Handling

| Error Type | Handling Strategy |
|------------|-------------------|
| Track not found | Return disambiguation options or "not found" |
| External API timeout | Retry with backoff (3 attempts) |
| External API rate limit | Queue and retry after delay |
| LLM failure | Fall back to template-based explanations |
| Insufficient candidates | Lower playlist size, notify user |
| Credit insufficient | Reject before processing |

---

## Credit System

### Credit Economics

| Playlist Size | Credits |
|---------------|---------|
| 15 tracks | 1 credit |
| 30 tracks | 2 credits |
| 50 tracks | 3 credits |
| 75 tracks | 4 credits |
| 100 tracks | 5 credits |

**Formula:** `credits = Math.ceil(playlistSize / 25)`

### Subscription Tiers

| Tier | Price | Credits/Month | Rate Limit |
|------|-------|---------------|------------|
| Free | $0 | 5 | 2 runs/day |
| Basic | $10/month | 50 | 20 runs/day |
| Pro | $25/month | 150 | Unlimited |

### Credit Flow

```
┌────────────────────────────────────────────────────────────────┐
│                      CREDIT LIFECYCLE                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1] CHECK          [2] RESERVE        [3] PROCESS             │
│  User requests ───▶ Deduct from   ───▶ Run pipeline            │
│  playlist           available          (may take 30-60s)       │
│                     Mark as pending                             │
│                                                                 │
│  [4a] SUCCESS                     [4b] FAILURE                 │
│  ─────────────                    ────────────                 │
│  Mark pending ───▶ CONSUMED       Refund pending ───▶ AVAILABLE│
│  credits as used                  credits                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Database Fields

```sql
-- In users table
credits_available INTEGER DEFAULT 5,
credits_pending INTEGER DEFAULT 0,
credits_used_total INTEGER DEFAULT 0,
subscription_tier TEXT DEFAULT 'free',
subscription_expires_at TIMESTAMP
```

---

## Authentication & Authorization

### Google OAuth 2.0 Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  Worker  │     │  Google  │     │    D1    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ Click Login    │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │ Redirect to Google              │                │
     │◀───────────────│                │                │
     │                │                │                │
     │ Auth at Google │                │                │
     │───────────────────────────────▶│                │
     │                │                │                │
     │ Callback + code│                │                │
     │◀──────────────────────────────│                │
     │                │                │                │
     │ Code           │                │                │
     │───────────────▶│                │                │
     │                │ Exchange code  │                │
     │                │───────────────▶│                │
     │                │ Tokens         │                │
     │                │◀───────────────│                │
     │                │                │                │
     │                │ Upsert user    │                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │ Set cookie     │                │                │
     │◀───────────────│                │                │
     │                │                │                │
```

### Session Management

- **Session Token:** JWT stored in HttpOnly cookie
- **Token Contents:**
  ```typescript
  interface SessionToken {
    userId: string;
    email: string;
    exp: number;     // 7 days
    iat: number;
  }
  ```
- **Refresh:** Silent refresh if token expires within 1 day
- **Logout:** Clear cookie, optionally revoke Google token

### Authorization Checks

Every pipeline request must verify:
1. Valid session token
2. User exists in D1
3. Sufficient credits available
4. Within rate limits for subscription tier

---

## Caching Strategy

### Cache Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CACHE HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Layer 1: In-Memory (Durable Object)                                    │
│  ────────────────────────────────────                                   │
│  • Current pipeline state                                                │
│  • Recent track lookups (LRU, 100 items)                                │
│  • TTL: Duration of DO instance                                         │
│                                                                          │
│  Layer 2: Cloudflare KV                                                 │
│  ─────────────────────────                                              │
│  • API responses (Last.fm, MusicBrainz)                                 │
│  • Resolved track data                                                   │
│  • LLM prompt templates                                                  │
│  • TTL: Varies by data type (see below)                                 │
│                                                                          │
│  Layer 3: D1 (Queryable Cache)                                          │
│  ────────────────────────────                                           │
│  • User run history                                                      │
│  • Generated playlists                                                   │
│  • Track metadata (deduplicated)                                        │
│  • TTL: Permanent (archival)                                            │
│                                                                          │
│  Layer 4: R2 (Cold Storage)                                             │
│  ─────────────────────────                                              │
│  • Full pipeline results (JSON)                                         │
│  • Export files                                                          │
│  • Analytics snapshots                                                   │
│  • TTL: Permanent                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### KV Cache Keys & TTLs

| Key Pattern | Data | TTL |
|-------------|------|-----|
| `lastfm:track:{mbid}` | Track info + tags | 24 hours |
| `lastfm:similar:{mbid}` | Similar tracks | 7 days |
| `lastfm:artist:{mbid}` | Artist info | 24 hours |
| `mb:recording:{mbid}` | MusicBrainz data | 30 days |
| `resolved:{query_hash}` | Query → MBID mapping | 7 days |
| `prompt:{name}` | LLM prompt templates | 1 hour |
| `rate:{userId}:{date}` | Daily rate limit counter | 24 hours |

### Cache Invalidation

- **Manual:** Admin endpoint to clear specific keys
- **TTL-based:** Primary strategy
- **On-demand:** If user reports stale data

---

## Rate Limiting

### Implementation

Using Cloudflare KV for distributed rate limiting:

```typescript
interface RateLimitConfig {
  tier: 'free' | 'basic' | 'pro';
  limits: {
    runsPerDay: number;
    runsPerMinute: number;
    apiCallsPerSecond: number;
  };
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    tier: 'free',
    limits: {
      runsPerDay: 2,
      runsPerMinute: 1,
      apiCallsPerSecond: 2
    }
  },
  basic: {
    tier: 'basic',
    limits: {
      runsPerDay: 20,
      runsPerMinute: 5,
      apiCallsPerSecond: 5
    }
  },
  pro: {
    tier: 'pro',
    limits: {
      runsPerDay: -1, // unlimited
      runsPerMinute: 10,
      apiCallsPerSecond: 10
    }
  }
};
```

### External API Rate Limiting

Separate from user rate limits—these protect us from API bans:

| API | Limit | Implementation |
|-----|-------|----------------|
| Last.fm | 5/second | Token bucket in DO |
| MusicBrainz | 1/second | Request queue in DO |
| LLM APIs | Per provider | Per-provider limiters |

---

## Frontend Specification

### Integration with GroveEngine

GroveMusic will follow GroveEngine patterns:
- SvelteKit with SSR
- Shared auth components
- Consistent styling (Grove design system)
- Subdomain routing via Workers

### Key Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page, seed track input |
| `/generate` | Pipeline progress view |
| `/playlist/[id]` | Playlist result view |
| `/history` | User's past runs |
| `/profile` | Account settings, credits |
| `/pricing` | Subscription tiers |

### Components Needed

```
/src
  /lib
    /components
      /generator
        SeedTrackInput.svelte      # Main input form
        PlaylistConfig.svelte       # Size, preferences
        PipelineProgress.svelte     # Stage-by-stage progress
        DisambiguationModal.svelte  # Track selection when ambiguous
      /playlist
        PlaylistView.svelte         # Full playlist display
        TrackCard.svelte            # Individual track
        PlaylistJSON.svelte         # JSON view
        PlaylistMarkdown.svelte     # Markdown view
        ExportOptions.svelte        # Download buttons
      /user
        CreditBalance.svelte        # Credit display
        RunHistory.svelte           # Past generations
      /shared
        LoadingSpinner.svelte
        ErrorMessage.svelte
        SubscriptionBadge.svelte
```

### State Management

```typescript
// Svelte stores
interface AppState {
  user: UserStore;           // Auth state, credits
  currentRun: RunStore;      // Active pipeline state
  history: HistoryStore;     // Past runs (paginated)
  ui: UIStore;               // Modals, toasts, etc.
}
```

### Real-time Updates

Pipeline progress communicated via:
- **Option A:** Server-Sent Events from DO
- **Option B:** Polling endpoint every 2 seconds

Recommend SSE for better UX.

---

## Database Schema

### D1 Tables

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- UUID
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  
  -- Credits
  credits_available INTEGER DEFAULT 5,
  credits_pending INTEGER DEFAULT 0,
  credits_used_total INTEGER DEFAULT 0,
  
  -- Subscription
  subscription_tier TEXT DEFAULT 'free',  -- 'free', 'basic', 'pro'
  subscription_expires_at TIMESTAMP,
  stripe_customer_id TEXT,
  
  -- Preferences (JSON)
  preferences TEXT DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);

-- Runs table
CREATE TABLE runs (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL REFERENCES users(id),
  
  -- Input
  seed_query TEXT NOT NULL,
  seed_track_mbid TEXT,
  seed_track_title TEXT,
  seed_track_artist TEXT,
  playlist_size INTEGER NOT NULL,
  config TEXT DEFAULT '{}',               -- JSON preferences
  
  -- Output
  status TEXT NOT NULL,                   -- 'pending', 'processing', 'complete', 'failed'
  playlist_json TEXT,                     -- Full JSON output
  track_count INTEGER,
  
  -- Metadata
  credits_used INTEGER NOT NULL,
  processing_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  
  -- Storage reference
  r2_key TEXT,                            -- Path in R2 for full archive
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Tracks table (deduplicated cache)
CREATE TABLE tracks (
  mbid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  artist_mbid TEXT,
  album TEXT,
  release_year INTEGER,
  tags TEXT,                              -- JSON array
  lastfm_url TEXT,
  
  -- Vector reference
  vectorize_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences/profile
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  
  -- Listening profile (built over time)
  favorite_tags TEXT DEFAULT '[]',        -- JSON array
  favorite_artists TEXT DEFAULT '[]',     -- JSON array  
  era_preference TEXT DEFAULT '{}',       -- JSON {start: 1990, end: 2024}
  
  -- UI preferences
  default_playlist_size INTEGER DEFAULT 15,
  default_output_format TEXT DEFAULT 'both', -- 'json', 'markdown', 'both'
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit transactions (audit log)
CREATE TABLE credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,                -- Positive = add, negative = deduct
  type TEXT NOT NULL,                     -- 'subscription', 'purchase', 'use', 'refund'
  run_id TEXT REFERENCES runs(id),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_created_at ON runs(created_at);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
```

### Vectorize Index Schema

```typescript
interface VectorizeTrack {
  id: string;           // MBID
  values: number[];     // 1536-dimensional embedding
  metadata: {
    title: string;
    artist: string;
    year?: number;
    topTags: string[];  // Top 5 tags for filtering
  };
}
```

---

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/callback` | OAuth callback |
| POST | `/api/auth/logout` | Clear session |

### Protected Endpoints (Require Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/me` | Get current user |
| PATCH | `/api/user/me` | Update user preferences |
| GET | `/api/user/credits` | Get credit balance |
| GET | `/api/user/history` | Get run history |
| POST | `/api/generate` | Start playlist generation |
| GET | `/api/generate/[runId]` | Get run status/result |
| GET | `/api/generate/[runId]/stream` | SSE progress stream |
| GET | `/api/playlist/[id]` | Get playlist by ID |
| GET | `/api/playlist/[id]/export/json` | Export as JSON |
| GET | `/api/playlist/[id]/export/md` | Export as Markdown |
| POST | `/api/track/resolve` | Resolve track query |

### Request/Response Examples

**POST /api/generate**
```typescript
// Request
{
  "query": "Pink + White by Frank Ocean",
  "playlistSize": 20,
  "preferences": {
    "eraRange": [2010, 2024],
    "popularityBias": "balanced"
  }
}

// Response
{
  "runId": "run_abc123",
  "status": "processing",
  "creditsReserved": 1,
  "streamUrl": "/api/generate/run_abc123/stream"
}
```

**GET /api/generate/[runId] (Complete)**
```typescript
{
  "runId": "run_abc123",
  "status": "complete",
  "seedTrack": {
    "mbid": "...",
    "title": "Pink + White",
    "artist": "Frank Ocean"
  },
  "playlist": [
    {
      "position": 1,
      "title": "...",
      "artist": "...",
      "album": "...",
      "year": 2016,
      "genre": "neo-soul",
      "reason": "...",
      "similarityScore": 9,
      "flowRole": "opener"
    }
    // ... more tracks
  ],
  "creditsUsed": 1,
  "processingTimeMs": 45000
}
```

---

## Future Considerations

### Phase 2 Features (Post-MVP)

1. **Spotify Integration**
   - Audio features for better matching
   - Direct playlist export
   - OAuth connection per user

2. **Apple Music Integration**
   - Similar to Spotify
   - Export playlists

3. **Audio File Upload**
   - Accept MP3/WAV
   - Extract features locally
   - Match to known tracks

4. **Collaborative Playlists**
   - Multiple seed tracks
   - User voting on suggestions

5. **Playlist Refinement**
   - "More like this" / "Less like this"
   - Regenerate specific positions

### Scaling Considerations

1. **Global Distribution**
   - D1 replicas for read scaling
   - R2 multi-region

2. **Vectorize Scaling**
   - May need to shard by genre/era
   - Monitor index size

3. **LLM Cost Optimization**
   - Batch similar requests
   - Cache common explanations
   - Evaluate cheaper providers

### Analytics to Track

- Runs per user per day/week/month
- Most common seed tracks
- Playlist size distribution
- Cache hit rate
- API latency by provider
- Credit utilization patterns
- Conversion rates (free → paid)

---

## Development Phases

### Phase 0: Foundation (Week 1-2)
- [ ] Set up Cloudflare project structure
- [ ] Configure D1 database with schema
- [ ] Set up KV namespaces
- [ ] Create Vectorize index
- [ ] Set up R2 bucket
- [ ] Implement Google OAuth
- [ ] Basic SvelteKit shell with GroveEngine patterns

### Phase 1: Core Pipeline (Week 3-5)
- [ ] Track Resolver Worker (MusicBrainz + Last.fm)
- [ ] Track Enricher Worker
- [ ] Candidate Generator Worker
- [ ] Similarity Scorer Worker
- [ ] Pipeline Durable Object orchestration
- [ ] Basic progress tracking

### Phase 2: LLM Integration (Week 6-7)
- [ ] LLM provider abstraction
- [ ] Claude integration
- [ ] Prompt templates for explanations
- [ ] Playlist ordering logic
- [ ] Provider stubs for Deepseek/Kimi

### Phase 3: Frontend (Week 8-10)
- [ ] Seed track input UI
- [ ] Pipeline progress view
- [ ] Playlist display (JSON + Markdown)
- [ ] User history page
- [ ] Profile/credits page

### Phase 4: Credit System (Week 11)
- [ ] Credit checking/reservation
- [ ] Transaction logging
- [ ] Basic subscription tiers
- [ ] Stripe integration (optional)

### Phase 5: Polish & Launch (Week 12+)
- [ ] Error handling improvements
- [ ] Rate limiting refinement
- [ ] Caching optimization
- [ ] Performance tuning
- [ ] Documentation
- [ ] Beta testing

---

## Appendix A: Environment Variables

```bash
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://music.grove.place/api/auth/callback

# External APIs
LASTFM_API_KEY=
LASTFM_SHARED_SECRET=

# LLM Providers
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
KIMI_API_KEY=

# App Config
APP_URL=https://music.grove.place
SESSION_SECRET=<random-32-bytes>
```

---

## Appendix B: KV Namespace Configuration

| Namespace | Purpose |
|-----------|---------|
| `GROVEMUSIC_CACHE` | API response caching |
| `GROVEMUSIC_SESSIONS` | User sessions |
| `GROVEMUSIC_RATE_LIMITS` | Rate limiting counters |
| `GROVEMUSIC_CONFIG` | Runtime configuration |

---

## Appendix C: R2 Bucket Structure

```
grovemusic-storage/
├── runs/
│   └── {year}/
│       └── {month}/
│           └── {runId}.json
├── exports/
│   └── {userId}/
│       └── {exportId}.{format}
└── analytics/
    └── {date}/
        └── daily-summary.json
```

---

## Appendix D: Durable Object Bindings

```toml
# wrangler.toml

[[durable_objects.bindings]]
name = "MUSIC_PIPELINE"
class_name = "MusicPipelineDO"

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiterDO"
```

---

*End of Specification*
