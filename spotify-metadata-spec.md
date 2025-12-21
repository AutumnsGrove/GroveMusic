# Spotify Metadata Integration Specification

**Version:** 1.1.0
**Last Updated:** December 21, 2025
**Status:** Research/Planning
**Parent Spec:** grovemusic-spec.md
**Data Source:** Anna's Archive Spotify Backup (December 2025)

---

## Executive Summary

This specification details how Aria can leverage the Anna's Archive Spotify metadata dump to dramatically improve track similarity matching, expand catalog coverage, and enable collaborative filtering. The integration focuses exclusively on **metadata** (not audio files), providing 256 million tracks with pre-computed audio features and 1.7 billion playlist co-occurrence relationships.

### Key Benefits

| Benefit | Current State | With Spotify Metadata |
|---------|---------------|----------------------|
| **Catalog coverage** | ~5M tracks (MusicBrainz ISRCs) | 186M unique ISRCs |
| **Audio features** | None (tag-based only) | Tempo, energy, danceability, etc. |
| **Similarity signals** | Last.fm similar tracks API | + Playlist co-occurrence graph |
| **API dependencies** | External rate limits | Self-hosted, unlimited |
| **Vector embeddings** | Text-based (tags, descriptions) | Numerical audio features |

---

## Table of Contents

1. [Data Source Overview](#data-source-overview)
2. [Dataset Inventory](#dataset-inventory)
3. [Cost Analysis & Optimization](#cost-analysis--optimization)
4. [Storage Architecture](#storage-architecture)
5. [Caching Strategy](#caching-strategy)
6. [Schema Design](#schema-design)
7. [Cross-Reference Strategy](#cross-reference-strategy)
8. [Pipeline Integration](#pipeline-integration)
9. [Audio Features Deep Dive](#audio-features-deep-dive)
10. [Playlist Co-occurrence Mining](#playlist-co-occurrence-mining)
11. [Import Pipeline](#import-pipeline)
12. [Operational Considerations](#operational-considerations)
13. [Legal & Ethical Notes](#legal--ethical-notes)
14. [Implementation Phases](#implementation-phases)

---

## Data Source Overview

### Origin

Anna's Archive released a comprehensive Spotify backup on December 20, 2025, distributed via torrents. The backup includes:

- **Audio files:** ~300TB of OGG Vorbis/Opus files (NOT needed for Aria)
- **Metadata databases:** ~200GB compressed SQLite files (PRIMARY interest)
- **Audio analysis:** ~4TB compressed of detailed audio features (SECONDARY interest)
- **Playlist data:** Millions of playlists with billions of track references (HIGH value)

### Data Freshness

- **Cutoff date:** July 2025
- **Coverage:** ~99.6% of Spotify listening activity
- **Limitations:** Tracks released after July 2025 not included

### Access Method

Data is distributed exclusively via BitTorrent through Anna's Archive torrents page. Metadata torrents are separate from audio file torrents.

---

## Dataset Inventory

### Primary Databases (Required)

| Database | Description | Compressed Size | Priority |
|----------|-------------|-----------------|----------|
| `spotify_tracks.db` | Track metadata (title, artist, album, ISRC, popularity) | ~50GB | **Critical** |
| `spotify_artists.db` | Artist metadata (name, genres, followers, popularity) | ~5GB | **Critical** |
| `spotify_albums.db` | Album metadata (name, label, release date, UPC) | ~15GB | **Critical** |
| `spotify_audio_features.db` | Audio analysis (tempo, key, energy, etc.) | ~4TB | **High** |
| `spotify_playlists.db` | Playlist metadata and track lists | ~100GB | **High** |

### Secondary Data (Optional)

| Data | Description | Size | Priority |
|------|-------------|------|----------|
| Album artwork references | URLs/hashes for cover art | ~10GB | Low |
| Podcast/audiobook metadata | Non-music content | ~20GB | Not needed |
| Raw JSON archives | Original API responses | ~50GB | Not needed |

---

## Cost Analysis & Optimization

### Cloudflare Pricing Breakdown (December 2025)

Understanding costs upfront ensures we architect for sustainability.

#### R2 Object Storage

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Storage | 10 GB/month | $0.015/GB/month |
| Class A ops (writes) | 1M/month | $4.50/million |
| Class B ops (reads) | 10M/month | $0.36/million |

**For 200GB metadata storage:**
```
Storage:    (200GB - 10GB free) × $0.015 = $2.85/month
Operations: ~5M reads/month × $0.36/M   = $1.80/month
────────────────────────────────────────────────────────
R2 Total:                                 ~$5/month
```

#### D1 Database

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Storage | 5 GB | $0.75/GB/month |
| Rows read | 25B/month | $0.001/million |
| Rows written | 50M/month | $1.00/million |

**For hot cache (staying within free tier):**
```
Storage:    5GB (free tier)              = $0/month
Operations: Within free tier             = $0/month
────────────────────────────────────────────────────────
D1 Total:                                 $0/month
```

#### Vectorize (The Critical Decision)

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Stored vectors | 200K | $0.05/million vectors/month |
| Dimensions | 1536 max | included |
| Queries | 30M/month | $0.01/1K queries |

**Full dataset approach (NOT recommended):**
```
256M vectors × $0.05/million = $12.80/month
```

**Popularity-tiered approach (RECOMMENDED):**

| Popularity Threshold | Tracks Included | Monthly Cost |
|---------------------|-----------------|--------------|
| All tracks (≥0) | 256M | $12.80 |
| Popularity ≥ 10 | ~50M | $2.50 |
| Popularity ≥ 20 | ~30M | $1.50 |
| Popularity ≥ 30 | ~15M | $0.75 |
| Popularity ≥ 40 | ~10M | $0.50 |
| Top 5M only | 5M | $0.25 |

**Insight:** Tracks with popularity < 20 account for ~85% of the catalog but represent < 5% of user queries. Vectorize the popular subset; fetch obscure tracks on-demand from R2.

#### KV Storage (for edge caching)

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Storage | 1 GB | $0.50/GB/month |
| Reads | 10M/day | $0.50/million |
| Writes | 1M/day | $5.00/million |

**For edge cache layer:**
```
Storage:    1GB (free tier)              = $0/month
Operations: Within free tier             = $0/month
────────────────────────────────────────────────────────
KV Total:                                 $0/month
```

### Cost Optimization Strategies

#### Strategy 1: Tiered Vectorization (Primary Savings)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TIERED VECTORIZATION STRATEGY                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Tier A: Pre-vectorized (Vectorize)          ~15M tracks        │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  • Popularity ≥ 30                                               │    │
│  │  • Instant similarity search                                     │    │
│  │  • Cost: ~$0.75/month                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              ↓ cache miss                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Tier B: On-demand vectorization             ~35M tracks        │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  • Popularity 10-29                                              │    │
│  │  • Fetch from R2 → compute vector → cache in D1                 │    │
│  │  • Add to Vectorize if queried 3+ times                         │    │
│  │  • Cost: R2 read costs only                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              ↓ cache miss                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Tier C: Cold storage only                   ~206M tracks       │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  • Popularity < 10                                               │    │
│  │  • Fetch from R2 on-demand                                       │    │
│  │  • Compute similarity locally (no Vectorize)                    │    │
│  │  • Cost: Minimal R2 reads                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Strategy 2: Aggressive KV Caching

Cache frequently accessed data at the edge to reduce D1/R2 operations:

| Data Type | Cache Location | TTL | Estimated Hit Rate |
|-----------|---------------|-----|-------------------|
| Audio features (popular tracks) | KV | 7 days | 80%+ |
| Cross-reference lookups | KV | 30 days | 90%+ |
| Co-occurrence scores | KV | 7 days | 70%+ |
| Recent similarity results | KV | 1 hour | 40%+ |

#### Strategy 3: Precomputed Results

Precompute and store common operations:

| Precomputation | Storage | Benefit |
|----------------|---------|---------|
| Top 100 similar tracks per popular track | D1 | Skip Vectorize query |
| Genre cluster assignments | D1 | Fast genre filtering |
| Decade buckets | D1 | Fast temporal filtering |
| Artist similarity matrix (top 100K artists) | R2 | Skip repeated computation |

### Monthly Cost Summary

| Deployment | R2 | D1 | Vectorize | KV | Total |
|------------|----|----|-----------|----|----|
| **Lean** (10M vectors) | $5 | $0 | $0.50 | $0 | **~$6/month** |
| **Balanced** (15M vectors) | $5 | $0 | $0.75 | $0 | **~$6/month** |
| **Standard** (30M vectors) | $5 | $0 | $1.50 | $0 | **~$7/month** |
| **Full** (256M vectors) | $5 | $0 | $12.80 | $0 | **~$18/month** |

**Recommendation:** Start with **Balanced** (~$6/month), monitor query patterns, and promote frequently-accessed tracks to Vectorize dynamically.

---

## Storage Architecture

### Tiered Storage Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SPOTIFY METADATA STORAGE TIERS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Tier 1: Hot Data (Cloudflare D1)                                       │
│  ─────────────────────────────────                                      │
│  • Cross-reference tables (ISRC → MBID mappings)                        │
│  • Frequently accessed track metadata                                    │
│  • Playlist co-occurrence scores (precomputed)                          │
│  • Size limit: ~10GB per D1 database                                    │
│                                                                          │
│  Tier 2: Warm Data (Cloudflare R2 + SQLite)                             │
│  ──────────────────────────────────────────                             │
│  • Full track/artist/album databases                                     │
│  • Audio features database                                               │
│  • Queryable via sql.js or better-sqlite3 in Workers                   │
│  • Size: ~200GB uncompressed                                            │
│                                                                          │
│  Tier 3: Vector Index (Cloudflare Vectorize)                            │
│  ───────────────────────────────────────────                            │
│  • Audio feature embeddings (normalized)                                 │
│  • Hybrid embeddings (audio + text features)                            │
│  • Size: ~15M vectors (popularity ≥ 30) — see Cost Analysis            │
│                                                                          │
│  Tier 4: Cold Storage (Cloudflare R2 Archive)                           │
│  ────────────────────────────────────────────                           │
│  • Original SQLite database files                                        │
│  • Playlist raw data                                                     │
│  • Backup/recovery                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Resource Summary

See [Cost Analysis & Optimization](#cost-analysis--optimization) for detailed pricing breakdown.

| Resource | Recommended Config | Monthly Cost |
|----------|-------------------|--------------|
| R2 Storage | 200GB metadata databases | ~$5 |
| D1 | 5GB hot cache (free tier) | $0 |
| Vectorize | 15M popular tracks | ~$0.75 |
| KV | Edge cache (free tier) | $0 |
| **Total** | | **~$6/month** |

---

## Caching Strategy

Aggressive caching is critical for cost optimization and performance. Every cache hit saves an R2 read, D1 query, or Vectorize lookup.

### Cache Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        5-LAYER CACHE HIERARCHY                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Layer 0: Request-level (in-memory)                        TTL: request │
│  ───────────────────────────────────────────────────────────────────── │
│  • Deduplication within single pipeline run                             │
│  • Map<string, AudioFeatures> in Worker memory                          │
│  • Zero cost, instant access                                            │
│                                                                          │
│  Layer 1: Edge Cache (Cloudflare KV)                      TTL: 1-30 days│
│  ───────────────────────────────────────────────────────────────────── │
│  • Globally distributed, ~50ms latency                                  │
│  • Audio features for frequently queried tracks                         │
│  • Cross-reference lookups (Spotify ID ↔ MBID)                         │
│  • Similarity results for popular seed tracks                           │
│  • Free tier: 1GB storage, 10M reads/day                               │
│                                                                          │
│  Layer 2: Hot Database (Cloudflare D1)                    TTL: permanent│
│  ───────────────────────────────────────────────────────────────────── │
│  • SQL-queryable structured cache                                        │
│  • Precomputed similarity scores                                        │
│  • Cross-reference tables                                                │
│  • Promotion candidates (tracks queried 3+ times)                       │
│  • Free tier: 5GB, 25B reads/month                                      │
│                                                                          │
│  Layer 3: Vector Index (Cloudflare Vectorize)             TTL: permanent│
│  ───────────────────────────────────────────────────────────────────── │
│  • KNN similarity search for popular tracks                             │
│  • Only tracks with popularity ≥ 30 pre-indexed                        │
│  • Dynamic promotion based on query frequency                           │
│  • ~15M vectors = ~$0.75/month                                          │
│                                                                          │
│  Layer 4: Cold Storage (Cloudflare R2)                    TTL: permanent│
│  ───────────────────────────────────────────────────────────────────── │
│  • Complete SQLite databases                                             │
│  • All 256M tracks available on-demand                                  │
│  • Query via sql.js in Worker                                           │
│  • ~$5/month for 200GB                                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Cache Key Patterns

```typescript
// KV cache key patterns
const CACHE_KEYS = {
  // Audio features: spotify:af:{trackId}
  audioFeatures: (spotifyId: string) => `spotify:af:${spotifyId}`,

  // Cross-reference: spotify:xref:{spotifyId}
  crossRef: (spotifyId: string) => `spotify:xref:${spotifyId}`,

  // ISRC to Spotify: spotify:isrc:{isrc}
  isrcLookup: (isrc: string) => `spotify:isrc:${isrc}`,

  // Similarity results: spotify:sim:{seedId}:{limit}
  similarityResults: (seedId: string, limit: number) =>
    `spotify:sim:${seedId}:${limit}`,

  // Co-occurrence: spotify:cooc:{trackA}:{trackB}
  cooccurrence: (trackA: string, trackB: string) => {
    const [a, b] = [trackA, trackB].sort();
    return `spotify:cooc:${a}:${b}`;
  },

  // Precomputed top similar: spotify:topsim:{trackId}
  topSimilar: (trackId: string) => `spotify:topsim:${trackId}`,
};

// TTL configuration (in seconds)
const CACHE_TTLS = {
  audioFeatures: 7 * 24 * 60 * 60,      // 7 days
  crossRef: 30 * 24 * 60 * 60,           // 30 days (rarely changes)
  isrcLookup: 30 * 24 * 60 * 60,         // 30 days
  similarityResults: 1 * 60 * 60,        // 1 hour (personalized)
  cooccurrence: 7 * 24 * 60 * 60,        // 7 days
  topSimilar: 7 * 24 * 60 * 60,          // 7 days
};
```

### Cache-Through Implementation

Using SST's Resource SDK for type-safe access to linked resources:

```typescript
import { Resource } from "sst";

class SpotifyMetadataCache {
  private requestCache = new Map<string, AudioFeatures>();

  async getAudioFeatures(spotifyId: string): Promise<AudioFeatures | null> {
    // Layer 0: Request-level cache
    if (this.requestCache.has(spotifyId)) {
      return this.requestCache.get(spotifyId)!;
    }

    // Layer 1: KV edge cache (via SST Resource)
    const kvKey = CACHE_KEYS.audioFeatures(spotifyId);
    const kvResult = await Resource.SpotifyKV.get(kvKey, { type: "json" });
    if (kvResult) {
      this.requestCache.set(spotifyId, kvResult as AudioFeatures);
      return kvResult as AudioFeatures;
    }

    // Layer 2: D1 hot cache (via SST Resource)
    const d1Result = await Resource.SpotifyCache.prepare(`
      SELECT * FROM spotify_audio_features_cache WHERE spotify_id = ?
    `).bind(spotifyId).first();

    if (d1Result) {
      const features = d1Result as AudioFeatures;
      // Promote to KV for faster future access
      await Resource.SpotifyKV.put(kvKey, JSON.stringify(features), {
        expirationTtl: CACHE_TTLS.audioFeatures
      });
      this.requestCache.set(spotifyId, features);
      return features;
    }

    // Layer 4: R2 cold storage (skip Layer 3 for single lookups)
    const features = await this.fetchFromR2(spotifyId);
    if (features) {
      // FIRE-AND-FORGET: Track access for potential promotion
      // Don't await - this is async background work, user shouldn't wait
      this.recordAccess(spotifyId).catch(() => {
        // Swallow errors - access logging is best-effort
        // If it fails, track just won't be promoted as quickly
      });

      // These we DO await - user needs cached result for next request
      await Promise.all([
        this.cacheInD1(spotifyId, features),
        Resource.SpotifyKV.put(kvKey, JSON.stringify(features), {
          expirationTtl: CACHE_TTLS.audioFeatures
        })
      ]);

      this.requestCache.set(spotifyId, features);
    }

    return features;
  }

  private async fetchFromR2(spotifyId: string): Promise<AudioFeatures | null> {
    // Fetch SQLite database from R2 and query with sql.js
    const dbFile = await Resource.SpotifyStorage.get("spotify_audio_features.db");
    if (!dbFile) return null;

    // Load with sql.js (WASM SQLite)
    const SQL = await initSqlJs();
    const buffer = await dbFile.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    const result = db.exec(
      `SELECT * FROM audio_features WHERE id = ?`,
      [spotifyId]
    );

    db.close();
    return result[0]?.values[0] as AudioFeatures | null;
  }

  private async cacheInD1(spotifyId: string, features: AudioFeatures): Promise<void> {
    await Resource.SpotifyCache.prepare(`
      INSERT OR REPLACE INTO spotify_audio_features_cache
      (spotify_id, tempo, energy, danceability, valence, acousticness,
       instrumentalness, speechiness, liveness, loudness, key, mode,
       time_signature, popularity, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `).bind(
      spotifyId,
      features.tempo,
      features.energy,
      features.danceability,
      features.valence,
      features.acousticness,
      features.instrumentalness,
      features.speechiness,
      features.liveness,
      features.loudness,
      features.key,
      features.mode,
      features.time_signature,
      features.popularity
    ).run();
  }

  private async recordAccess(spotifyId: string): Promise<void> {
    // Increment access counter for background promotion job
    // This is called fire-and-forget from the hot path
    await Resource.SpotifyCache.prepare(`
      INSERT INTO track_access_log (spotify_id, access_count, last_accessed)
      VALUES (?, 1, unixepoch())
      ON CONFLICT(spotify_id) DO UPDATE SET
        access_count = access_count + 1,
        last_accessed = unixepoch()
    `).bind(spotifyId).run();
  }
}
```

### Dynamic Vector Promotion

Tracks that are queried frequently but not yet in Vectorize are promoted **asynchronously via background jobs** — never during user requests.

#### Why Async Promotion?

Vectorization during a user request would add 200-500ms latency. Instead:

```
USER REQUEST (synchronous)          BACKGROUND JOB (async)
────────────────────────────        ────────────────────────
1. Query obscure track              Runs every 24h via Cron:
2. Cache miss → fetch R2            1. Find tracks with 3+ queries
3. Record access (fire-and-forget)  2. Batch vectorize ~1000 tracks
4. Return to user immediately       3. Upsert to Vectorize
   └── No waiting for vectorization    └── No user waiting
```

#### User Experience Timeline

| Query # | What Happens | User Latency |
|---------|--------------|--------------|
| 1st query | R2 fetch, access logged | ~500ms |
| 2nd query | KV cache hit | ~50ms |
| 3rd query | KV cache hit, access_count=3 | ~50ms |
| *overnight* | Background job promotes to Vectorize | — |
| Future queries | Now in Vectorize for KNN search | ~200ms |

#### Promotion Configuration

```typescript
interface PromotionConfig {
  accessThreshold: number;      // Queries before promotion (default: 3)
  batchSize: number;            // Tracks to promote per run (default: 1000)
  maxVectors: number;           // Cap on Vectorize size (default: 20M)
  checkIntervalHours: number;   // How often to run promotion (default: 24)
}

async function promoteTracksToVectorize(
  config: PromotionConfig,
  cache: SpotifyMetadataCache
): Promise<number> {
  // Find tracks with high access counts not yet in Vectorize
  const candidates = await cache.d1.prepare(`
    SELECT
      tal.spotify_id,
      tal.access_count,
      saf.tempo, saf.energy, saf.danceability, saf.valence,
      saf.acousticness, saf.instrumentalness, saf.speechiness,
      saf.liveness, saf.loudness, saf.key, saf.mode, saf.time_signature,
      saf.popularity
    FROM track_access_log tal
    JOIN spotify_audio_features_cache saf ON saf.spotify_id = tal.spotify_id
    WHERE tal.access_count >= ?
      AND tal.vectorized = 0
    ORDER BY tal.access_count DESC
    LIMIT ?
  `).bind(config.accessThreshold, config.batchSize).all();

  if (candidates.results.length === 0) return 0;

  // Generate vectors and upsert to Vectorize
  const vectors = candidates.results.map(row => ({
    id: row.spotify_id as string,
    values: normalizeAudioFeatures(row as AudioFeatures),
    metadata: {
      popularity: row.popularity as number,
      promoted: true,
      promotedAt: Date.now()
    }
  }));

  await cache.vectorize.upsert(vectors);

  // Mark as vectorized
  const ids = candidates.results.map(r => r.spotify_id);
  await cache.d1.prepare(`
    UPDATE track_access_log SET vectorized = 1 WHERE spotify_id IN (${ids.map(() => '?').join(',')})
  `).bind(...ids).run();

  return vectors.length;
}
```

#### SST Infrastructure Configuration

This project uses [SST](https://sst.dev) for infrastructure-as-code with TypeScript instead of raw `wrangler.toml`. SST provides type-safe resource definitions, automatic linking, and a cleaner developer experience.

**Install SST:**
```bash
pnpm add -D sst
```

**Define resources in `sst.config.ts`:**

```typescript
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "grovemusic",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "cloudflare",
    };
  },
  async run() {
    // ─────────────────────────────────────────────────────────────────────
    // Spotify Metadata Resources
    // ─────────────────────────────────────────────────────────────────────

    // D1 Database for hot cache and cross-references
    const db = new sst.cloudflare.D1("SpotifyCache");

    // KV for edge caching (audio features, similarity results)
    const kv = new sst.cloudflare.Kv("SpotifyKV");

    // R2 for cold storage (200GB SQLite databases)
    const storage = new sst.cloudflare.Bucket("SpotifyStorage");

    // Vectorize index for audio feature similarity search
    // Note: Vectorize may need manual setup via wrangler until SST adds support
    // pnpm wrangler vectorize create grovemusic-spotify-tracks --dimensions=13 --metric=cosine

    // ─────────────────────────────────────────────────────────────────────
    // Workers
    // ─────────────────────────────────────────────────────────────────────

    // Main API worker
    const api = new sst.cloudflare.Worker("SpotifyMetadataAPI", {
      handler: "./workers/spotify-metadata/src/index.ts",
      link: [db, kv, storage],
      url: true,
    });

    // Cron worker for background promotion
    const promotionCron = new sst.cloudflare.Cron("SpotifyPromotionCron", {
      job: {
        handler: "./workers/spotify-promotion/src/index.ts",
        link: [db, kv, storage],
      },
      schedules: ["0 3 * * *"], // 3 AM UTC daily
    });

    return {
      api: api.url,
    };
  },
});
```

**Worker code using SST's Resource SDK:**

```typescript
// workers/spotify-metadata/src/index.ts
import { Resource } from "sst";

export default {
  async fetch(request: Request): Promise<Response> {
    // Access D1 via Resource (no env parameter needed)
    const result = await Resource.SpotifyCache.prepare(
      "SELECT * FROM spotify_audio_features_cache WHERE spotify_id = ?"
    ).bind("abc123").first();

    // Access KV
    const cached = await Resource.SpotifyKV.get("spotify:af:abc123");

    // Access R2
    const dbFile = await Resource.SpotifyStorage.get("spotify_tracks.db");

    return new Response(JSON.stringify(result));
  },
};
```

**Cron worker for promotion:**

```typescript
// workers/spotify-promotion/src/index.ts
import { Resource } from "sst";

export default {
  async scheduled(controller: ScheduledController): Promise<void> {
    const config: PromotionConfig = {
      accessThreshold: 3,
      batchSize: 1000,
      maxVectors: 20_000_000,
      checkIntervalHours: 24,
    };

    // SST's Resource SDK provides typed access to linked resources
    const candidates = await Resource.SpotifyCache.prepare(`
      SELECT tal.spotify_id, tal.access_count, saf.*
      FROM track_access_log tal
      JOIN spotify_audio_features_cache saf ON saf.spotify_id = tal.spotify_id
      WHERE tal.access_count >= ? AND tal.vectorized = 0
      ORDER BY tal.access_count DESC
      LIMIT ?
    `).bind(config.accessThreshold, config.batchSize).all();

    if (candidates.results.length === 0) return;

    // Vectorize promotion logic here...
    console.log(`Cron: Found ${candidates.results.length} tracks to promote`);
  },
};
```

**Deploy with SST:**

```bash
# Development (local)
pnpm sst dev

# Deploy to production
pnpm sst deploy --stage production
```

#### SST vs wrangler.toml Comparison

| Aspect | wrangler.toml | SST |
|--------|---------------|-----|
| Config format | TOML | TypeScript |
| Type safety | None | Full |
| Resource access | `env.BINDING` | `Resource.Name` |
| Multi-resource linking | Manual IDs | Automatic |
| Cron triggers | `[triggers]` section | `sst.cloudflare.Cron` component |
| Local dev | `wrangler dev` | `sst dev` (with live reload) |
| Package manager | Any | pnpm recommended |

### Precomputed Similarity Cache

For the most popular tracks, precompute and cache similarity results:

```typescript
// Precompute top 100 similar tracks for top 100K popular tracks
async function precomputeTopSimilar(
  cache: SpotifyMetadataCache,
  vectorize: VectorizeIndex
): Promise<void> {
  const POPULAR_TRACK_LIMIT = 100_000;
  const SIMILAR_PER_TRACK = 100;

  // Get most popular tracks
  const popularTracks = await cache.d1.prepare(`
    SELECT spotify_id, popularity
    FROM spotify_audio_features_cache
    ORDER BY popularity DESC
    LIMIT ?
  `).bind(POPULAR_TRACK_LIMIT).all();

  for (const track of popularTracks.results) {
    const spotifyId = track.spotify_id as string;

    // Check if already computed
    const existing = await cache.kv.get(CACHE_KEYS.topSimilar(spotifyId));
    if (existing) continue;

    // Get audio features and find similar
    const features = await cache.getAudioFeatures(spotifyId);
    if (!features) continue;

    const vector = normalizeAudioFeatures(features);
    const similar = await vectorize.query(vector, {
      topK: SIMILAR_PER_TRACK,
      returnMetadata: true
    });

    // Cache the results
    await cache.kv.put(
      CACHE_KEYS.topSimilar(spotifyId),
      JSON.stringify(similar.matches),
      { expirationTtl: CACHE_TTLS.topSimilar }
    );
  }
}
```

### Cache Metrics

Track cache performance to optimize TTLs and promotion thresholds:

```typescript
interface CacheMetrics {
  layer: 'request' | 'kv' | 'd1' | 'vectorize' | 'r2';
  operation: 'hit' | 'miss';
  latencyMs: number;
  dataType: 'audioFeatures' | 'crossRef' | 'similarity' | 'cooccurrence';
}

async function recordCacheMetric(metric: CacheMetrics): Promise<void> {
  // Log to Analytics Engine or similar
  console.log(JSON.stringify({
    type: 'cache_metric',
    ...metric,
    timestamp: Date.now()
  }));
}

// Target metrics:
// - KV hit rate: > 80% for audio features
// - D1 hit rate: > 60% for cross-references
// - Vectorize coverage: > 95% of seed track queries
// - R2 fallback rate: < 5% of total queries
```

---

## Schema Design

### D1 Schema: Cross-Reference Tables

```sql
-- Primary cross-reference: Spotify ↔ MusicBrainz
CREATE TABLE spotify_mbid_xref (
  spotify_id TEXT PRIMARY KEY,      -- Spotify base62 track ID
  isrc TEXT NOT NULL,               -- International Standard Recording Code
  mbid TEXT,                        -- MusicBrainz Recording ID (nullable if no match)
  match_confidence REAL,            -- 0.0-1.0 confidence score
  match_method TEXT,                -- 'isrc_exact', 'isrc_fuzzy', 'metadata_match'
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_xref_isrc ON spotify_mbid_xref(isrc);
CREATE INDEX idx_xref_mbid ON spotify_mbid_xref(mbid);

-- Cached audio features for hot tracks
CREATE TABLE spotify_audio_features_cache (
  spotify_id TEXT PRIMARY KEY,
  tempo REAL,                       -- BPM
  time_signature INTEGER,           -- Beats per bar
  key INTEGER,                      -- Pitch class (0-11)
  mode INTEGER,                     -- Major (1) or Minor (0)
  loudness REAL,                    -- dB
  energy REAL,                      -- 0.0-1.0
  danceability REAL,                -- 0.0-1.0
  speechiness REAL,                 -- 0.0-1.0
  acousticness REAL,                -- 0.0-1.0
  instrumentalness REAL,            -- 0.0-1.0
  liveness REAL,                    -- 0.0-1.0
  valence REAL,                     -- 0.0-1.0 (musical positivity)
  duration_ms INTEGER,
  popularity INTEGER,               -- 0-100 at time of snapshot
  cached_at INTEGER DEFAULT (unixepoch())
);

-- Precomputed playlist co-occurrence scores
CREATE TABLE playlist_cooccurrence (
  track_a TEXT NOT NULL,            -- Spotify ID (lower alphabetically)
  track_b TEXT NOT NULL,            -- Spotify ID (higher alphabetically)
  cooccurrence_count INTEGER,       -- Number of playlists containing both
  pmi_score REAL,                   -- Pointwise Mutual Information
  jaccard_score REAL,               -- Jaccard similarity
  PRIMARY KEY (track_a, track_b)
);

CREATE INDEX idx_cooccur_a ON playlist_cooccurrence(track_a);
CREATE INDEX idx_cooccur_b ON playlist_cooccurrence(track_b);

-- Artist genre mappings
CREATE TABLE spotify_artist_genres (
  spotify_artist_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  PRIMARY KEY (spotify_artist_id, genre)
);

CREATE INDEX idx_genre ON spotify_artist_genres(genre);

-- Track access logging for dynamic promotion
CREATE TABLE track_access_log (
  spotify_id TEXT PRIMARY KEY,
  access_count INTEGER DEFAULT 1,
  last_accessed INTEGER,           -- Unix timestamp
  vectorized INTEGER DEFAULT 0,    -- 1 if promoted to Vectorize
  promoted_at INTEGER              -- When promoted to Vectorize
);

CREATE INDEX idx_access_promotion ON track_access_log(access_count, vectorized);

-- Precomputed similarity cache (skip Vectorize for popular pairs)
CREATE TABLE precomputed_similar (
  seed_spotify_id TEXT NOT NULL,
  similar_spotify_id TEXT NOT NULL,
  similarity_score REAL,
  rank INTEGER,                    -- 1 = most similar
  PRIMARY KEY (seed_spotify_id, similar_spotify_id)
);

CREATE INDEX idx_precomputed_seed ON precomputed_similar(seed_spotify_id, rank);
```

### R2 SQLite Schema (Imported from Source)

The source databases use schemas closely matching Spotify's API responses:

```sql
-- Tracks table (spotify_tracks.db)
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,              -- Spotify base62 ID
  name TEXT NOT NULL,
  artist_ids TEXT,                  -- JSON array of artist IDs
  album_id TEXT,
  disc_number INTEGER,
  track_number INTEGER,
  duration_ms INTEGER,
  explicit INTEGER,                 -- Boolean
  isrc TEXT,
  popularity INTEGER,               -- 0-100
  preview_url TEXT,
  external_urls TEXT                -- JSON
);

-- Artists table (spotify_artists.db)
CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  genres TEXT,                      -- JSON array
  followers INTEGER,
  popularity INTEGER,
  external_urls TEXT
);

-- Albums table (spotify_albums.db)
CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist_ids TEXT,                  -- JSON array
  release_date TEXT,                -- YYYY or YYYY-MM-DD
  release_date_precision TEXT,      -- 'year', 'month', 'day'
  total_tracks INTEGER,
  album_type TEXT,                  -- 'album', 'single', 'compilation'
  label TEXT,
  upc TEXT,
  external_urls TEXT
);

-- Audio Features table (spotify_audio_features.db)
CREATE TABLE audio_features (
  id TEXT PRIMARY KEY,              -- Same as track ID
  danceability REAL,
  energy REAL,
  key INTEGER,
  loudness REAL,
  mode INTEGER,
  speechiness REAL,
  acousticness REAL,
  instrumentalness REAL,
  liveness REAL,
  valence REAL,
  tempo REAL,
  duration_ms INTEGER,
  time_signature INTEGER
);

-- Playlists table (spotify_playlists.db)
CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  owner_id TEXT,
  followers INTEGER,
  public INTEGER,
  collaborative INTEGER
);

CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER,
  added_at TEXT,
  PRIMARY KEY (playlist_id, track_id)
);
```

### Vectorize Schema

```typescript
interface SpotifyAudioVector {
  id: string;                       // Spotify track ID
  values: number[];                 // Normalized audio features
  metadata: {
    isrc: string;
    mbid?: string;                  // If cross-referenced
    title: string;
    artist: string;
    popularity: number;
    genres: string[];               // From artist
    year?: number;
  };
}
```

**Vector Dimensions (13 features, normalized):**

| Index | Feature | Normalization |
|-------|---------|---------------|
| 0 | tempo | (tempo - 60) / 140, clamped 0-1 |
| 1 | energy | Already 0-1 |
| 2 | danceability | Already 0-1 |
| 3 | valence | Already 0-1 |
| 4 | acousticness | Already 0-1 |
| 5 | instrumentalness | Already 0-1 |
| 6 | speechiness | Already 0-1 |
| 7 | liveness | Already 0-1 |
| 8 | loudness | (loudness + 60) / 60, clamped 0-1 |
| 9 | key | key / 11 |
| 10 | mode | 0 or 1 |
| 11 | time_signature | (time_sig - 3) / 4, clamped 0-1 |
| 12 | popularity | popularity / 100 |

**Alternative: Hybrid Vectors (1536 dimensions)**

Combine audio features with text embeddings:
- Dimensions 0-12: Audio features (above)
- Dimensions 13-1535: Text embedding of "{artist} - {title} [{genres}]"

---

## Cross-Reference Strategy

### ISRC as the Bridge

ISRC (International Standard Recording Code) is the universal identifier for recordings:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Spotify    │     │     ISRC     │     │ MusicBrainz  │
│   Track ID   │────▶│   Bridge     │◀────│     MBID     │
│  (base62)    │     │              │     │   (UUID)     │
└──────────────┘     └──────────────┘     └──────────────┘
     256M                 186M                  5M
```

### Matching Pipeline

```typescript
interface CrossRefResult {
  spotifyId: string;
  isrc: string;
  mbid: string | null;
  confidence: number;
  method: 'isrc_exact' | 'isrc_fuzzy' | 'metadata_match' | 'no_match';
}

async function crossReference(spotifyTrack: SpotifyTrack): Promise<CrossRefResult> {
  // Step 1: Exact ISRC match in MusicBrainz
  const mbRecording = await musicbrainz.lookupByISRC(spotifyTrack.isrc);
  if (mbRecording) {
    return {
      spotifyId: spotifyTrack.id,
      isrc: spotifyTrack.isrc,
      mbid: mbRecording.id,
      confidence: 1.0,
      method: 'isrc_exact'
    };
  }

  // Step 2: Fuzzy ISRC match (handle country code variations)
  const fuzzyMatch = await musicbrainz.fuzzyISRCLookup(spotifyTrack.isrc);
  if (fuzzyMatch) {
    return {
      spotifyId: spotifyTrack.id,
      isrc: spotifyTrack.isrc,
      mbid: fuzzyMatch.id,
      confidence: 0.9,
      method: 'isrc_fuzzy'
    };
  }

  // Step 3: Metadata matching (title + artist + duration)
  const metadataMatch = await musicbrainz.searchRecording({
    title: spotifyTrack.name,
    artist: spotifyTrack.artists[0].name,
    duration: spotifyTrack.duration_ms
  });
  if (metadataMatch && metadataMatch.score > 0.85) {
    return {
      spotifyId: spotifyTrack.id,
      isrc: spotifyTrack.isrc,
      mbid: metadataMatch.id,
      confidence: metadataMatch.score,
      method: 'metadata_match'
    };
  }

  // No match found
  return {
    spotifyId: spotifyTrack.id,
    isrc: spotifyTrack.isrc,
    mbid: null,
    confidence: 0,
    method: 'no_match'
  };
}
```

### Expected Match Rates

| Match Type | Estimated Coverage |
|------------|-------------------|
| ISRC exact match | ~3% (5M of 186M) |
| Metadata match | +5-10% additional |
| Spotify-only (no MBID) | ~85% |

**Strategy:** For tracks without MBID matches, use Spotify metadata directly and treat Spotify ID as the canonical identifier.

---

## Pipeline Integration

### Enhanced Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   ENHANCED PIPELINE WITH SPOTIFY DATA                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1] RESOLVE              [2] ENRICH                [3] GENERATE        │
│  ──────────────────────────────────────────────────────────────────────│
│                                                                          │
│  User query          ───▶ Fetch from multiple      ───▶ Multi-source    │
│       │                   sources in parallel            candidates      │
│       ▼                         │                            │          │
│  ┌─────────────┐         ┌──────┴──────┐              ┌──────┴──────┐   │
│  │ MusicBrainz │         │             │              │             │   │
│  │   lookup    │         ▼             ▼              ▼             ▼   │
│  └──────┬──────┘   ┌──────────┐  ┌──────────┐  ┌──────────┐ ┌────────┐ │
│         │          │ Last.fm  │  │ Spotify  │  │ Last.fm  │ │Spotify │ │
│         ▼          │  tags    │  │ audio    │  │ similar  │ │playlist│ │
│  ┌─────────────┐   │          │  │ features │  │ tracks   │ │cooccur │ │
│  │   ISRC →    │   └──────────┘  └──────────┘  └──────────┘ └────────┘ │
│  │  Spotify    │                       │              │          │      │
│  │   lookup    │                       │              │          │      │
│  └──────┬──────┘                       ▼              ▼          ▼      │
│         │                    ┌─────────────────────────────────────┐    │
│         └───────────────────▶│         Unified Candidate Pool      │    │
│                              └─────────────────────────────────────┘    │
│                                                                          │
│  [4] SCORE                  [5] CURATE               [6] OUTPUT         │
│  ──────────────────────────────────────────────────────────────────────│
│                                                                          │
│  Multi-dimensional     ───▶ Balance & select    ───▶ Final playlist    │
│  scoring                                                                 │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────┐                        │
│  │ Scoring Dimensions (weighted):               │                        │
│  │  • Tag overlap (Last.fm)           15%      │                        │
│  │  • Audio feature similarity (NEW)   25%     │                        │
│  │  • Playlist co-occurrence (NEW)     25%     │                        │
│  │  • Artist similarity               15%      │                        │
│  │  • Temporal proximity              10%      │                        │
│  │  • Popularity balance              10%      │                        │
│  └─────────────────────────────────────────────┘                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Scoring Functions

```typescript
// Audio feature similarity using cosine distance
function audioFeatureSimilarity(
  seedFeatures: AudioFeatures,
  candidateFeatures: AudioFeatures
): number {
  const seedVector = normalizeAudioFeatures(seedFeatures);
  const candidateVector = normalizeAudioFeatures(candidateFeatures);
  return cosineSimilarity(seedVector, candidateVector);
}

// Playlist co-occurrence score
async function playlistCooccurrenceScore(
  seedSpotifyId: string,
  candidateSpotifyId: string
): Promise<number> {
  const [a, b] = [seedSpotifyId, candidateSpotifyId].sort();

  const result = await db.prepare(`
    SELECT pmi_score, jaccard_score, cooccurrence_count
    FROM playlist_cooccurrence
    WHERE track_a = ? AND track_b = ?
  `).bind(a, b).first();

  if (!result) return 0;

  // Weighted combination of metrics
  // PMI captures "surprisingly often together"
  // Jaccard captures "frequently together"
  return (
    0.6 * normalize(result.pmi_score, -5, 10) +
    0.4 * result.jaccard_score
  );
}

// Combined similarity score
interface SimilarityScores {
  tagOverlap: number;           // 0-1 from Last.fm
  audioFeature: number;         // 0-1 from Spotify features
  playlistCooccurrence: number; // 0-1 from playlist mining
  artistSimilarity: number;     // 0-1 from Last.fm/MB
  temporalProximity: number;    // 0-1 based on release year
  popularityFit: number;        // 0-1 based on user preference
}

function computeOverallScore(scores: SimilarityScores): number {
  const weights = {
    tagOverlap: 0.15,
    audioFeature: 0.25,          // NEW - major signal
    playlistCooccurrence: 0.25,  // NEW - major signal
    artistSimilarity: 0.15,
    temporalProximity: 0.10,
    popularityFit: 0.10
  };

  return Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + scores[key as keyof SimilarityScores] * weight,
    0
  ) * 10; // Scale to 0-10
}
```

---

## Audio Features Deep Dive

### Feature Definitions

| Feature | Range | Description | Use Case |
|---------|-------|-------------|----------|
| **tempo** | 50-200+ BPM | Beats per minute | Energy matching |
| **energy** | 0.0-1.0 | Intensity and activity | Mood matching |
| **danceability** | 0.0-1.0 | Suitability for dancing | Party/chill detection |
| **valence** | 0.0-1.0 | Musical positiveness | Mood matching |
| **acousticness** | 0.0-1.0 | Acoustic vs electronic | Production style |
| **instrumentalness** | 0.0-1.0 | Vocal presence | Instrumental detection |
| **speechiness** | 0.0-1.0 | Spoken word presence | Podcast/rap detection |
| **liveness** | 0.0-1.0 | Live audience presence | Studio vs live |
| **loudness** | -60 to 0 dB | Overall loudness | Mastering style |
| **key** | 0-11 | Pitch class | Harmonic matching |
| **mode** | 0 or 1 | Major or minor | Mood matching |
| **time_signature** | 3-7 | Beats per bar | Rhythm matching |

### Feature Quality Notes

From community analysis, some caveats:

1. **Valence, Energy, Danceability** — These are derived from machine learning models and may not perfectly align with human perception. Treat as "rough signals" not ground truth.

2. **Key Detection** — Reasonably accurate for simple songs; struggles with key changes or modal ambiguity.

3. **Tempo** — Generally accurate but may report half-time or double-time for some genres.

4. **Best Use** — Most effective when used as one signal among many, not as sole similarity metric.

### Feature Clustering for Genre Detection

```typescript
// Genre profiles based on audio feature clustering
const GENRE_PROFILES: Record<string, Partial<AudioFeatures>> = {
  'edm': { energy: 0.85, danceability: 0.75, acousticness: 0.05, tempo: 128 },
  'acoustic-folk': { energy: 0.35, acousticness: 0.85, instrumentalness: 0.3 },
  'hip-hop': { speechiness: 0.15, danceability: 0.7, energy: 0.65 },
  'classical': { instrumentalness: 0.9, acousticness: 0.8, speechiness: 0.02 },
  'metal': { energy: 0.95, loudness: -5, acousticness: 0.02 },
  'jazz': { acousticness: 0.6, instrumentalness: 0.5, liveness: 0.25 },
};

function detectGenreFromFeatures(features: AudioFeatures): string[] {
  const scores: [string, number][] = Object.entries(GENRE_PROFILES).map(
    ([genre, profile]) => [genre, profileSimilarity(features, profile)]
  );

  return scores
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([_, score]) => score > 0.7)
    .map(([genre]) => genre);
}
```

---

## Playlist Co-occurrence Mining

### Value Proposition

Playlist co-occurrence captures **human curation signals** — when millions of users put tracks together in playlists, that reveals relationships that audio features alone cannot detect:

- Cover songs with originals
- Songs from the same soundtrack
- "Vibes" that transcend genre
- Regional/cultural associations
- Temporal associations (songs popular at the same time)

### Mining Algorithm

```typescript
interface CooccurrenceJob {
  // Process playlist data to build co-occurrence matrix
  async run(): Promise<void> {
    const BATCH_SIZE = 10000;
    const MIN_PLAYLIST_SIZE = 5;
    const MAX_PLAYLIST_SIZE = 500;
    const MIN_COOCCURRENCE = 3; // Minimum times appearing together

    // Track pair counts
    const pairCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();
    let totalPlaylists = 0;

    // Stream through all playlists
    for await (const playlist of this.streamPlaylists()) {
      if (playlist.tracks.length < MIN_PLAYLIST_SIZE) continue;
      if (playlist.tracks.length > MAX_PLAYLIST_SIZE) continue;

      totalPlaylists++;

      // Count individual tracks
      for (const track of playlist.tracks) {
        trackCounts.set(track, (trackCounts.get(track) || 0) + 1);
      }

      // Count all pairs in this playlist
      for (let i = 0; i < playlist.tracks.length; i++) {
        for (let j = i + 1; j < playlist.tracks.length; j++) {
          const [a, b] = [playlist.tracks[i], playlist.tracks[j]].sort();
          const key = `${a}|${b}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }

    // Compute PMI and Jaccard for significant pairs
    for (const [key, count] of pairCounts) {
      if (count < MIN_COOCCURRENCE) continue;

      const [a, b] = key.split('|');
      const countA = trackCounts.get(a) || 0;
      const countB = trackCounts.get(b) || 0;

      // Pointwise Mutual Information
      // PMI = log2(P(a,b) / (P(a) * P(b)))
      const pAB = count / totalPlaylists;
      const pA = countA / totalPlaylists;
      const pB = countB / totalPlaylists;
      const pmi = Math.log2(pAB / (pA * pB));

      // Jaccard similarity
      // J(A,B) = |A ∩ B| / |A ∪ B|
      const jaccard = count / (countA + countB - count);

      await this.insertCooccurrence(a, b, count, pmi, jaccard);
    }
  }
}
```

### Storage Optimization

With 256M tracks, storing all pairs is infeasible. Strategies:

1. **Minimum threshold:** Only store pairs appearing in 3+ playlists
2. **Top-K per track:** Store only top 100 co-occurring tracks per track
3. **Popularity filter:** Focus on tracks with popularity > 10
4. **Chunked storage:** Partition by first character of track ID

Estimated storage: ~10-50GB for significant pairs

---

## Import Pipeline

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         IMPORT PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1] DOWNLOAD           [2] VALIDATE           [3] TRANSFORM            │
│  ────────────────────────────────────────────────────────────────────── │
│  Torrent client    ───▶ Verify checksums  ───▶ Decompress              │
│  (external)             Spot-check data        Convert schemas          │
│                                                                          │
│  [4] CROSS-REF          [5] VECTORIZE          [6] UPLOAD               │
│  ────────────────────────────────────────────────────────────────────── │
│  Match ISRCs to    ───▶ Generate audio    ───▶ Upload to               │
│  MusicBrainz            feature vectors        Cloudflare               │
│                                                                          │
│  [7] INDEX              [8] MINE               [9] VERIFY               │
│  ────────────────────────────────────────────────────────────────────── │
│  Create D1         ───▶ Playlist co-      ───▶ Integration             │
│  indexes                occurrence              tests                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Import Scripts

```typescript
// scripts/import-spotify-metadata.ts

interface ImportConfig {
  sourceDir: string;           // Path to extracted SQLite files
  r2Bucket: string;            // R2 bucket for database storage
  d1Database: string;          // D1 database for hot data
  vectorizeIndex: string;      // Vectorize index name
  batchSize: number;           // Records per batch
  skipExisting: boolean;       // Resume interrupted imports
}

async function importSpotifyMetadata(config: ImportConfig): Promise<void> {
  console.log('Starting Spotify metadata import...');

  // Phase 1: Upload SQLite databases to R2
  await uploadDatabases(config);

  // Phase 2: Build ISRC cross-reference
  await buildCrossReference(config);

  // Phase 3: Cache hot audio features in D1
  await cacheHotFeatures(config);

  // Phase 4: Generate and upload vectors
  await vectorizeAudioFeatures(config);

  // Phase 5: Mine playlist co-occurrence
  await mineCooccurrence(config);

  // Phase 6: Verify import
  await verifyImport(config);

  console.log('Import complete!');
}

async function vectorizeAudioFeatures(config: ImportConfig): Promise<void> {
  const db = await openR2Database(config.r2Bucket, 'spotify_audio_features.db');
  const vectorize = await getVectorizeIndex(config.vectorizeIndex);

  let processed = 0;
  const BATCH_SIZE = 1000;

  for await (const batch of streamBatches(db, 'audio_features', BATCH_SIZE)) {
    const vectors = batch.map(row => ({
      id: row.id,
      values: normalizeAudioFeatures(row),
      metadata: {
        isrc: row.isrc,
        title: row.title,
        artist: row.artist,
        popularity: row.popularity
      }
    }));

    await vectorize.upsert(vectors);
    processed += batch.length;

    if (processed % 100000 === 0) {
      console.log(`Vectorized ${processed.toLocaleString()} tracks...`);
    }
  }
}
```

### Resource Requirements

| Phase | CPU | Memory | Time Estimate |
|-------|-----|--------|---------------|
| Download | Low | Low | 1-4 hours (depends on bandwidth) |
| Decompress | Medium | Medium | 2-4 hours |
| Cross-reference | High | High | 8-24 hours |
| Vectorize | High | Medium | 24-48 hours |
| Co-occurrence mining | High | Very High | 48-72 hours |
| Upload to Cloudflare | Low | Low | 4-8 hours |

**Recommended:** Run on a dedicated machine with 32GB+ RAM, SSD storage

---

## Operational Considerations

### Freshness Strategy

The dataset has a July 2025 cutoff. Options for handling new releases:

1. **Accept staleness:** For catalog music, 6-month delay is acceptable
2. **Hybrid approach:** Use Spotify API for tracks not in dataset (requires Spotify API access)
3. **Periodic updates:** If Anna's Archive releases updates, re-run import
4. **Fallback chain:** Spotify metadata → MusicBrainz → Last.fm

### Query Patterns

```typescript
// Hot path: Get audio features for a track
async function getAudioFeatures(trackId: string): Promise<AudioFeatures | null> {
  // Try D1 cache first (hot data)
  const cached = await d1.prepare(
    'SELECT * FROM spotify_audio_features_cache WHERE spotify_id = ?'
  ).bind(trackId).first();

  if (cached) return cached as AudioFeatures;

  // Fall back to R2 SQLite (cold data)
  const db = await getR2Database('spotify_audio_features.db');
  const result = await db.prepare(
    'SELECT * FROM audio_features WHERE id = ?'
  ).bind(trackId).first();

  if (result) {
    // Warm the cache
    await cacheAudioFeatures(trackId, result);
  }

  return result as AudioFeatures | null;
}

// Vector similarity search
async function findSimilarByAudioFeatures(
  seedFeatures: AudioFeatures,
  limit: number = 50
): Promise<SimilarTrack[]> {
  const seedVector = normalizeAudioFeatures(seedFeatures);

  const results = await vectorize.query(seedVector, {
    topK: limit,
    returnMetadata: true
  });

  return results.matches.map(match => ({
    spotifyId: match.id,
    similarity: match.score,
    ...match.metadata
  }));
}
```

### Monitoring

Key metrics to track:

- D1 cache hit rate
- R2 query latency
- Vectorize query latency
- Cross-reference match rate
- Pipeline scoring distribution

---

## Legal & Ethical Notes

### Data Provenance

The Anna's Archive dataset was obtained by scraping Spotify's API and downloading audio files. This raises legal and ethical considerations:

1. **Copyright:** Track metadata may be protected; audio files definitely are
2. **Terms of Service:** Scraping violates Spotify's ToS
3. **GDPR:** Playlist data may contain user information

### Recommended Usage

| Use Case | Recommendation |
|----------|----------------|
| Internal similarity matching | ✅ Acceptable |
| Displaying Spotify branding | ❌ Avoid |
| Redistributing data | ❌ Do not |
| Commercial playlist features | ⚠️ Consult legal |
| Research/analysis | ✅ Acceptable |

### Mitigation Strategies

1. **No Spotify branding:** Never display Spotify logos or claim Spotify affiliation
2. **Metadata only:** Focus on audio features and relationships, not raw data display
3. **Fallback sources:** Prefer MusicBrainz/Last.fm for user-facing metadata
4. **Internal use:** Treat as internal scoring enhancement, not primary data source

---

## Implementation Phases

### Phase 0: Research & Acquisition

- [ ] Download metadata torrents from Anna's Archive
- [ ] Verify data integrity with provided checksums
- [ ] Document exact file inventory and sizes
- [ ] Set up local development environment with SQLite tools
- [ ] Explore database schemas and sample data

### Phase 1: Storage Setup

- [ ] Create R2 bucket for SQLite databases
- [ ] Create D1 tables for hot data and cross-references
- [ ] Create Vectorize index for audio features
- [ ] Write upload scripts for R2
- [ ] Test query patterns against R2-hosted SQLite

### Phase 2: Cross-Reference Building

- [ ] Download MusicBrainz ISRC dump (or use API)
- [ ] Build ISRC → MBID lookup table
- [ ] Run cross-reference matching pipeline
- [ ] Analyze match rates and quality
- [ ] Store results in D1

### Phase 3: Audio Feature Integration

- [ ] Implement audio feature normalization
- [ ] Generate vectors for all tracks with features
- [ ] Upload to Vectorize in batches
- [ ] Implement similarity query functions
- [ ] Integrate into candidate generation pipeline

### Phase 4: Playlist Mining

- [ ] Implement co-occurrence mining algorithm
- [ ] Run on playlist dataset (resource-intensive)
- [ ] Store significant pairs in D1
- [ ] Implement co-occurrence score function
- [ ] Integrate into similarity scoring

### Phase 5: Pipeline Integration

- [ ] Update Track Enricher to fetch Spotify features
- [ ] Update Candidate Generator with new sources
- [ ] Update Similarity Scorer with new dimensions
- [ ] Adjust scoring weights based on testing
- [ ] A/B test old vs new pipeline

### Phase 6: Optimization & Launch

- [ ] Implement D1 caching for hot tracks
- [ ] Optimize query patterns
- [ ] Monitor performance and costs
- [ ] Document operational procedures
- [ ] Deploy to production

---

## Appendix A: Sample Queries

### Find tracks similar by audio features

```sql
-- Given a seed track's audio features, this is handled by Vectorize
-- But for ad-hoc analysis, you can query R2 SQLite:

SELECT
  t.id,
  t.name,
  a.name as artist,
  af.tempo,
  af.energy,
  af.valence,
  -- Simple Euclidean distance (not cosine, for demo)
  SQRT(
    POWER(af.tempo - :seed_tempo, 2) +
    POWER(af.energy - :seed_energy, 2) +
    POWER(af.valence - :seed_valence, 2)
  ) as distance
FROM audio_features af
JOIN tracks t ON t.id = af.id
JOIN artists a ON a.id = JSON_EXTRACT(t.artist_ids, '$[0]')
ORDER BY distance ASC
LIMIT 50;
```

### Find tracks that co-occur in playlists

```sql
SELECT
  t.name as track_name,
  a.name as artist_name,
  pc.cooccurrence_count,
  pc.pmi_score,
  pc.jaccard_score
FROM playlist_cooccurrence pc
JOIN tracks t ON t.id = CASE
  WHEN pc.track_a = :seed_track THEN pc.track_b
  ELSE pc.track_a
END
JOIN artists a ON a.id = JSON_EXTRACT(t.artist_ids, '$[0]')
WHERE pc.track_a = :seed_track OR pc.track_b = :seed_track
ORDER BY pc.pmi_score DESC
LIMIT 50;
```

### Cross-reference Spotify to MusicBrainz

```sql
SELECT
  x.spotify_id,
  x.isrc,
  x.mbid,
  x.match_confidence,
  st.name as spotify_title,
  st.popularity
FROM spotify_mbid_xref x
JOIN tracks st ON st.id = x.spotify_id
WHERE x.mbid IS NOT NULL
  AND x.match_confidence > 0.9
ORDER BY st.popularity DESC
LIMIT 100;
```

---

## Appendix B: Audio Feature Normalization Reference

```typescript
function normalizeAudioFeatures(features: AudioFeatures): number[] {
  return [
    // Tempo: typical range 60-200, normalize to 0-1
    Math.max(0, Math.min(1, (features.tempo - 60) / 140)),

    // Energy: already 0-1
    features.energy,

    // Danceability: already 0-1
    features.danceability,

    // Valence: already 0-1
    features.valence,

    // Acousticness: already 0-1
    features.acousticness,

    // Instrumentalness: already 0-1
    features.instrumentalness,

    // Speechiness: already 0-1
    features.speechiness,

    // Liveness: already 0-1
    features.liveness,

    // Loudness: typical range -60 to 0, normalize to 0-1
    Math.max(0, Math.min(1, (features.loudness + 60) / 60)),

    // Key: 0-11, normalize to 0-1
    features.key / 11,

    // Mode: 0 or 1
    features.mode,

    // Time signature: typical range 3-7, normalize to 0-1
    Math.max(0, Math.min(1, (features.time_signature - 3) / 4)),

    // Popularity: 0-100, normalize to 0-1
    features.popularity / 100
  ];
}
```

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **ISRC** | International Standard Recording Code - unique identifier for recordings |
| **MBID** | MusicBrainz Identifier - UUID for MusicBrainz entities |
| **PMI** | Pointwise Mutual Information - measures association strength |
| **Jaccard** | Jaccard similarity coefficient - intersection over union |
| **Valence** | Spotify's measure of musical positiveness (0=sad, 1=happy) |
| **Danceability** | How suitable a track is for dancing (rhythm, tempo, beat strength) |
| **Vectorize** | Cloudflare's vector database service |

---

*End of Specification*

*Related: [grovemusic-spec.md](./grovemusic-spec.md)*
