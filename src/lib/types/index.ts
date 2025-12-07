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
