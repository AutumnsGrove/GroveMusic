/**
 * Spotify Track Promotion Worker
 * Runs daily to promote frequently-accessed tracks to Vectorize.
 *
 * This worker is triggered by a cron schedule (3 AM UTC daily).
 * It finds tracks that have been queried 3+ times but not yet
 * vectorized, and promotes them to the Vectorize index for
 * faster similarity searches.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (copied from src/lib/types to avoid path issues in Workers)
// ─────────────────────────────────────────────────────────────────────────────

interface AudioFeatures {
	spotifyId: string;
	tempo: number;
	timeSignature: number;
	key: number;
	mode: number;
	loudness: number;
	energy: number;
	danceability: number;
	speechiness: number;
	acousticness: number;
	instrumentalness: number;
	liveness: number;
	valence: number;
	durationMs?: number;
	popularity?: number;
}

/**
 * Normalize audio features to a 13-dimensional vector.
 */
function normalizeAudioFeatures(features: AudioFeatures): number[] {
	return [
		Math.max(0, Math.min(1, (features.tempo - 60) / 140)),
		features.energy,
		features.danceability,
		features.valence,
		features.acousticness,
		features.instrumentalness,
		features.speechiness,
		features.liveness,
		Math.max(0, Math.min(1, (features.loudness + 60) / 60)),
		features.key / 11,
		features.mode,
		Math.max(0, Math.min(1, (features.timeSignature - 3) / 4)),
		(features.popularity ?? 50) / 100
	];
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment Types
// ─────────────────────────────────────────────────────────────────────────────

interface Env {
	SPOTIFY_CACHE: D1Database;
	SPOTIFY_KV: KVNamespace;
	SPOTIFY_STORAGE: R2Bucket;
	// SPOTIFY_VECTORS: VectorizeIndex; // Uncomment when Vectorize is available
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface PromotionConfig {
	accessThreshold: number; // Minimum queries before promotion (default: 3)
	batchSize: number; // Tracks to promote per run (default: 1000)
	maxVectors: number; // Cap on Vectorize size (default: 20M)
}

const DEFAULT_CONFIG: PromotionConfig = {
	accessThreshold: 3,
	batchSize: 1000,
	maxVectors: 20_000_000
};

// ─────────────────────────────────────────────────────────────────────────────
// Promotion Logic
// ─────────────────────────────────────────────────────────────────────────────

interface PromotionCandidate {
	spotifyId: string;
	accessCount: number;
	tempo: number;
	energy: number;
	danceability: number;
	valence: number;
	acousticness: number;
	instrumentalness: number;
	speechiness: number;
	liveness: number;
	loudness: number;
	key: number;
	mode: number;
	timeSignature: number;
	popularity: number;
}

async function getPromotionCandidates(
	db: D1Database,
	config: PromotionConfig
): Promise<PromotionCandidate[]> {
	const results = await db
		.prepare(
			`SELECT
				tal.spotify_id,
				tal.access_count,
				saf.tempo,
				saf.energy,
				saf.danceability,
				saf.valence,
				saf.acousticness,
				saf.instrumentalness,
				saf.speechiness,
				saf.liveness,
				saf.loudness,
				saf.key,
				saf.mode,
				saf.time_signature,
				saf.popularity
			FROM track_access_log tal
			JOIN spotify_audio_features_cache saf ON saf.spotify_id = tal.spotify_id
			WHERE tal.access_count >= ? AND tal.vectorized = 0
			ORDER BY tal.access_count DESC
			LIMIT ?`
		)
		.bind(config.accessThreshold, config.batchSize)
		.all();

	if (!results.results) {
		return [];
	}

	return results.results.map((row) => ({
		spotifyId: row.spotify_id as string,
		accessCount: row.access_count as number,
		tempo: row.tempo as number,
		energy: row.energy as number,
		danceability: row.danceability as number,
		valence: row.valence as number,
		acousticness: row.acousticness as number,
		instrumentalness: row.instrumentalness as number,
		speechiness: row.speechiness as number,
		liveness: row.liveness as number,
		loudness: row.loudness as number,
		key: row.key as number,
		mode: row.mode as number,
		timeSignature: row.time_signature as number,
		popularity: row.popularity as number
	}));
}

function candidateToAudioFeatures(candidate: PromotionCandidate): AudioFeatures {
	return {
		spotifyId: candidate.spotifyId,
		tempo: candidate.tempo,
		energy: candidate.energy,
		danceability: candidate.danceability,
		valence: candidate.valence,
		acousticness: candidate.acousticness,
		instrumentalness: candidate.instrumentalness,
		speechiness: candidate.speechiness,
		liveness: candidate.liveness,
		loudness: candidate.loudness,
		key: candidate.key,
		mode: candidate.mode,
		timeSignature: candidate.timeSignature,
		popularity: candidate.popularity
	};
}

async function markAsVectorized(
	db: D1Database,
	spotifyIds: string[]
): Promise<void> {
	if (spotifyIds.length === 0) return;

	const placeholders = spotifyIds.map(() => '?').join(',');
	await db
		.prepare(
			`UPDATE track_access_log
			 SET vectorized = 1, promoted_at = unixepoch()
			 WHERE spotify_id IN (${placeholders})`
		)
		.bind(...spotifyIds)
		.run();
}

async function runPromotion(env: Env, config: PromotionConfig): Promise<number> {
	console.log('[SpotifyPromotion] Starting promotion job...');

	// Get candidates for promotion
	const candidates = await getPromotionCandidates(env.SPOTIFY_CACHE, config);
	console.log(`[SpotifyPromotion] Found ${candidates.length} candidates for promotion`);

	if (candidates.length === 0) {
		return 0;
	}

	// Generate vectors for each candidate
	const vectors = candidates.map((candidate) => ({
		id: candidate.spotifyId,
		values: normalizeAudioFeatures(candidateToAudioFeatures(candidate)),
		metadata: {
			popularity: candidate.popularity,
			promoted: true,
			promotedAt: Date.now()
		}
	}));

	// TODO: Upsert to Vectorize when available
	// await env.SPOTIFY_VECTORS.upsert(vectors);
	console.log(`[SpotifyPromotion] Would upsert ${vectors.length} vectors to Vectorize`);
	console.log('[SpotifyPromotion] Vectorize upsert not yet implemented - skipping');

	// For now, just mark as vectorized in D1 to prevent re-processing
	// In production, only mark after successful Vectorize upsert
	const promotedIds = candidates.map((c) => c.spotifyId);
	await markAsVectorized(env.SPOTIFY_CACHE, promotedIds);
	console.log(`[SpotifyPromotion] Marked ${promotedIds.length} tracks as vectorized`);

	return candidates.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean up old access log entries that haven't been accessed recently.
 * This prevents the access log from growing indefinitely.
 */
async function cleanupOldAccessLogs(
	db: D1Database,
	maxAgeDays: number = 90
): Promise<number> {
	const cutoff = Math.floor(Date.now() / 1000) - maxAgeDays * 24 * 60 * 60;

	const result = await db
		.prepare(
			`DELETE FROM track_access_log
			 WHERE last_accessed < ? AND vectorized = 0`
		)
		.bind(cutoff)
		.run();

	return result.meta.changes ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
	/**
	 * Scheduled handler - runs on cron schedule.
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log(`[SpotifyPromotion] Cron triggered at ${new Date().toISOString()}`);
		console.log(`[SpotifyPromotion] Cron ID: ${controller.cron}`);

		try {
			// Run the promotion job
			const promoted = await runPromotion(env, DEFAULT_CONFIG);
			console.log(`[SpotifyPromotion] Promoted ${promoted} tracks to Vectorize`);

			// Clean up old access logs (run after promotion)
			const cleaned = await cleanupOldAccessLogs(env.SPOTIFY_CACHE);
			if (cleaned > 0) {
				console.log(`[SpotifyPromotion] Cleaned up ${cleaned} old access log entries`);
			}
		} catch (error) {
			console.error('[SpotifyPromotion] Error during promotion:', error);
			throw error; // Re-throw to mark the cron execution as failed
		}
	},

	/**
	 * Fetch handler - for manual triggering via HTTP (optional).
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Only allow POST to /run for manual triggering
		if (request.method !== 'POST' || url.pathname !== '/run') {
			return new Response('Not Found', { status: 404 });
		}

		// Simple auth check - require a secret header
		// In production, use proper authentication
		const authHeader = request.headers.get('X-Promotion-Secret');
		if (!authHeader) {
			return new Response('Unauthorized', { status: 401 });
		}

		try {
			const promoted = await runPromotion(env, DEFAULT_CONFIG);
			return new Response(
				JSON.stringify({
					success: true,
					promoted,
					timestamp: new Date().toISOString()
				}),
				{
					headers: { 'Content-Type': 'application/json' }
				}
			);
		} catch (error) {
			console.error('[SpotifyPromotion] Manual run error:', error);
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
	}
};
