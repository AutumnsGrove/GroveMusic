-- GroveMusic D1 Database Schema
-- Apply with: wrangler d1 execute grovemusic-db --file=schema.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Users Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
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
  subscription_expires_at TEXT,           -- ISO timestamp
  stripe_customer_id TEXT,

  -- Preferences (JSON)
  preferences TEXT DEFAULT '{}',

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Runs Table (Playlist Generation History)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
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
  cache_hit INTEGER DEFAULT 0,            -- SQLite uses INTEGER for boolean
  error_message TEXT,

  -- Storage reference
  r2_key TEXT,                            -- Path in R2 for full archive

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks Table (Deduplicated Cache)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- User Preferences Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),

  -- Listening profile (built over time)
  favorite_tags TEXT DEFAULT '[]',        -- JSON array
  favorite_artists TEXT DEFAULT '[]',     -- JSON array
  era_preference TEXT DEFAULT '{}',       -- JSON {start: 1990, end: 2024}

  -- UI preferences
  default_playlist_size INTEGER DEFAULT 15,
  default_output_format TEXT DEFAULT 'both', -- 'json', 'markdown', 'both'

  updated_at TEXT DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Credit Transactions (Audit Log)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,                -- Positive = add, negative = deduct
  type TEXT NOT NULL,                     -- 'subscription', 'purchase', 'use', 'refund'
  run_id TEXT REFERENCES runs(id),
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
