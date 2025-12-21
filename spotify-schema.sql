-- GroveMusic Spotify Metadata D1 Schema
-- Apply with: wrangler d1 execute grovemusic-spotify-cache --file=spotify-schema.sql
-- This schema is for the dedicated SpotifyCache D1 database

-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-Reference: Spotify ↔ MusicBrainz
-- Maps Spotify track IDs to MusicBrainz recording IDs via ISRC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spotify_mbid_xref (
  spotify_id TEXT PRIMARY KEY,           -- Spotify base62 track ID
  isrc TEXT NOT NULL,                    -- International Standard Recording Code
  mbid TEXT,                             -- MusicBrainz Recording ID (nullable if no match)
  match_confidence REAL,                 -- 0.0-1.0 confidence score
  match_method TEXT,                     -- 'isrc_exact', 'isrc_fuzzy', 'metadata_match', 'no_match'
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_xref_isrc ON spotify_mbid_xref(isrc);
CREATE INDEX IF NOT EXISTS idx_xref_mbid ON spotify_mbid_xref(mbid);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cached Audio Features
-- Hot cache for frequently accessed Spotify audio features
-- Populated on-demand from R2 partitioned databases
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spotify_audio_features_cache (
  spotify_id TEXT PRIMARY KEY,
  tempo REAL,                            -- BPM (typically 60-200)
  time_signature INTEGER,                -- Beats per bar (typically 3-7)
  key INTEGER,                           -- Pitch class (0-11, where 0=C)
  mode INTEGER,                          -- Major (1) or Minor (0)
  loudness REAL,                         -- dB (typically -60 to 0)
  energy REAL,                           -- 0.0-1.0: Intensity and activity
  danceability REAL,                     -- 0.0-1.0: Suitability for dancing
  speechiness REAL,                      -- 0.0-1.0: Presence of spoken words
  acousticness REAL,                     -- 0.0-1.0: Acoustic vs electronic
  instrumentalness REAL,                 -- 0.0-1.0: Lack of vocals
  liveness REAL,                         -- 0.0-1.0: Live audience presence
  valence REAL,                          -- 0.0-1.0: Musical positiveness
  duration_ms INTEGER,                   -- Track duration in milliseconds
  popularity INTEGER,                    -- 0-100 at time of snapshot
  cached_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audio_popularity ON spotify_audio_features_cache(popularity);

-- ─────────────────────────────────────────────────────────────────────────────
-- Playlist Co-occurrence Scores
-- Precomputed from playlist mining (PMI and Jaccard scores)
-- Track pairs are stored with track_a < track_b (alphabetically)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS playlist_cooccurrence (
  track_a TEXT NOT NULL,                 -- Spotify ID (lower alphabetically)
  track_b TEXT NOT NULL,                 -- Spotify ID (higher alphabetically)
  cooccurrence_count INTEGER,            -- Number of playlists containing both
  pmi_score REAL,                        -- Pointwise Mutual Information
  jaccard_score REAL,                    -- Jaccard similarity coefficient
  PRIMARY KEY (track_a, track_b)
);

CREATE INDEX IF NOT EXISTS idx_cooccur_a ON playlist_cooccurrence(track_a);
CREATE INDEX IF NOT EXISTS idx_cooccur_b ON playlist_cooccurrence(track_b);

-- ─────────────────────────────────────────────────────────────────────────────
-- Artist Genre Mappings
-- Spotify artist genres for genre-based filtering
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spotify_artist_genres (
  spotify_artist_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  PRIMARY KEY (spotify_artist_id, genre)
);

CREATE INDEX IF NOT EXISTS idx_genre ON spotify_artist_genres(genre);

-- ─────────────────────────────────────────────────────────────────────────────
-- Track Access Log
-- Tracks query frequency for dynamic promotion to Vectorize
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS track_access_log (
  spotify_id TEXT PRIMARY KEY,
  access_count INTEGER DEFAULT 1,
  last_accessed INTEGER,                 -- Unix timestamp
  vectorized INTEGER DEFAULT 0,          -- 1 if promoted to Vectorize
  promoted_at INTEGER                    -- When promoted to Vectorize
);

CREATE INDEX IF NOT EXISTS idx_access_promotion ON track_access_log(access_count, vectorized);
CREATE INDEX IF NOT EXISTS idx_access_last ON track_access_log(last_accessed);

-- ─────────────────────────────────────────────────────────────────────────────
-- Precomputed Similarity Cache
-- Top N similar tracks for popular seed tracks (skip Vectorize query)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS precomputed_similar (
  seed_spotify_id TEXT NOT NULL,
  similar_spotify_id TEXT NOT NULL,
  similarity_score REAL,
  rank INTEGER,                          -- 1 = most similar
  PRIMARY KEY (seed_spotify_id, similar_spotify_id)
);

CREATE INDEX IF NOT EXISTS idx_precomputed_seed ON precomputed_similar(seed_spotify_id, rank);

-- ─────────────────────────────────────────────────────────────────────────────
-- Track Metadata Cache
-- Basic track info for quick lookups without R2 fetch
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spotify_tracks_cache (
  spotify_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_id TEXT,
  album_name TEXT,
  album_id TEXT,
  isrc TEXT,
  release_year INTEGER,
  duration_ms INTEGER,
  popularity INTEGER,
  cached_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON spotify_tracks_cache(isrc);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON spotify_tracks_cache(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_popularity ON spotify_tracks_cache(popularity);
