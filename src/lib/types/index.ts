/**
 * GroveMusic TypeScript Types
 * Derived from grovemusic-spec.md Data Models section
 */

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

/** User input for playlist generation */
export interface SeedTrackInput {
	query: string; // "Song Name by Artist"
	playlistSize: number; // 15-100, default 15
	preferences?: {
		eraRange?: [number, number]; // [1990, 2024]
		moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
		popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Track Types
// ─────────────────────────────────────────────────────────────────────────────

/** Track after resolution from MusicBrainz/Last.fm */
export interface ResolvedTrack {
	mbid: string; // MusicBrainz ID
	title: string;
	artist: string;
	artistMbid: string;
	album?: string;
	albumMbid?: string;
	releaseYear?: number;
	duration?: number; // milliseconds
	lastfmUrl?: string;
	// Future: spotifyId, spotifyFeatures
}

/** Tag with frequency/weight */
export interface Tag {
	name: string;
	count: number; // Frequency/weight from source
	source: 'lastfm' | 'musicbrainz' | 'user';
}

/** Track enriched with metadata */
export interface EnrichedTrack extends ResolvedTrack {
	tags: Tag[];
	similarTracks: string[]; // MBIDs from Last.fm
	similarArtists: string[];
	topListeners?: number;
	playcount?: number;
}

/** Candidate track with similarity scores */
export interface ScoredTrack extends EnrichedTrack {
	scores: {
		tagOverlap: number; // 0-1
		artistSimilarity: number; // 0-1
		temporalProximity: number; // 0-1
		vectorSimilarity: number; // 0-1
		popularityFit: number; // 0-1
		overall: number; // 0-10 weighted composite
	};
	category: 'popular' | 'deep-cut' | 'hidden-gem';
}

/** Final playlist track with explanation */
export interface PlaylistTrack extends ScoredTrack {
	position: number;
	reason: string; // LLM-generated explanation
	flowRole: 'opener' | 'builder' | 'peak' | 'valley' | 'closer' | 'transition';
	similarityScore: number; // 1-10 for user display
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Types
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStatus =
	| 'pending'
	| 'resolving'
	| 'enriching'
	| 'generating'
	| 'scoring'
	| 'curating'
	| 'explaining'
	| 'complete'
	| 'failed';

/** Pipeline execution state (stored in Durable Object) */
export interface PipelineState {
	runId: string;
	userId: string;
	status: PipelineStatus;
	seedTrack: SeedTrackInput;
	resolvedTrack: ResolvedTrack | null;
	candidatePool: EnrichedTrack[];
	scoredCandidates: ScoredTrack[];
	finalPlaylist: PlaylistTrack[];
	progress: number; // 0-100
	error: PipelineError | null;
	startedAt: number;
	completedAt: number | null;
}

export interface PipelineError {
	code: string;
	message: string;
	stage: PipelineStatus;
	retryable: boolean;
}

/** Complete run result */
export interface PlaylistRun {
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

// ─────────────────────────────────────────────────────────────────────────────
// User Types
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'basic' | 'pro';

export interface User {
	id: string;
	googleId: string;
	email: string;
	displayName?: string;
	avatarUrl?: string;
	creditsAvailable: number;
	creditsPending: number;
	creditsUsedTotal: number;
	subscriptionTier: SubscriptionTier;
	subscriptionExpiresAt?: Date;
	createdAt: Date;
	updatedAt: Date;
	lastLoginAt?: Date;
}

export interface UserPreferences {
	userId: string;
	favoriteTags: string[];
	favoriteArtists: string[];
	eraPreference: { start: number; end: number };
	defaultPlaylistSize: number;
	defaultOutputFormat: 'json' | 'markdown' | 'both';
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit System Types
// ─────────────────────────────────────────────────────────────────────────────

export type CreditTransactionType = 'subscription' | 'purchase' | 'use' | 'refund';

export interface CreditTransaction {
	id: string;
	userId: string;
	amount: number; // Positive = add, negative = deduct
	type: CreditTransactionType;
	runId?: string;
	description?: string;
	createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
	tier: SubscriptionTier;
	limits: {
		runsPerDay: number;
		runsPerMinute: number;
		apiCallsPerSecond: number;
	};
}

export const RATE_LIMITS: Record<SubscriptionTier, RateLimitConfig> = {
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

// ─────────────────────────────────────────────────────────────────────────────
// LLM Types
// ─────────────────────────────────────────────────────────────────────────────

export type LLMProvider = 'claude' | 'deepseek' | 'kimi';

export interface LLMConfig {
	provider: LLMProvider;
	model: string;
	apiKey: string;
	maxTokens: number;
	temperature: number;
}

export interface TrackExplanation {
	mbid: string;
	reason: string;
	flowRole: PlaylistTrack['flowRole'];
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateRequest {
	query: string;
	playlistSize?: number;
	preferences?: SeedTrackInput['preferences'];
}

export interface GenerateResponse {
	runId: string;
	status: PipelineStatus;
	creditsReserved: number;
	streamUrl: string;
}

export interface RunStatusResponse {
	runId: string;
	status: PipelineStatus;
	progress: number;
	seedTrack?: ResolvedTrack;
	playlist?: PlaylistTrack[];
	creditsUsed?: number;
	processingTimeMs?: number;
	error?: PipelineError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vectorize Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VectorizeTrackMetadata {
	title: string;
	artist: string;
	year?: number;
	topTags: string[]; // Top 5 tags for filtering
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────────────────────────

/** Calculate credits needed for playlist size */
export function calculateCredits(playlistSize: number): number {
	return Math.ceil(playlistSize / 25);
}

/** Credit costs by playlist size */
export const CREDIT_COSTS: Record<number, number> = {
	15: 1,
	30: 2,
	50: 2,
	75: 3,
	100: 4
};

// ─────────────────────────────────────────────────────────────────────────────
// Spotify Audio Features Types (from spotify-metadata-spec.md)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spotify audio features for a track.
 * All 0-1 features are derived from machine learning models.
 */
export interface AudioFeatures {
	spotifyId: string; // Spotify base62 track ID
	tempo: number; // BPM (typically 60-200)
	timeSignature: number; // Beats per bar (typically 3-7)
	key: number; // Pitch class (0-11, where 0=C, 1=C#, etc.)
	mode: number; // Major (1) or Minor (0)
	loudness: number; // dB (typically -60 to 0)
	energy: number; // 0.0-1.0: Intensity and activity
	danceability: number; // 0.0-1.0: Suitability for dancing
	speechiness: number; // 0.0-1.0: Presence of spoken words
	acousticness: number; // 0.0-1.0: Acoustic vs electronic
	instrumentalness: number; // 0.0-1.0: Lack of vocals
	liveness: number; // 0.0-1.0: Live audience presence
	valence: number; // 0.0-1.0: Musical positiveness (happy vs sad)
	durationMs?: number; // Track duration in milliseconds
	popularity?: number; // 0-100 at time of snapshot
}

/**
 * Result of cross-referencing a Spotify track to MusicBrainz.
 */
export interface CrossRefResult {
	spotifyId: string;
	isrc: string;
	mbid: string | null;
	confidence: number;
	method: 'isrc_exact' | 'isrc_fuzzy' | 'metadata_match' | 'no_match';
}

/**
 * Track similarity result from Vectorize or precomputed cache.
 */
export interface SimilarTrack {
	spotifyId: string;
	similarity: number; // 0-1 cosine similarity
	title?: string;
	artist?: string;
	popularity?: number;
	isrc?: string;
	mbid?: string;
}

/**
 * Playlist co-occurrence data between two tracks.
 */
export interface CooccurrenceData {
	trackA: string; // Spotify ID (lower alphabetically)
	trackB: string; // Spotify ID (higher alphabetically)
	cooccurrenceCount: number; // Number of playlists containing both
	pmiScore: number; // Pointwise Mutual Information
	jaccardScore: number; // Jaccard similarity coefficient
}

/**
 * Enhanced similarity scores including Spotify data.
 */
export interface EnhancedSimilarityScores {
	tagOverlap: number; // 0-1 from Last.fm
	audioFeature: number; // 0-1 from Spotify features
	playlistCooccurrence: number; // 0-1 from playlist mining
	artistSimilarity: number; // 0-1 from Last.fm/MB
	temporalProximity: number; // 0-1 based on release year
	popularityFit: number; // 0-1 based on user preference
}

/**
 * Scoring weights for similarity calculation.
 */
export const SIMILARITY_WEIGHTS = {
	tagOverlap: 0.15,
	audioFeature: 0.25, // Major signal from Spotify
	playlistCooccurrence: 0.25, // Major signal from Spotify
	artistSimilarity: 0.15,
	temporalProximity: 0.1,
	popularityFit: 0.1
} as const;

/**
 * Normalize audio features to a 13-dimensional vector.
 */
export function normalizeAudioFeatures(features: AudioFeatures): number[] {
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
		Math.max(0, Math.min(1, (features.timeSignature - 3) / 4)),
		// Popularity: 0-100, normalize to 0-1
		(features.popularity ?? 50) / 100
	];
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Compute overall similarity score from individual dimensions.
 */
export function computeOverallScore(scores: EnhancedSimilarityScores): number {
	return (
		Object.entries(SIMILARITY_WEIGHTS).reduce(
			(sum, [key, weight]) => sum + scores[key as keyof EnhancedSimilarityScores] * weight,
			0
		) * 10
	); // Scale to 0-10
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Key Patterns
// ─────────────────────────────────────────────────────────────────────────────

export const CACHE_KEYS = {
	// Last.fm cache keys
	lastfmTrack: (mbid: string) => `lastfm:track:${mbid}`,
	lastfmSimilar: (mbid: string) => `lastfm:similar:${mbid}`,
	lastfmArtist: (mbid: string) => `lastfm:artist:${mbid}`,

	// MusicBrainz cache keys
	mbRecording: (mbid: string) => `mb:recording:${mbid}`,
	mbArtist: (mbid: string) => `mb:artist:${mbid}`,

	// Spotify cache keys
	spotifyAudioFeatures: (spotifyId: string) => `spotify:af:${spotifyId}`,
	spotifyCrossRef: (spotifyId: string) => `spotify:xref:${spotifyId}`,
	spotifyIsrcLookup: (isrc: string) => `spotify:isrc:${isrc}`,
	spotifySimilarityResults: (seedId: string, limit: number) => `spotify:sim:${seedId}:${limit}`,
	spotifyCooccurrence: (trackA: string, trackB: string) => {
		const [a, b] = [trackA, trackB].sort();
		return `spotify:cooc:${a}:${b}`;
	},
	spotifyTopSimilar: (trackId: string) => `spotify:topsim:${trackId}`,

	// Query resolution cache
	resolvedQuery: (queryHash: string) => `resolved:${queryHash}`,

	// Rate limiting
	rateLimit: (userId: string, date: string) => `rate:${userId}:${date}`,

	// LLM prompts
	prompt: (name: string) => `prompt:${name}`
} as const;

/** Cache TTLs in seconds */
export const CACHE_TTLS = {
	lastfmTrack: 24 * 60 * 60, // 24 hours
	lastfmSimilar: 7 * 24 * 60 * 60, // 7 days
	lastfmArtist: 24 * 60 * 60, // 24 hours
	mbRecording: 30 * 24 * 60 * 60, // 30 days
	spotifyAudioFeatures: 7 * 24 * 60 * 60, // 7 days
	spotifyCrossRef: 30 * 24 * 60 * 60, // 30 days
	spotifyIsrcLookup: 30 * 24 * 60 * 60, // 30 days
	spotifySimilarityResults: 1 * 60 * 60, // 1 hour
	spotifyCooccurrence: 7 * 24 * 60 * 60, // 7 days
	spotifyTopSimilar: 7 * 24 * 60 * 60, // 7 days
	resolvedQuery: 7 * 24 * 60 * 60, // 7 days
	rateLimit: 24 * 60 * 60, // 24 hours
	prompt: 1 * 60 * 60 // 1 hour
} as const;
