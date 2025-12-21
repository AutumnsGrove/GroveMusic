/**
 * GroveMusic Pipeline Worker
 * Handles playlist generation with Durable Objects
 */

export interface Env {
	MUSIC_PIPELINE: DurableObjectNamespace;
	RATE_LIMITER: DurableObjectNamespace;
	DB: D1Database;
	CACHE: KVNamespace;
	CONFIG: KVNamespace;
	STORAGE: R2Bucket;
	TRACKS: VectorizeIndex;
	LASTFM_API_KEY: string;
	ANTHROPIC_API_KEY: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (inline since this is a separate worker)
// ─────────────────────────────────────────────────────────────────────────────

interface SeedTrackInput {
	query: string;
	playlistSize: number;
	preferences?: {
		eraRange?: [number, number];
		moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
		popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
	};
}

interface Tag {
	name: string;
	count: number;
	source: 'lastfm' | 'musicbrainz' | 'user';
}

interface ResolvedTrack {
	mbid: string;
	title: string;
	artist: string;
	artistMbid: string;
	album?: string;
	albumMbid?: string;
	releaseYear?: number;
	duration?: number;
	lastfmUrl?: string;
}

interface EnrichedTrack extends ResolvedTrack {
	tags: Tag[];
	similarTracks: string[];
	similarArtists: string[];
	topListeners?: number;
	playcount?: number;
}

interface ScoredTrack extends EnrichedTrack {
	scores: {
		tagOverlap: number;
		artistSimilarity: number;
		temporalProximity: number;
		vectorSimilarity: number;
		popularityFit: number;
		overall: number;
	};
	category: 'popular' | 'deep-cut' | 'hidden-gem';
}

interface PlaylistTrack extends ScoredTrack {
	position: number;
	reason: string;
	flowRole: 'opener' | 'builder' | 'peak' | 'valley' | 'closer' | 'transition';
	similarityScore: number;
}

type PipelineStatus =
	| 'pending'
	| 'resolving'
	| 'enriching'
	| 'generating'
	| 'scoring'
	| 'curating'
	| 'explaining'
	| 'complete'
	| 'failed';

interface PipelineState {
	runId: string;
	userId: string;
	status: PipelineStatus;
	seedTrack: SeedTrackInput;
	resolvedTrack: ResolvedTrack | null;
	candidatePool: EnrichedTrack[];
	scoredCandidates: ScoredTrack[];
	finalPlaylist: PlaylistTrack[];
	progress: number;
	error: { code: string; message: string; stage: PipelineStatus; retryable: boolean } | null;
	startedAt: number;
	completedAt: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Pipeline Durable Object
// ─────────────────────────────────────────────────────────────────────────────

export class MusicPipelineDO implements DurableObject {
	private state: DurableObjectState;
	private env: Env;
	private pipelineState: PipelineState | null = null;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		switch (url.pathname) {
			case '/start':
				return this.startPipeline(request);
			case '/status':
				return this.getStatus();
			case '/stream':
				return this.streamProgress(request);
			case '/cancel':
				return this.cancelPipeline();
			default:
				return new Response('Not Found', { status: 404 });
		}
	}

	private async startPipeline(request: Request): Promise<Response> {
		const body = (await request.json()) as {
			runId: string;
			userId: string;
			seedTrack: SeedTrackInput;
		};

		// Initialize pipeline state
		this.pipelineState = {
			runId: body.runId,
			userId: body.userId,
			status: 'pending',
			seedTrack: body.seedTrack,
			resolvedTrack: null,
			candidatePool: [],
			scoredCandidates: [],
			finalPlaylist: [],
			progress: 0,
			error: null,
			startedAt: Date.now(),
			completedAt: null
		};

		await this.saveState();

		// Start pipeline execution in background
		this.state.waitUntil(this.executePipeline());

		return Response.json({
			runId: body.runId,
			status: 'pending',
			message: 'Pipeline started'
		});
	}

	private async executePipeline(): Promise<void> {
		try {
			// Stage 1: Resolve track
			await this.updateStatus('resolving', 10);
			await this.resolveTrack();

			// Stage 2: Enrich with metadata
			await this.updateStatus('enriching', 25);
			await this.enrichTrack();

			// Stage 3: Generate candidates
			await this.updateStatus('generating', 40);
			await this.generateCandidates();

			// Stage 4: Score candidates
			await this.updateStatus('scoring', 60);
			await this.scoreCandidates();

			// Stage 5: Curate final playlist
			await this.updateStatus('curating', 75);
			await this.curatePlaylist();

			// Stage 6: Generate LLM explanations
			await this.updateStatus('explaining', 90);
			await this.generateExplanations();

			// Complete
			await this.updateStatus('complete', 100);
			this.pipelineState!.completedAt = Date.now();
			await this.saveState();
			await this.saveToDatabase();
		} catch (error) {
			const err = error as Error;
			this.pipelineState!.error = {
				code: 'PIPELINE_ERROR',
				message: err.message,
				stage: this.pipelineState!.status,
				retryable: true
			};
			this.pipelineState!.status = 'failed';
			await this.saveState();
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Pipeline Stages
	// ─────────────────────────────────────────────────────────────────────────

	private async resolveTrack(): Promise<void> {
		const query = this.pipelineState!.seedTrack.query;

		// Parse query for artist/track
		const parsed = this.parseQuery(query);

		// Try Last.fm search first
		const searchResults = await this.lastfmSearch(parsed?.track || query, parsed?.artist);

		if (searchResults.length === 0) {
			throw new Error(`Could not find track: "${query}"`);
		}

		// Get detailed track info
		const trackInfo = await this.lastfmGetTrackInfo(
			searchResults[0].name,
			searchResults[0].artist
		);

		this.pipelineState!.resolvedTrack = {
			mbid: trackInfo.mbid || searchResults[0].mbid || '',
			title: trackInfo.name || searchResults[0].name,
			artist: trackInfo.artist?.name || searchResults[0].artist,
			artistMbid: trackInfo.artist?.mbid || '',
			album: trackInfo.album?.title,
			duration: trackInfo.duration ? parseInt(trackInfo.duration) : undefined,
			lastfmUrl: trackInfo.url
		};

		await this.saveState();
	}

	private async enrichTrack(): Promise<void> {
		const track = this.pipelineState!.resolvedTrack!;

		// Fetch data in parallel
		const [trackInfo, similarTracks, artistInfo] = await Promise.all([
			this.lastfmGetTrackInfo(track.title, track.artist),
			this.lastfmGetSimilarTracks(track.title, track.artist),
			this.lastfmGetArtistInfo(track.artist)
		]);

		// Build enriched track (stored as first candidate as reference)
		const enrichedSeed: EnrichedTrack = {
			...track,
			tags:
				trackInfo.toptags?.tag.map((t: { name: string; count?: number }) => ({
					name: t.name,
					count: t.count || 0,
					source: 'lastfm' as const
				})) || [],
			similarTracks: similarTracks
				.filter((t: { mbid?: string }) => t.mbid)
				.map((t: { mbid: string }) => t.mbid),
			similarArtists: artistInfo?.similar?.artist?.map((a: { name: string }) => a.name) || [],
			playcount: trackInfo.playcount ? parseInt(trackInfo.playcount) : undefined,
			topListeners: trackInfo.listeners ? parseInt(trackInfo.listeners) : undefined
		};

		// Store enriched seed for reference
		this.pipelineState!.candidatePool = [enrichedSeed];
		await this.saveState();
	}

	private async generateCandidates(): Promise<void> {
		const seed = this.pipelineState!.candidatePool[0];
		const targetSize = this.pipelineState!.seedTrack.playlistSize;
		const candidateTarget = targetSize * 4; // 4x candidates for filtering

		const candidates: Map<string, EnrichedTrack> = new Map();

		// Strategy 1: Last.fm similar tracks
		const similarTracks = await this.lastfmGetSimilarTracks(seed.title, seed.artist, 100);
		for (const track of similarTracks.slice(0, 50)) {
			if (!candidates.has(track.mbid || track.name)) {
				const enriched = await this.enrichCandidate(track);
				if (enriched) candidates.set(enriched.mbid || enriched.title, enriched);
			}
			if (candidates.size >= candidateTarget) break;
		}

		// Strategy 2: Similar artists' top tracks
		if (candidates.size < candidateTarget) {
			const similarArtists = await this.lastfmGetSimilarArtists(seed.artist, 10);
			for (const artist of similarArtists.slice(0, 5)) {
				const topTracks = await this.lastfmGetArtistTopTracks(artist.name, 10);
				for (const track of topTracks.slice(0, 5)) {
					if (!candidates.has(track.mbid || track.name)) {
						const enriched = await this.enrichCandidate({
							name: track.name,
							artist: track.artist.name,
							mbid: track.mbid
						});
						if (enriched) candidates.set(enriched.mbid || enriched.title, enriched);
					}
					if (candidates.size >= candidateTarget) break;
				}
				if (candidates.size >= candidateTarget) break;
			}
		}

		// Strategy 3: Tag-based discovery
		if (candidates.size < candidateTarget && seed.tags.length > 0) {
			const topTag = seed.tags[0].name;
			const tagTracks = await this.lastfmGetTagTopTracks(topTag, 20);
			for (const track of tagTracks) {
				if (!candidates.has(track.mbid || track.name)) {
					const enriched = await this.enrichCandidate(track);
					if (enriched) candidates.set(enriched.mbid || enriched.title, enriched);
				}
				if (candidates.size >= candidateTarget) break;
			}
		}

		this.pipelineState!.candidatePool = [seed, ...candidates.values()];
		await this.saveState();
	}

	private async scoreCandidates(): Promise<void> {
		const seed = this.pipelineState!.candidatePool[0];
		const candidates = this.pipelineState!.candidatePool.slice(1);
		const prefs = this.pipelineState!.seedTrack.preferences;

		const scored: ScoredTrack[] = [];

		for (const candidate of candidates) {
			const scores = {
				tagOverlap: this.calculateTagOverlap(seed.tags, candidate.tags),
				artistSimilarity: this.calculateArtistSimilarity(seed, candidate),
				temporalProximity: this.calculateTemporalProximity(
					seed.releaseYear,
					candidate.releaseYear,
					prefs?.eraRange
				),
				vectorSimilarity: 0.5, // Placeholder until Spotify data available
				popularityFit: this.calculatePopularityFit(candidate, prefs?.popularityBias)
			};

			// Weighted average
			const overall =
				scores.tagOverlap * 0.25 +
				scores.artistSimilarity * 0.2 +
				scores.temporalProximity * 0.15 +
				scores.vectorSimilarity * 0.25 +
				scores.popularityFit * 0.15;

			// Categorize by popularity
			const category = this.categorizeByPopularity(candidate.playcount);

			scored.push({
				...candidate,
				scores: { ...scores, overall: overall * 10 },
				category
			});
		}

		// Sort by overall score
		scored.sort((a, b) => b.scores.overall - a.scores.overall);

		this.pipelineState!.scoredCandidates = scored;
		await this.saveState();
	}

	private async curatePlaylist(): Promise<void> {
		const candidates = this.pipelineState!.scoredCandidates;
		const targetSize = this.pipelineState!.seedTrack.playlistSize;

		// Category quotas
		const quotas = {
			popular: Math.floor(targetSize * 0.35),
			'deep-cut': Math.floor(targetSize * 0.5),
			'hidden-gem': Math.ceil(targetSize * 0.15)
		};

		const selected: ScoredTrack[] = [];
		const byCategory = {
			popular: candidates.filter((c) => c.category === 'popular'),
			'deep-cut': candidates.filter((c) => c.category === 'deep-cut'),
			'hidden-gem': candidates.filter((c) => c.category === 'hidden-gem')
		};

		// Fill quotas
		for (const [category, quota] of Object.entries(quotas) as [keyof typeof quotas, number][]) {
			const available = byCategory[category];
			selected.push(...available.slice(0, quota));
		}

		// Fill remaining slots with best remaining
		const selectedSet = new Set(selected.map((s) => s.mbid || s.title));
		const remaining = candidates.filter((c) => !selectedSet.has(c.mbid || c.title));
		while (selected.length < targetSize && remaining.length > 0) {
			selected.push(remaining.shift()!);
		}

		// Convert to playlist tracks with initial positions
		const playlist: PlaylistTrack[] = selected.slice(0, targetSize).map((track, index) => ({
			...track,
			position: index + 1,
			reason: '', // Will be filled by LLM
			flowRole: this.assignFlowRole(index, targetSize),
			similarityScore: Math.round(track.scores.overall)
		}));

		this.pipelineState!.finalPlaylist = playlist;
		await this.saveState();
	}

	private async generateExplanations(): Promise<void> {
		const seed = this.pipelineState!.candidatePool[0];
		const playlist = this.pipelineState!.finalPlaylist;

		// Skip if no API key
		if (!this.env.ANTHROPIC_API_KEY) {
			// Use fallback explanations
			this.pipelineState!.finalPlaylist = playlist.map((track) => ({
				...track,
				reason: this.generateFallbackReason(seed, track)
			}));
			await this.saveState();
			return;
		}

		try {
			const explanations = await this.callClaude(seed, playlist);
			this.pipelineState!.finalPlaylist = playlist.map((track, index) => ({
				...track,
				reason: explanations[index] || this.generateFallbackReason(seed, track)
			}));
		} catch (error) {
			// Fallback on error
			this.pipelineState!.finalPlaylist = playlist.map((track) => ({
				...track,
				reason: this.generateFallbackReason(seed, track)
			}));
		}

		await this.saveState();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Scoring Functions
	// ─────────────────────────────────────────────────────────────────────────

	private calculateTagOverlap(seedTags: Tag[], candidateTags: Tag[]): number {
		if (seedTags.length === 0 || candidateTags.length === 0) return 0;

		const seedSet = new Set(seedTags.map((t) => t.name.toLowerCase()));
		const candidateSet = new Set(candidateTags.map((t) => t.name.toLowerCase()));

		const intersection = [...seedSet].filter((t) => candidateSet.has(t)).length;
		const union = new Set([...seedSet, ...candidateSet]).size;

		return union > 0 ? intersection / union : 0;
	}

	private calculateArtistSimilarity(seed: EnrichedTrack, candidate: EnrichedTrack): number {
		// Same artist
		if (seed.artist.toLowerCase() === candidate.artist.toLowerCase()) return 1.0;

		// Similar artist
		if (seed.similarArtists.some((a) => a.toLowerCase() === candidate.artist.toLowerCase())) {
			return 0.8;
		}

		// Check if candidate's artist is in seed's similar artists
		if (
			candidate.similarArtists.some((a) => a.toLowerCase() === seed.artist.toLowerCase())
		) {
			return 0.6;
		}

		return 0;
	}

	private calculateTemporalProximity(
		seedYear?: number,
		candidateYear?: number,
		eraRange?: [number, number]
	): number {
		// If era preference is set, check if candidate is within range
		if (eraRange && candidateYear) {
			if (candidateYear < eraRange[0] || candidateYear > eraRange[1]) {
				return 0.2; // Penalty for out-of-range
			}
		}

		if (!seedYear || !candidateYear) return 0.5;

		// Gaussian decay based on year difference
		const diff = Math.abs(seedYear - candidateYear);
		return Math.exp(-(diff * diff) / (2 * 100)); // σ = 10 years
	}

	private calculatePopularityFit(
		candidate: EnrichedTrack,
		bias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced'
	): number {
		const playcount = candidate.playcount || 0;

		// Normalize playcount (log scale)
		const normalizedPop = Math.min(1, Math.log10(playcount + 1) / 8);

		switch (bias) {
			case 'popular':
				return normalizedPop;
			case 'deep-cuts':
				return 0.3 + (1 - normalizedPop) * 0.4;
			case 'hidden-gems':
				return normalizedPop < 0.3 ? 1 - normalizedPop : 0.2;
			default:
				return 0.5; // Balanced - no bias
		}
	}

	private categorizeByPopularity(
		playcount?: number
	): 'popular' | 'deep-cut' | 'hidden-gem' {
		if (!playcount) return 'deep-cut';
		if (playcount > 1000000) return 'popular';
		if (playcount > 100000) return 'deep-cut';
		return 'hidden-gem';
	}

	private assignFlowRole(
		index: number,
		total: number
	): PlaylistTrack['flowRole'] {
		const position = index / (total - 1);
		if (index === 0) return 'opener';
		if (index === total - 1) return 'closer';
		if (position < 0.25) return 'builder';
		if (position < 0.5) return 'peak';
		if (position < 0.75) return 'valley';
		return 'transition';
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Last.fm API Helpers
	// ─────────────────────────────────────────────────────────────────────────

	private async lastfmRequest(method: string, params: Record<string, string>): Promise<unknown> {
		// Check rate limiter
		const limiterStub = this.env.RATE_LIMITER.get(
			this.env.RATE_LIMITER.idFromName('global')
		);
		const limitCheck = await limiterStub.fetch(
			new Request('http://internal/check?api=lastfm')
		);
		const { allowed, retryAfter } = (await limitCheck.json()) as {
			allowed: boolean;
			retryAfter?: number;
		};

		if (!allowed) {
			await new Promise((resolve) => setTimeout(resolve, retryAfter || 200));
		}

		const url = new URL('https://ws.audioscrobbler.com/2.0/');
		url.searchParams.set('method', method);
		url.searchParams.set('api_key', this.env.LASTFM_API_KEY);
		url.searchParams.set('format', 'json');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await fetch(url.toString(), {
			headers: { 'User-Agent': 'GroveMusic/1.0 (aria.grove.place)' }
		});

		if (!response.ok) {
			throw new Error(`Last.fm API error: ${response.status}`);
		}

		return response.json();
	}

	private async lastfmSearch(
		track: string,
		artist?: string
	): Promise<Array<{ name: string; artist: string; mbid?: string }>> {
		const query = artist ? `${track} ${artist}` : track;
		const data = (await this.lastfmRequest('track.search', { track: query, limit: '5' })) as {
			results: { trackmatches: { track: Array<{ name: string; artist: string; mbid?: string }> } };
		};
		return data.results.trackmatches.track || [];
	}

	private async lastfmGetTrackInfo(track: string, artist: string): Promise<Record<string, unknown>> {
		const data = (await this.lastfmRequest('track.getInfo', { track, artist })) as {
			track: Record<string, unknown>;
		};
		return data.track || {};
	}

	private async lastfmGetSimilarTracks(
		track: string,
		artist: string,
		limit = 50
	): Promise<Array<{ name: string; artist: { name: string }; mbid?: string; match: string }>> {
		try {
			const data = (await this.lastfmRequest('track.getSimilar', {
				track,
				artist,
				limit: limit.toString()
			})) as {
				similartracks: {
					track: Array<{ name: string; artist: { name: string }; mbid?: string; match: string }>;
				};
			};
			return data.similartracks?.track || [];
		} catch {
			return [];
		}
	}

	private async lastfmGetArtistInfo(artist: string): Promise<Record<string, unknown>> {
		const data = (await this.lastfmRequest('artist.getInfo', { artist })) as {
			artist: Record<string, unknown>;
		};
		return data.artist || {};
	}

	private async lastfmGetSimilarArtists(
		artist: string,
		limit = 10
	): Promise<Array<{ name: string; match: string }>> {
		try {
			const data = (await this.lastfmRequest('artist.getSimilar', {
				artist,
				limit: limit.toString()
			})) as { similarartists: { artist: Array<{ name: string; match: string }> } };
			return data.similarartists?.artist || [];
		} catch {
			return [];
		}
	}

	private async lastfmGetArtistTopTracks(
		artist: string,
		limit = 10
	): Promise<Array<{ name: string; mbid?: string; artist: { name: string } }>> {
		try {
			const data = (await this.lastfmRequest('artist.getTopTracks', {
				artist,
				limit: limit.toString()
			})) as {
				toptracks: { track: Array<{ name: string; mbid?: string; artist: { name: string } }> };
			};
			return data.toptracks?.track || [];
		} catch {
			return [];
		}
	}

	private async lastfmGetTagTopTracks(
		tag: string,
		limit = 20
	): Promise<Array<{ name: string; artist: { name: string }; mbid?: string }>> {
		try {
			const data = (await this.lastfmRequest('tag.getTopTracks', {
				tag,
				limit: limit.toString()
			})) as { tracks: { track: Array<{ name: string; artist: { name: string }; mbid?: string }> } };
			return data.tracks?.track || [];
		} catch {
			return [];
		}
	}

	private async enrichCandidate(
		track: { name: string; artist: string | { name: string }; mbid?: string }
	): Promise<EnrichedTrack | null> {
		try {
			const artistName = typeof track.artist === 'string' ? track.artist : track.artist.name;
			const info = (await this.lastfmGetTrackInfo(track.name, artistName)) as {
				name?: string;
				mbid?: string;
				artist?: { name: string; mbid?: string };
				album?: { title: string };
				toptags?: { tag: Array<{ name: string; count?: number }> };
				playcount?: string;
				listeners?: string;
			};

			return {
				mbid: info.mbid || track.mbid || '',
				title: info.name || track.name,
				artist: info.artist?.name || artistName,
				artistMbid: info.artist?.mbid || '',
				album: info.album?.title,
				tags:
					info.toptags?.tag?.map((t) => ({
						name: t.name,
						count: t.count || 0,
						source: 'lastfm' as const
					})) || [],
				similarTracks: [],
				similarArtists: [],
				playcount: info.playcount ? parseInt(info.playcount) : undefined,
				topListeners: info.listeners ? parseInt(info.listeners) : undefined
			};
		} catch {
			return null;
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// LLM Helpers
	// ─────────────────────────────────────────────────────────────────────────

	private async callClaude(seed: EnrichedTrack, playlist: PlaylistTrack[]): Promise<string[]> {
		const prompt = `Given seed track "${seed.title}" by ${seed.artist}, generate brief (2-3 sentence) explanations for why each track belongs in this playlist:

${playlist.map((t, i) => `${i + 1}. "${t.title}" by ${t.artist}`).join('\n')}

Respond with a JSON array of strings, one explanation per track.`;

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.env.ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
				messages: [{ role: 'user', content: prompt }]
			})
		});

		if (!response.ok) {
			throw new Error('Claude API error');
		}

		const data = (await response.json()) as { content: Array<{ text: string }> };
		const text = data.content[0]?.text || '[]';

		try {
			const jsonMatch = text.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]) as string[];
			}
		} catch {
			// Parse error - return empty
		}

		return [];
	}

	private generateFallbackReason(seed: EnrichedTrack, track: ScoredTrack): string {
		const sharedTags = seed.tags
			.filter((t) => track.tags.some((tt) => tt.name === t.name))
			.slice(0, 2)
			.map((t) => t.name);

		if (sharedTags.length > 0) {
			return `Shares the ${sharedTags.join(' and ')} aesthetic with "${seed.title}".`;
		}

		if (track.scores.artistSimilarity > 0.5) {
			return `From an artist in ${seed.artist}'s musical orbit.`;
		}

		return `Complements the mood of "${seed.title}" with similar energy.`;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Utility Methods
	// ─────────────────────────────────────────────────────────────────────────

	private parseQuery(query: string): { track: string; artist: string } | null {
		query = query.trim();

		// Try "Song by Artist" format
		const byMatch = query.match(/^(.+?)\s+by\s+(.+)$/i);
		if (byMatch) return { track: byMatch[1].trim(), artist: byMatch[2].trim() };

		// Try "Artist - Song" format
		const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
		if (dashMatch) return { track: dashMatch[2].trim(), artist: dashMatch[1].trim() };

		return null;
	}

	private async updateStatus(status: PipelineStatus, progress: number): Promise<void> {
		if (this.pipelineState) {
			this.pipelineState.status = status;
			this.pipelineState.progress = progress;
			await this.saveState();
		}
	}

	private async saveState(): Promise<void> {
		if (this.pipelineState) {
			await this.state.storage.put('pipelineState', this.pipelineState);
		}
	}

	private async loadState(): Promise<void> {
		this.pipelineState =
			(await this.state.storage.get<PipelineState>('pipelineState')) || null;
	}

	private async saveToDatabase(): Promise<void> {
		if (!this.pipelineState || this.pipelineState.status !== 'complete') return;

		const { runId, userId, seedTrack, resolvedTrack, finalPlaylist, startedAt, completedAt } =
			this.pipelineState;

		const processingTimeMs = completedAt ? completedAt - startedAt : 0;

		await this.env.DB.prepare(
			`UPDATE runs SET
        status = 'complete',
        seed_track_mbid = ?,
        seed_track_title = ?,
        seed_track_artist = ?,
        playlist_json = ?,
        track_count = ?,
        processing_time_ms = ?,
        completed_at = datetime('now')
      WHERE id = ?`
		)
			.bind(
				resolvedTrack?.mbid || null,
				resolvedTrack?.title || null,
				resolvedTrack?.artist || null,
				JSON.stringify(finalPlaylist),
				finalPlaylist.length,
				processingTimeMs,
				runId
			)
			.run();

		// Store full result in R2
		const year = new Date().getFullYear();
		const month = String(new Date().getMonth() + 1).padStart(2, '0');
		const r2Key = `runs/${year}/${month}/${runId}.json`;

		await this.env.STORAGE.put(
			r2Key,
			JSON.stringify({
				runId,
				userId,
				seedTrack,
				resolvedTrack,
				playlist: finalPlaylist,
				processingTimeMs,
				createdAt: new Date(startedAt).toISOString(),
				completedAt: completedAt ? new Date(completedAt).toISOString() : null
			})
		);

		// Update R2 key in database
		await this.env.DB.prepare('UPDATE runs SET r2_key = ? WHERE id = ?')
			.bind(r2Key, runId)
			.run();
	}

	private async getStatus(): Promise<Response> {
		await this.loadState();

		if (!this.pipelineState) {
			return Response.json({ status: 'idle', progress: 0 });
		}

		return Response.json({
			runId: this.pipelineState.runId,
			status: this.pipelineState.status,
			progress: this.pipelineState.progress,
			seedTrack: this.pipelineState.resolvedTrack,
			playlist:
				this.pipelineState.status === 'complete' ? this.pipelineState.finalPlaylist : undefined,
			error: this.pipelineState.error,
			processingTimeMs: this.pipelineState.completedAt
				? this.pipelineState.completedAt - this.pipelineState.startedAt
				: undefined
		});
	}

	private streamProgress(request: Request): Response {
		// SSE stream for real-time progress updates
		const encoder = new TextEncoder();
		let interval: ReturnType<typeof setInterval>;

		const stream = new ReadableStream({
			start: async (controller) => {
				const sendUpdate = async () => {
					await this.loadState();
					if (!this.pipelineState) return;

					const data = JSON.stringify({
						status: this.pipelineState.status,
						progress: this.pipelineState.progress,
						error: this.pipelineState.error
					});

					controller.enqueue(encoder.encode(`data: ${data}\n\n`));

					if (
						this.pipelineState.status === 'complete' ||
						this.pipelineState.status === 'failed'
					) {
						clearInterval(interval);
						controller.close();
					}
				};

				// Send initial state
				await sendUpdate();

				// Poll every 500ms
				interval = setInterval(sendUpdate, 500);
			},
			cancel: () => {
				clearInterval(interval);
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	}

	private async cancelPipeline(): Promise<Response> {
		await this.loadState();

		if (this.pipelineState) {
			this.pipelineState.status = 'failed';
			this.pipelineState.error = {
				code: 'CANCELLED',
				message: 'Pipeline cancelled by user',
				stage: this.pipelineState.status,
				retryable: false
			};
			await this.saveState();
		}

		return Response.json({ status: 'cancelled' });
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter Durable Object
// ─────────────────────────────────────────────────────────────────────────────

export class RateLimiterDO implements DurableObject {
	private state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const api = url.searchParams.get('api') || 'default';

		// Token bucket configuration per API
		const configs: Record<string, { maxTokens: number; refillRate: number }> = {
			lastfm: { maxTokens: 5, refillRate: 5 }, // 5 per second
			musicbrainz: { maxTokens: 1, refillRate: 1 }, // 1 per second
			default: { maxTokens: 10, refillRate: 10 }
		};

		const config = configs[api] || configs.default;
		const key = `tokens:${api}`;
		const lastRefillKey = `lastRefill:${api}`;

		const lastRefill = (await this.state.storage.get<number>(lastRefillKey)) || Date.now();
		let tokens = (await this.state.storage.get<number>(key)) ?? config.maxTokens;

		// Refill tokens based on elapsed time
		const now = Date.now();
		const elapsed = (now - lastRefill) / 1000;
		tokens = Math.min(config.maxTokens, tokens + elapsed * config.refillRate);

		if (tokens >= 1) {
			tokens -= 1;
			await this.state.storage.put(key, tokens);
			await this.state.storage.put(lastRefillKey, now);
			return Response.json({ allowed: true, tokens: Math.floor(tokens) });
		}

		const retryAfter = Math.ceil((1 - tokens) / config.refillRate * 1000);
		return Response.json({ allowed: false, tokens: Math.floor(tokens), retryAfter });
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// CORS headers for API requests
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// Route to appropriate Durable Object
		if (url.pathname.startsWith('/pipeline/')) {
			const parts = url.pathname.split('/');
			const runId = parts[2];
			const action = parts[3] || 'status';

			const id = env.MUSIC_PIPELINE.idFromName(runId);
			const stub = env.MUSIC_PIPELINE.get(id);

			// Forward to DO with appropriate path
			const doUrl = new URL(request.url);
			doUrl.pathname = `/${action}`;

			const response = await stub.fetch(new Request(doUrl, request));

			// Add CORS headers
			const newHeaders = new Headers(response.headers);
			for (const [key, value] of Object.entries(corsHeaders)) {
				newHeaders.set(key, value);
			}

			return new Response(response.body, {
				status: response.status,
				headers: newHeaders
			});
		}

		if (url.pathname.startsWith('/ratelimit')) {
			const id = env.RATE_LIMITER.idFromName('global');
			const stub = env.RATE_LIMITER.get(id);
			return stub.fetch(request);
		}

		return new Response('GroveMusic Pipeline Worker', {
			headers: { 'Content-Type': 'text/plain', ...corsHeaders }
		});
	}
};
