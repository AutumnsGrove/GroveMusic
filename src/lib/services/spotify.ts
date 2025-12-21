/**
 * Spotify Metadata Service
 * Handles audio features, cross-references, and similarity queries
 * using partitioned SQLite databases stored in R2.
 */

import type {
	AudioFeatures,
	CrossRefResult,
	SimilarTrack,
	CooccurrenceData
} from '$lib/types';
import {
	CACHE_KEYS,
	CACHE_TTLS,
	normalizeAudioFeatures,
	cosineSimilarity
} from '$lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Spotify track metadata from R2 database */
interface SpotifyTrackMetadata {
	spotifyId: string;
	title: string;
	artistName: string;
	artistId: string;
	albumName?: string;
	albumId?: string;
	isrc?: string;
	releaseYear?: number;
	durationMs?: number;
	popularity?: number;
}

/** Configuration for the Spotify metadata service */
interface SpotifyServiceConfig {
	/** D1 database for hot cache */
	db: D1Database;
	/** KV namespace for edge caching */
	kv: KVNamespace;
	/** R2 bucket for partitioned SQLite databases */
	storage: R2Bucket;
	/** Vectorize index for audio feature similarity (optional) */
	vectors?: VectorizeIndex;
}

/** Result of a batch audio features fetch */
interface BatchFetchResult {
	found: Map<string, AudioFeatures>;
	missing: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Partition Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the R2 partition key for a Spotify ID.
 * Uses first 2 characters of base62 ID to distribute across ~3,844 partitions.
 */
export function getPartitionKey(spotifyId: string): string {
	return spotifyId.slice(0, 2).toLowerCase();
}

/**
 * Get the R2 object path for a specific partition.
 */
export function getPartitionPath(
	dataType: 'audio_features' | 'tracks' | 'albums' | 'playlists',
	spotifyId: string
): string {
	const partition = getPartitionKey(spotifyId);
	return `${dataType}/${partition}.db`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotify Metadata Service
// ─────────────────────────────────────────────────────────────────────────────

export class SpotifyMetadataService {
	private db: D1Database;
	private kv: KVNamespace;
	private storage: R2Bucket;
	private vectors?: VectorizeIndex;

	/** Request-level cache to deduplicate within a single request */
	private requestCache = new Map<string, AudioFeatures>();

	constructor(config: SpotifyServiceConfig) {
		this.db = config.db;
		this.kv = config.kv;
		this.storage = config.storage;
		this.vectors = config.vectors;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Audio Features
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get audio features for a Spotify track.
	 * Uses 4-layer cache: request → KV → D1 → R2
	 */
	async getAudioFeatures(spotifyId: string): Promise<AudioFeatures | null> {
		// Layer 0: Request-level cache
		if (this.requestCache.has(spotifyId)) {
			return this.requestCache.get(spotifyId)!;
		}

		// Layer 1: KV edge cache
		const kvKey = CACHE_KEYS.spotifyAudioFeatures(spotifyId);
		const kvResult = await this.kv.get(kvKey, { type: 'json' });
		if (kvResult) {
			const features = kvResult as AudioFeatures;
			this.requestCache.set(spotifyId, features);
			return features;
		}

		// Layer 2: D1 hot cache
		const d1Result = await this.db
			.prepare(
				`SELECT spotify_id, tempo, time_signature, key, mode, loudness,
				        energy, danceability, speechiness, acousticness,
				        instrumentalness, liveness, valence, duration_ms, popularity
				 FROM spotify_audio_features_cache
				 WHERE spotify_id = ?`
			)
			.bind(spotifyId)
			.first();

		if (d1Result) {
			const features = this.rowToAudioFeatures(d1Result);
			// Promote to KV for faster future access
			await this.kv.put(kvKey, JSON.stringify(features), {
				expirationTtl: CACHE_TTLS.spotifyAudioFeatures
			});
			this.requestCache.set(spotifyId, features);
			return features;
		}

		// Layer 3: R2 cold storage (partitioned databases)
		const features = await this.fetchAudioFeaturesFromR2(spotifyId);
		if (features) {
			// Record access for potential promotion (fire-and-forget)
			this.recordAccess(spotifyId).catch(() => {
				// Swallow errors - access logging is best-effort
			});

			// Cache in D1 and KV for future requests
			await Promise.all([
				this.cacheAudioFeaturesInD1(spotifyId, features),
				this.kv.put(kvKey, JSON.stringify(features), {
					expirationTtl: CACHE_TTLS.spotifyAudioFeatures
				})
			]);

			this.requestCache.set(spotifyId, features);
		}

		return features;
	}

	/**
	 * Batch fetch audio features for multiple tracks.
	 * Groups by partition to minimize R2 fetches.
	 */
	async batchGetAudioFeatures(spotifyIds: string[]): Promise<BatchFetchResult> {
		const found = new Map<string, AudioFeatures>();
		const toFetch: string[] = [];

		// Check request cache first
		for (const id of spotifyIds) {
			if (this.requestCache.has(id)) {
				found.set(id, this.requestCache.get(id)!);
			} else {
				toFetch.push(id);
			}
		}

		if (toFetch.length === 0) {
			return { found, missing: [] };
		}

		// Check KV cache in parallel
		const kvKeys = toFetch.map((id) => CACHE_KEYS.spotifyAudioFeatures(id));
		const kvResults = await Promise.all(
			kvKeys.map((key) => this.kv.get(key, { type: 'json' }))
		);

		const stillMissing: string[] = [];
		kvResults.forEach((result, i) => {
			if (result) {
				const features = result as AudioFeatures;
				found.set(toFetch[i], features);
				this.requestCache.set(toFetch[i], features);
			} else {
				stillMissing.push(toFetch[i]);
			}
		});

		if (stillMissing.length === 0) {
			return { found, missing: [] };
		}

		// Check D1 cache
		const placeholders = stillMissing.map(() => '?').join(',');
		const d1Results = await this.db
			.prepare(
				`SELECT spotify_id, tempo, time_signature, key, mode, loudness,
				        energy, danceability, speechiness, acousticness,
				        instrumentalness, liveness, valence, duration_ms, popularity
				 FROM spotify_audio_features_cache
				 WHERE spotify_id IN (${placeholders})`
			)
			.bind(...stillMissing)
			.all();

		const afterD1: string[] = [];
		const d1FoundIds = new Set<string>();

		if (d1Results.results) {
			for (const row of d1Results.results) {
				const features = this.rowToAudioFeatures(row);
				found.set(features.spotifyId, features);
				this.requestCache.set(features.spotifyId, features);
				d1FoundIds.add(features.spotifyId);
			}
		}

		for (const id of stillMissing) {
			if (!d1FoundIds.has(id)) {
				afterD1.push(id);
			}
		}

		// Return what we have - R2 fetch would happen on individual requests
		// For batch operations, we don't fetch from R2 to avoid memory pressure
		return { found, missing: afterD1 };
	}

	/**
	 * Fetch audio features from R2 partitioned database.
	 * This is a placeholder - actual implementation requires sql.js or similar.
	 */
	private async fetchAudioFeaturesFromR2(
		spotifyId: string
	): Promise<AudioFeatures | null> {
		const partitionPath = getPartitionPath('audio_features', spotifyId);
		const dbFile = await this.storage.get(partitionPath);

		if (!dbFile) {
			// Partition not yet uploaded - this is expected before data import
			return null;
		}

		// TODO: Implement sql.js loading when partitions are available
		// For now, return null to indicate data not yet available
		//
		// Implementation would be:
		// const SQL = await initSqlJs();
		// const buffer = await dbFile.arrayBuffer();
		// const db = new SQL.Database(new Uint8Array(buffer));
		// const stmt = db.prepare('SELECT * FROM audio_features WHERE id = ?');
		// stmt.bind([spotifyId]);
		// if (stmt.step()) { ... }
		// db.close();

		console.log(
			`[SpotifyService] R2 partition exists but sql.js not implemented: ${partitionPath}`
		);
		return null;
	}

	/**
	 * Cache audio features in D1 for faster future access.
	 */
	private async cacheAudioFeaturesInD1(
		spotifyId: string,
		features: AudioFeatures
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT OR REPLACE INTO spotify_audio_features_cache
				 (spotify_id, tempo, time_signature, key, mode, loudness,
				  energy, danceability, speechiness, acousticness,
				  instrumentalness, liveness, valence, duration_ms, popularity, cached_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
			)
			.bind(
				spotifyId,
				features.tempo,
				features.timeSignature,
				features.key,
				features.mode,
				features.loudness,
				features.energy,
				features.danceability,
				features.speechiness,
				features.acousticness,
				features.instrumentalness,
				features.liveness,
				features.valence,
				features.durationMs ?? null,
				features.popularity ?? null
			)
			.run();
	}

	/**
	 * Convert D1 row to AudioFeatures interface.
	 */
	private rowToAudioFeatures(row: Record<string, unknown>): AudioFeatures {
		return {
			spotifyId: row.spotify_id as string,
			tempo: row.tempo as number,
			timeSignature: row.time_signature as number,
			key: row.key as number,
			mode: row.mode as number,
			loudness: row.loudness as number,
			energy: row.energy as number,
			danceability: row.danceability as number,
			speechiness: row.speechiness as number,
			acousticness: row.acousticness as number,
			instrumentalness: row.instrumentalness as number,
			liveness: row.liveness as number,
			valence: row.valence as number,
			durationMs: row.duration_ms as number | undefined,
			popularity: row.popularity as number | undefined
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Cross-Reference (Spotify ↔ MusicBrainz)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get MusicBrainz ID for a Spotify track via ISRC lookup.
	 */
	async getCrossRef(spotifyId: string): Promise<CrossRefResult | null> {
		// Check KV cache first
		const kvKey = CACHE_KEYS.spotifyCrossRef(spotifyId);
		const cached = await this.kv.get(kvKey, { type: 'json' });
		if (cached) {
			return cached as CrossRefResult;
		}

		// Check D1
		const row = await this.db
			.prepare(
				`SELECT spotify_id, isrc, mbid, match_confidence, match_method
				 FROM spotify_mbid_xref
				 WHERE spotify_id = ?`
			)
			.bind(spotifyId)
			.first();

		if (row) {
			const result: CrossRefResult = {
				spotifyId: row.spotify_id as string,
				isrc: row.isrc as string,
				mbid: row.mbid as string | null,
				confidence: row.match_confidence as number,
				method: row.match_method as CrossRefResult['method']
			};

			// Cache in KV
			await this.kv.put(kvKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.spotifyCrossRef
			});

			return result;
		}

		return null;
	}

	/**
	 * Look up Spotify ID by ISRC.
	 */
	async getSpotifyIdByIsrc(isrc: string): Promise<string | null> {
		// Check KV cache
		const kvKey = CACHE_KEYS.spotifyIsrcLookup(isrc);
		const cached = await this.kv.get(kvKey);
		if (cached) {
			return cached;
		}

		// Check D1
		const row = await this.db
			.prepare('SELECT spotify_id FROM spotify_mbid_xref WHERE isrc = ?')
			.bind(isrc)
			.first();

		if (row) {
			const spotifyId = row.spotify_id as string;
			await this.kv.put(kvKey, spotifyId, {
				expirationTtl: CACHE_TTLS.spotifyIsrcLookup
			});
			return spotifyId;
		}

		return null;
	}

	/**
	 * Store a cross-reference result.
	 */
	async storeCrossRef(result: CrossRefResult): Promise<void> {
		await this.db
			.prepare(
				`INSERT OR REPLACE INTO spotify_mbid_xref
				 (spotify_id, isrc, mbid, match_confidence, match_method, updated_at)
				 VALUES (?, ?, ?, ?, ?, unixepoch())`
			)
			.bind(
				result.spotifyId,
				result.isrc,
				result.mbid,
				result.confidence,
				result.method
			)
			.run();

		// Update KV cache
		const kvKey = CACHE_KEYS.spotifyCrossRef(result.spotifyId);
		await this.kv.put(kvKey, JSON.stringify(result), {
			expirationTtl: CACHE_TTLS.spotifyCrossRef
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Audio Feature Similarity
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Find similar tracks by audio features.
	 * Uses Vectorize if available, otherwise computes similarity directly.
	 */
	async findSimilarByAudioFeatures(
		spotifyId: string,
		limit: number = 50
	): Promise<SimilarTrack[]> {
		// Check precomputed cache first
		const kvKey = CACHE_KEYS.spotifyTopSimilar(spotifyId);
		const cached = await this.kv.get(kvKey, { type: 'json' });
		if (cached) {
			const results = cached as SimilarTrack[];
			return results.slice(0, limit);
		}

		// Get seed track features
		const seedFeatures = await this.getAudioFeatures(spotifyId);
		if (!seedFeatures) {
			return [];
		}

		// Use Vectorize if available
		if (this.vectors) {
			const vector = normalizeAudioFeatures(seedFeatures);
			const results = await this.vectors.query(vector, {
				topK: limit,
				returnMetadata: 'all'
			});

			return results.matches.map((match) => ({
				spotifyId: match.id,
				similarity: match.score,
				title: match.metadata?.title as string | undefined,
				artist: match.metadata?.artist as string | undefined,
				popularity: match.metadata?.popularity as number | undefined
			}));
		}

		// Fallback: Check precomputed_similar table in D1
		const precomputed = await this.db
			.prepare(
				`SELECT similar_spotify_id, similarity_score
				 FROM precomputed_similar
				 WHERE seed_spotify_id = ?
				 ORDER BY rank
				 LIMIT ?`
			)
			.bind(spotifyId, limit)
			.all();

		if (precomputed.results && precomputed.results.length > 0) {
			return precomputed.results.map((row) => ({
				spotifyId: row.similar_spotify_id as string,
				similarity: row.similarity_score as number
			}));
		}

		// No Vectorize and no precomputed results available
		return [];
	}

	/**
	 * Compute audio feature similarity between two tracks.
	 */
	async computeAudioSimilarity(
		spotifyIdA: string,
		spotifyIdB: string
	): Promise<number> {
		const [featuresA, featuresB] = await Promise.all([
			this.getAudioFeatures(spotifyIdA),
			this.getAudioFeatures(spotifyIdB)
		]);

		if (!featuresA || !featuresB) {
			return 0;
		}

		const vectorA = normalizeAudioFeatures(featuresA);
		const vectorB = normalizeAudioFeatures(featuresB);

		return cosineSimilarity(vectorA, vectorB);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Playlist Co-occurrence
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get co-occurrence data between two tracks.
	 */
	async getCooccurrence(
		spotifyIdA: string,
		spotifyIdB: string
	): Promise<CooccurrenceData | null> {
		// Normalize order (track_a < track_b alphabetically)
		const [trackA, trackB] = [spotifyIdA, spotifyIdB].sort();

		// Check KV cache
		const kvKey = CACHE_KEYS.spotifyCooccurrence(trackA, trackB);
		const cached = await this.kv.get(kvKey, { type: 'json' });
		if (cached) {
			return cached as CooccurrenceData;
		}

		// Check D1
		const row = await this.db
			.prepare(
				`SELECT track_a, track_b, cooccurrence_count, pmi_score, jaccard_score
				 FROM playlist_cooccurrence
				 WHERE track_a = ? AND track_b = ?`
			)
			.bind(trackA, trackB)
			.first();

		if (row) {
			const result: CooccurrenceData = {
				trackA: row.track_a as string,
				trackB: row.track_b as string,
				cooccurrenceCount: row.cooccurrence_count as number,
				pmiScore: row.pmi_score as number,
				jaccardScore: row.jaccard_score as number
			};

			// Cache in KV
			await this.kv.put(kvKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.spotifyCooccurrence
			});

			return result;
		}

		return null;
	}

	/**
	 * Get all co-occurring tracks for a given track.
	 */
	async getCooccurringTracks(
		spotifyId: string,
		limit: number = 50
	): Promise<CooccurrenceData[]> {
		const results = await this.db
			.prepare(
				`SELECT track_a, track_b, cooccurrence_count, pmi_score, jaccard_score
				 FROM playlist_cooccurrence
				 WHERE track_a = ? OR track_b = ?
				 ORDER BY pmi_score DESC
				 LIMIT ?`
			)
			.bind(spotifyId, spotifyId, limit)
			.all();

		if (!results.results) {
			return [];
		}

		return results.results.map((row) => ({
			trackA: row.track_a as string,
			trackB: row.track_b as string,
			cooccurrenceCount: row.cooccurrence_count as number,
			pmiScore: row.pmi_score as number,
			jaccardScore: row.jaccard_score as number
		}));
	}

	/**
	 * Compute a normalized co-occurrence score (0-1) for similarity scoring.
	 * Uses PMI score with sigmoid normalization.
	 */
	async computeCooccurrenceScore(
		spotifyIdA: string,
		spotifyIdB: string
	): Promise<number> {
		const data = await this.getCooccurrence(spotifyIdA, spotifyIdB);
		if (!data) {
			return 0;
		}

		// PMI typically ranges from -inf to +inf
		// We use sigmoid to normalize to 0-1, with PMI=0 → 0.5
		// PMI > 0 means tracks co-occur more than random
		// We shift so PMI=2 → ~0.88, PMI=4 → ~0.98
		const sigmoidPmi = 1 / (1 + Math.exp(-data.pmiScore));

		// Also factor in Jaccard (already 0-1)
		// Weight PMI more heavily as it's a better signal
		return sigmoidPmi * 0.7 + data.jaccardScore * 0.3;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Track Access Logging (for dynamic promotion)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Record a track access for potential Vectorize promotion.
	 * This is called fire-and-forget from the hot path.
	 */
	async recordAccess(spotifyId: string): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO track_access_log (spotify_id, access_count, last_accessed)
				 VALUES (?, 1, unixepoch())
				 ON CONFLICT(spotify_id) DO UPDATE SET
				   access_count = access_count + 1,
				   last_accessed = unixepoch()`
			)
			.bind(spotifyId)
			.run();
	}

	/**
	 * Get tracks that should be promoted to Vectorize.
	 * Called by the promotion cron job.
	 */
	async getPromotionCandidates(
		accessThreshold: number = 3,
		limit: number = 1000
	): Promise<Array<{ spotifyId: string; accessCount: number }>> {
		const results = await this.db
			.prepare(
				`SELECT tal.spotify_id, tal.access_count
				 FROM track_access_log tal
				 JOIN spotify_audio_features_cache saf ON saf.spotify_id = tal.spotify_id
				 WHERE tal.access_count >= ? AND tal.vectorized = 0
				 ORDER BY tal.access_count DESC
				 LIMIT ?`
			)
			.bind(accessThreshold, limit)
			.all();

		if (!results.results) {
			return [];
		}

		return results.results.map((row) => ({
			spotifyId: row.spotify_id as string,
			accessCount: row.access_count as number
		}));
	}

	/**
	 * Mark tracks as promoted to Vectorize.
	 */
	async markAsVectorized(spotifyIds: string[]): Promise<void> {
		if (spotifyIds.length === 0) return;

		const placeholders = spotifyIds.map(() => '?').join(',');
		await this.db
			.prepare(
				`UPDATE track_access_log
				 SET vectorized = 1, promoted_at = unixepoch()
				 WHERE spotify_id IN (${placeholders})`
			)
			.bind(...spotifyIds)
			.run();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Track Metadata
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get track metadata from cache.
	 */
	async getTrackMetadata(
		spotifyId: string
	): Promise<SpotifyTrackMetadata | null> {
		const row = await this.db
			.prepare(
				`SELECT spotify_id, title, artist_name, artist_id, album_name,
				        album_id, isrc, release_year, duration_ms, popularity
				 FROM spotify_tracks_cache
				 WHERE spotify_id = ?`
			)
			.bind(spotifyId)
			.first();

		if (!row) {
			return null;
		}

		return {
			spotifyId: row.spotify_id as string,
			title: row.title as string,
			artistName: row.artist_name as string,
			artistId: row.artist_id as string,
			albumName: row.album_name as string | undefined,
			albumId: row.album_id as string | undefined,
			isrc: row.isrc as string | undefined,
			releaseYear: row.release_year as number | undefined,
			durationMs: row.duration_ms as number | undefined,
			popularity: row.popularity as number | undefined
		};
	}

	/**
	 * Cache track metadata.
	 */
	async cacheTrackMetadata(track: SpotifyTrackMetadata): Promise<void> {
		await this.db
			.prepare(
				`INSERT OR REPLACE INTO spotify_tracks_cache
				 (spotify_id, title, artist_name, artist_id, album_name,
				  album_id, isrc, release_year, duration_ms, popularity, cached_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
			)
			.bind(
				track.spotifyId,
				track.title,
				track.artistName,
				track.artistId,
				track.albumName ?? null,
				track.albumId ?? null,
				track.isrc ?? null,
				track.releaseYear ?? null,
				track.durationMs ?? null,
				track.popularity ?? null
			)
			.run();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Artist Genres
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get genres for a Spotify artist.
	 */
	async getArtistGenres(artistId: string): Promise<string[]> {
		const results = await this.db
			.prepare(
				'SELECT genre FROM spotify_artist_genres WHERE spotify_artist_id = ?'
			)
			.bind(artistId)
			.all();

		if (!results.results) {
			return [];
		}

		return results.results.map((row) => row.genre as string);
	}

	/**
	 * Store artist genres.
	 */
	async storeArtistGenres(artistId: string, genres: string[]): Promise<void> {
		if (genres.length === 0) return;

		// Use batch insert
		const statements = genres.map((genre) =>
			this.db
				.prepare(
					`INSERT OR IGNORE INTO spotify_artist_genres
					 (spotify_artist_id, genre) VALUES (?, ?)`
				)
				.bind(artistId, genre)
		);

		await this.db.batch(statements);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Utility
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Clear request-level cache.
	 * Call this at the end of a request to free memory.
	 */
	clearRequestCache(): void {
		this.requestCache.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a SpotifyMetadataService from platform bindings.
 */
export function createSpotifyService(platform: App.Platform): SpotifyMetadataService {
	return new SpotifyMetadataService({
		db: platform.env.SPOTIFY_CACHE,
		kv: platform.env.SPOTIFY_KV,
		storage: platform.env.SPOTIFY_STORAGE,
		vectors: platform.env.SPOTIFY_VECTORS
	});
}
