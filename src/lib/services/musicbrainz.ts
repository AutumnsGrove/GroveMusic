/**
 * MusicBrainz API Client
 * Handles track/artist lookups with proper rate limiting (1 req/sec).
 */

import type { ResolvedTrack } from '$lib/types';
import { CACHE_KEYS, CACHE_TTLS } from '$lib/types';

const MB_API_URL = 'https://musicbrainz.org/ws/2/';
const USER_AGENT = 'GroveMusic/1.0 (aria.grove.place)';

/** MusicBrainz API response types */
interface MBRecording {
	id: string;
	title: string;
	length?: number;
	'first-release-date'?: string;
	isrcs?: string[];
	'artist-credit': Array<{
		artist: {
			id: string;
			name: string;
			'sort-name': string;
		};
		name: string;
		joinphrase?: string;
	}>;
	releases?: Array<{
		id: string;
		title: string;
		date?: string;
		'release-group'?: {
			id: string;
			'primary-type'?: string;
		};
	}>;
}

interface MBRecordingSearchResult {
	created: string;
	count: number;
	offset: number;
	recordings: MBRecording[];
}

interface MBArtist {
	id: string;
	name: string;
	'sort-name': string;
	type?: string;
	country?: string;
	'life-span'?: {
		begin?: string;
		end?: string;
	};
	tags?: Array<{
		name: string;
		count: number;
	}>;
	relations?: Array<{
		type: string;
		url?: { resource: string };
		artist?: { id: string; name: string };
	}>;
}

interface MBISRCLookup {
	isrc: string;
	recordings: MBRecording[];
}

export interface MusicBrainzServiceConfig {
	cache: KVNamespace;
	rateLimiter?: DurableObjectStub;
}

export class MusicBrainzService {
	private cache: KVNamespace;
	private rateLimiter?: DurableObjectStub;
	private lastRequestTime = 0;

	constructor(config: MusicBrainzServiceConfig) {
		this.cache = config.cache;
		this.rateLimiter = config.rateLimiter;
	}

	/**
	 * Enforce rate limiting (1 request per second).
	 */
	private async enforceRateLimit(): Promise<void> {
		// Use external rate limiter if available
		if (this.rateLimiter) {
			const limitCheck = await this.rateLimiter.fetch(
				new Request('http://internal/check?api=musicbrainz')
			);
			const { allowed, retryAfter } = (await limitCheck.json()) as {
				allowed: boolean;
				retryAfter?: number;
			};

			if (!allowed) {
				await new Promise((resolve) => setTimeout(resolve, retryAfter || 1000));
			}
			return;
		}

		// Fallback: simple in-memory rate limiting
		const now = Date.now();
		const elapsed = now - this.lastRequestTime;
		if (elapsed < 1000) {
			await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
		}
		this.lastRequestTime = Date.now();
	}

	/**
	 * Make a rate-limited API request to MusicBrainz.
	 */
	private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
		await this.enforceRateLimit();

		const url = new URL(endpoint, MB_API_URL);
		url.searchParams.set('fmt', 'json');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await fetch(url.toString(), {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			if (response.status === 503) {
				// Rate limited - wait and retry
				await new Promise((resolve) => setTimeout(resolve, 2000));
				return this.request<T>(endpoint, params);
			}
			throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
		}

		return response.json() as Promise<T>;
	}

	/**
	 * Search for recordings by query string.
	 */
	async searchRecording(
		query: string,
		limit = 10
	): Promise<Array<ResolvedTrack & { score: number }>> {
		const cacheKey = CACHE_KEYS.resolvedQuery(`mb:${this.hashQuery(query)}`);
		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached) return cached as Array<ResolvedTrack & { score: number }>;

		try {
			const data = await this.request<MBRecordingSearchResult>('recording', {
				query,
				limit: limit.toString()
			});

			const results = data.recordings.map((rec) => ({
				mbid: rec.id,
				title: rec.title,
				artist: rec['artist-credit']?.[0]?.name || 'Unknown Artist',
				artistMbid: rec['artist-credit']?.[0]?.artist?.id || '',
				album: rec.releases?.[0]?.title,
				albumMbid: rec.releases?.[0]?.id,
				releaseYear: rec['first-release-date']
					? parseInt(rec['first-release-date'].split('-')[0])
					: undefined,
				duration: rec.length,
				score: 1.0 // MusicBrainz search doesn't provide scores in the same way
			}));

			await this.cache.put(cacheKey, JSON.stringify(results), {
				expirationTtl: CACHE_TTLS.resolvedQuery
			});

			return results;
		} catch (e) {
			console.error('MusicBrainz search error:', e);
			return [];
		}
	}

	/**
	 * Search with specific artist and track title.
	 */
	async searchRecordingByMetadata(
		title: string,
		artist: string,
		durationMs?: number
	): Promise<Array<ResolvedTrack & { score: number }>> {
		// Build Lucene query
		let query = `recording:"${title}"`;
		if (artist) {
			query += ` AND artist:"${artist}"`;
		}

		const results = await this.searchRecording(query, 5);

		// If we have duration, filter by it (within 5 seconds)
		if (durationMs && results.length > 0) {
			return results.filter((r) => {
				if (!r.duration) return true;
				return Math.abs(r.duration - durationMs) < 5000;
			});
		}

		return results;
	}

	/**
	 * Look up a recording by MBID.
	 */
	async getRecording(mbid: string): Promise<ResolvedTrack | null> {
		const cacheKey = CACHE_KEYS.mbRecording(mbid);
		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached) return cached as ResolvedTrack;

		try {
			const data = await this.request<MBRecording>(`recording/${mbid}`, {
				inc: 'artists+releases+isrcs'
			});

			const result: ResolvedTrack = {
				mbid: data.id,
				title: data.title,
				artist: data['artist-credit']?.[0]?.name || 'Unknown Artist',
				artistMbid: data['artist-credit']?.[0]?.artist?.id || '',
				album: data.releases?.[0]?.title,
				albumMbid: data.releases?.[0]?.id,
				releaseYear: data['first-release-date']
					? parseInt(data['first-release-date'].split('-')[0])
					: undefined,
				duration: data.length
			};

			await this.cache.put(cacheKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.mbRecording
			});

			return result;
		} catch {
			return null;
		}
	}

	/**
	 * Look up recordings by ISRC.
	 */
	async lookupByISRC(isrc: string): Promise<ResolvedTrack | null> {
		const cacheKey = CACHE_KEYS.spotifyIsrcLookup(isrc);
		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached) return cached as ResolvedTrack;

		try {
			const data = await this.request<MBISRCLookup>(`isrc/${isrc}`, {
				inc: 'artists+releases'
			});

			if (!data.recordings || data.recordings.length === 0) {
				return null;
			}

			// Return the first (most relevant) recording
			const rec = data.recordings[0];
			const result: ResolvedTrack = {
				mbid: rec.id,
				title: rec.title,
				artist: rec['artist-credit']?.[0]?.name || 'Unknown Artist',
				artistMbid: rec['artist-credit']?.[0]?.artist?.id || '',
				album: rec.releases?.[0]?.title,
				albumMbid: rec.releases?.[0]?.id,
				releaseYear: rec['first-release-date']
					? parseInt(rec['first-release-date'].split('-')[0])
					: undefined,
				duration: rec.length
			};

			await this.cache.put(cacheKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.spotifyIsrcLookup
			});

			return result;
		} catch {
			return null;
		}
	}

	/**
	 * Get artist information.
	 */
	async getArtist(
		mbid: string
	): Promise<{
		id: string;
		name: string;
		type?: string;
		country?: string;
		tags: Array<{ name: string; count: number }>;
	} | null> {
		const cacheKey = CACHE_KEYS.mbArtist(mbid);
		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached)
			return cached as {
				id: string;
				name: string;
				type?: string;
				country?: string;
				tags: Array<{ name: string; count: number }>;
			};

		try {
			const data = await this.request<MBArtist>(`artist/${mbid}`, {
				inc: 'tags'
			});

			const result = {
				id: data.id,
				name: data.name,
				type: data.type,
				country: data.country,
				tags: data.tags || []
			};

			await this.cache.put(cacheKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.mbRecording
			});

			return result;
		} catch {
			return null;
		}
	}

	/**
	 * Parse a user query into artist and track components.
	 * Supports formats: "Song by Artist", "Artist - Song", "Song, Artist"
	 */
	parseQuery(query: string): { track: string; artist: string } | null {
		query = query.trim();

		// Try "Song by Artist" format
		const byMatch = query.match(/^(.+?)\s+by\s+(.+)$/i);
		if (byMatch) {
			return { track: byMatch[1].trim(), artist: byMatch[2].trim() };
		}

		// Try "Artist - Song" format
		const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
		if (dashMatch) {
			return { track: dashMatch[2].trim(), artist: dashMatch[1].trim() };
		}

		// Try "Song, Artist" format
		const commaMatch = query.match(/^(.+?),\s*(.+)$/);
		if (commaMatch) {
			return { track: commaMatch[1].trim(), artist: commaMatch[2].trim() };
		}

		// Fallback: treat entire query as track name
		return null;
	}

	/**
	 * Resolve a user query to a track.
	 */
	async resolveQuery(query: string): Promise<ResolvedTrack | null> {
		const parsed = this.parseQuery(query);

		if (parsed) {
			// We have artist and track - do a targeted search
			const results = await this.searchRecordingByMetadata(parsed.track, parsed.artist);
			if (results.length > 0) {
				return results[0];
			}
		}

		// Fallback to general search
		const results = await this.searchRecording(query, 5);
		if (results.length > 0) {
			return results[0];
		}

		return null;
	}

	/**
	 * Simple hash function for cache keys.
	 */
	private hashQuery(query: string): string {
		let hash = 0;
		for (let i = 0; i < query.length; i++) {
			const char = query.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}
}
