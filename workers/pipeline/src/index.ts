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
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Pipeline Durable Object
// ─────────────────────────────────────────────────────────────────────────────

export class MusicPipelineDO implements DurableObject {
	private state: DurableObjectState;
	private env: Env;

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
			case '/cancel':
				return this.cancelPipeline();
			default:
				return new Response('Not Found', { status: 404 });
		}
	}

	private async startPipeline(request: Request): Promise<Response> {
		// TODO: Implement pipeline stages
		// 1. Resolve track (MusicBrainz + Last.fm)
		// 2. Enrich with metadata
		// 3. Generate candidates
		// 4. Score candidates
		// 5. Curate final playlist
		// 6. Generate LLM explanations

		return Response.json({
			status: 'pending',
			message: 'Pipeline implementation coming soon'
		});
	}

	private async getStatus(): Promise<Response> {
		const status = await this.state.storage.get('status') || 'idle';
		const progress = await this.state.storage.get('progress') || 0;

		return Response.json({ status, progress });
	}

	private async cancelPipeline(): Promise<Response> {
		await this.state.storage.put('status', 'cancelled');
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

		// Simple token bucket rate limiter
		const key = `tokens:${api}`;
		const lastRefill = await this.state.storage.get<number>(`lastRefill:${api}`) || Date.now();
		let tokens = await this.state.storage.get<number>(key) || 10;

		// Refill tokens (1 per second for Last.fm, 1 per second for MusicBrainz)
		const now = Date.now();
		const elapsed = (now - lastRefill) / 1000;
		const maxTokens = api === 'musicbrainz' ? 1 : 5;
		tokens = Math.min(maxTokens, tokens + elapsed);

		if (tokens >= 1) {
			tokens -= 1;
			await this.state.storage.put(key, tokens);
			await this.state.storage.put(`lastRefill:${api}`, now);
			return Response.json({ allowed: true, tokens });
		}

		return Response.json({ allowed: false, tokens, retryAfter: 1000 });
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Route to appropriate Durable Object
		if (url.pathname.startsWith('/pipeline/')) {
			const runId = url.pathname.split('/')[2];
			const id = env.MUSIC_PIPELINE.idFromName(runId);
			const stub = env.MUSIC_PIPELINE.get(id);
			return stub.fetch(request);
		}

		if (url.pathname.startsWith('/ratelimit')) {
			const id = env.RATE_LIMITER.idFromName('global');
			const stub = env.RATE_LIMITER.get(id);
			return stub.fetch(request);
		}

		return new Response('GroveMusic Pipeline Worker', {
			headers: { 'Content-Type': 'text/plain' }
		});
	}
};
