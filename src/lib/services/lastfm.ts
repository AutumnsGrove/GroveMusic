/**
 * Last.fm API Client
 * Handles track lookups, similar tracks, and artist information.
 */

import type { Tag, EnrichedTrack, ResolvedTrack } from '$lib/types';
import { CACHE_KEYS, CACHE_TTLS } from '$lib/types';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

/** Last.fm API response types */
interface LastfmTrackInfo {
	track: {
		name: string;
		mbid?: string;
		url: string;
		duration?: string;
		listeners?: string;
		playcount?: string;
		artist: {
			name: string;
			mbid?: string;
			url: string;
		};
		album?: {
			artist: string;
			title: string;
			mbid?: string;
			url: string;
		};
		toptags?: {
			tag: Array<{ name: string; count?: number; url: string }>;
		};
	};
}

interface LastfmSimilarTracks {
	similartracks: {
		track: Array<{
			name: string;
			mbid?: string;
			match: string;
			url: string;
			artist: {
				name: string;
				mbid?: string;
				url: string;
			};
		}>;
		'@attr': {
			artist: string;
		};
	};
}

interface LastfmArtistInfo {
	artist: {
		name: string;
		mbid?: string;
		url: string;
		stats?: {
			listeners: string;
			playcount: string;
		};
		similar?: {
			artist: Array<{
				name: string;
				url: string;
				mbid?: string;
			}>;
		};
		tags?: {
			tag: Array<{ name: string; url: string }>;
		};
		bio?: {
			summary: string;
			content: string;
		};
	};
}

interface LastfmTrackSearch {
	results: {
		trackmatches: {
			track: Array<{
				name: string;
				artist: string;
				url: string;
				listeners: string;
				mbid?: string;
			}>;
		};
		'opensearch:totalResults': string;
	};
}

interface LastfmSimilarArtists {
	similarartists: {
		artist: Array<{
			name: string;
			mbid?: string;
			match: string;
			url: string;
		}>;
	};
}

interface LastfmArtistTopTracks {
	toptracks: {
		track: Array<{
			name: string;
			mbid?: string;
			url: string;
			playcount: string;
			listeners: string;
			artist: {
				name: string;
				mbid?: string;
				url: string;
			};
		}>;
	};
}

export interface LastfmServiceConfig {
	apiKey: string;
	cache: KVNamespace;
	rateLimiter?: DurableObjectStub;
}

export class LastfmService {
	private apiKey: string;
	private cache: KVNamespace;
	private rateLimiter?: DurableObjectStub;

	constructor(config: LastfmServiceConfig) {
		this.apiKey = config.apiKey;
		this.cache = config.cache;
		this.rateLimiter = config.rateLimiter;
	}

	/**
	 * Make a rate-limited API request to Last.fm.
	 */
	private async request<T>(method: string, params: Record<string, string>): Promise<T> {
		// Check rate limiter if available
		if (this.rateLimiter) {
			const limitCheck = await this.rateLimiter.fetch(
				new Request('http://internal/check?api=lastfm')
			);
			const { allowed, retryAfter } = (await limitCheck.json()) as {
				allowed: boolean;
				retryAfter?: number;
			};

			if (!allowed) {
				await new Promise((resolve) => setTimeout(resolve, retryAfter || 200));
			}
		}

		const url = new URL(LASTFM_API_URL);
		url.searchParams.set('method', method);
		url.searchParams.set('api_key', this.apiKey);
		url.searchParams.set('format', 'json');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await fetch(url.toString(), {
			headers: {
				'User-Agent': 'GroveMusic/1.0 (aria.grove.place)'
			}
		});

		if (!response.ok) {
			if (response.status === 429) {
				// Rate limited - wait and retry once
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return this.request<T>(method, params);
			}
			throw new Error(`Last.fm API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		// Check for Last.fm error response
		if (data.error) {
			throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
		}

		return data as T;
	}

	/**
	 * Search for tracks by query string.
	 */
	async searchTrack(query: string, limit = 10): Promise<ResolvedTrack[]> {
		const cacheKey = CACHE_KEYS.resolvedQuery(this.hashQuery(query));
		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached) return cached as ResolvedTrack[];

		const data = await this.request<LastfmTrackSearch>('track.search', {
			track: query,
			limit: limit.toString()
		});

		const results: ResolvedTrack[] = data.results.trackmatches.track.map((track) => ({
			mbid: track.mbid || '',
			title: track.name,
			artist: track.artist,
			artistMbid: '',
			lastfmUrl: track.url
		}));

		await this.cache.put(cacheKey, JSON.stringify(results), {
			expirationTtl: CACHE_TTLS.resolvedQuery
		});

		return results;
	}

	/**
	 * Get detailed track information.
	 */
	async getTrackInfo(
		track: string,
		artist: string,
		mbid?: string
	): Promise<{
		track: ResolvedTrack;
		tags: Tag[];
		playcount?: number;
		listeners?: number;
	} | null> {
		const cacheKey = mbid
			? CACHE_KEYS.lastfmTrack(mbid)
			: CACHE_KEYS.lastfmTrack(this.hashQuery(`${artist}:${track}`));

		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached)
			return cached as {
				track: ResolvedTrack;
				tags: Tag[];
				playcount?: number;
				listeners?: number;
			};

		try {
			const params: Record<string, string> = mbid ? { mbid } : { track, artist };

			const data = await this.request<LastfmTrackInfo>('track.getInfo', params);

			const result = {
				track: {
					mbid: data.track.mbid || '',
					title: data.track.name,
					artist: data.track.artist.name,
					artistMbid: data.track.artist.mbid || '',
					album: data.track.album?.title,
					duration: data.track.duration ? parseInt(data.track.duration) : undefined,
					lastfmUrl: data.track.url
				},
				tags:
					data.track.toptags?.tag.map((t) => ({
						name: t.name,
						count: t.count || 0,
						source: 'lastfm' as const
					})) || [],
				playcount: data.track.playcount ? parseInt(data.track.playcount) : undefined,
				listeners: data.track.listeners ? parseInt(data.track.listeners) : undefined
			};

			await this.cache.put(cacheKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.lastfmTrack
			});

			return result;
		} catch {
			return null;
		}
	}

	/**
	 * Get similar tracks for a given track.
	 */
	async getSimilarTracks(
		track: string,
		artist: string,
		mbid?: string,
		limit = 50
	): Promise<Array<{ mbid: string; title: string; artist: string; match: number }>> {
		const cacheKey = mbid
			? CACHE_KEYS.lastfmSimilar(mbid)
			: CACHE_KEYS.lastfmSimilar(this.hashQuery(`${artist}:${track}`));

		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached) return cached as Array<{ mbid: string; title: string; artist: string; match: number }>;

		try {
			const params: Record<string, string> = mbid
				? { mbid, limit: limit.toString() }
				: { track, artist, limit: limit.toString() };

			const data = await this.request<LastfmSimilarTracks>('track.getSimilar', params);

			const results = data.similartracks.track.map((t) => ({
				mbid: t.mbid || '',
				title: t.name,
				artist: t.artist.name,
				match: parseFloat(t.match)
			}));

			await this.cache.put(cacheKey, JSON.stringify(results), {
				expirationTtl: CACHE_TTLS.lastfmSimilar
			});

			return results;
		} catch {
			return [];
		}
	}

	/**
	 * Get artist information.
	 */
	async getArtistInfo(
		artist: string,
		mbid?: string
	): Promise<{
		name: string;
		mbid?: string;
		tags: Tag[];
		similarArtists: string[];
		listeners?: number;
		playcount?: number;
	} | null> {
		const cacheKey = mbid
			? CACHE_KEYS.lastfmArtist(mbid)
			: CACHE_KEYS.lastfmArtist(this.hashQuery(artist));

		const cached = await this.cache.get(cacheKey, { type: 'json' });
		if (cached)
			return cached as {
				name: string;
				mbid?: string;
				tags: Tag[];
				similarArtists: string[];
				listeners?: number;
				playcount?: number;
			};

		try {
			const params: Record<string, string> = mbid ? { mbid } : { artist };

			const data = await this.request<LastfmArtistInfo>('artist.getInfo', params);

			const result = {
				name: data.artist.name,
				mbid: data.artist.mbid,
				tags:
					data.artist.tags?.tag.map((t) => ({
						name: t.name,
						count: 0,
						source: 'lastfm' as const
					})) || [],
				similarArtists: data.artist.similar?.artist.map((a) => a.name) || [],
				listeners: data.artist.stats?.listeners
					? parseInt(data.artist.stats.listeners)
					: undefined,
				playcount: data.artist.stats?.playcount ? parseInt(data.artist.stats.playcount) : undefined
			};

			await this.cache.put(cacheKey, JSON.stringify(result), {
				expirationTtl: CACHE_TTLS.lastfmArtist
			});

			return result;
		} catch {
			return null;
		}
	}

	/**
	 * Get similar artists.
	 */
	async getSimilarArtists(
		artist: string,
		mbid?: string,
		limit = 20
	): Promise<Array<{ name: string; mbid?: string; match: number }>> {
		try {
			const params: Record<string, string> = mbid
				? { mbid, limit: limit.toString() }
				: { artist, limit: limit.toString() };

			const data = await this.request<LastfmSimilarArtists>('artist.getSimilar', params);

			return data.similarartists.artist.map((a) => ({
				name: a.name,
				mbid: a.mbid,
				match: parseFloat(a.match)
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get an artist's top tracks.
	 */
	async getArtistTopTracks(
		artist: string,
		mbid?: string,
		limit = 20
	): Promise<Array<{ mbid: string; title: string; artist: string; playcount: number }>> {
		try {
			const params: Record<string, string> = mbid
				? { mbid, limit: limit.toString() }
				: { artist, limit: limit.toString() };

			const data = await this.request<LastfmArtistTopTracks>('artist.getTopTracks', params);

			return data.toptracks.track.map((t) => ({
				mbid: t.mbid || '',
				title: t.name,
				artist: t.artist.name,
				playcount: parseInt(t.playcount)
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Enrich a resolved track with Last.fm metadata.
	 */
	async enrichTrack(track: ResolvedTrack): Promise<EnrichedTrack> {
		const [trackInfo, similarTracks, artistInfo] = await Promise.all([
			this.getTrackInfo(track.title, track.artist, track.mbid || undefined),
			this.getSimilarTracks(track.title, track.artist, track.mbid || undefined),
			this.getArtistInfo(track.artist, track.artistMbid || undefined)
		]);

		return {
			...track,
			tags: trackInfo?.tags || [],
			similarTracks: similarTracks.filter((t) => t.mbid).map((t) => t.mbid),
			similarArtists: artistInfo?.similarArtists || [],
			playcount: trackInfo?.playcount,
			topListeners: trackInfo?.listeners
		};
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
