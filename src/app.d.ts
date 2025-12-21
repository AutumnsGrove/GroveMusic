/// <reference types="@cloudflare/workers-types" />

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}

		interface Locals {
			user?: {
				id: string;
				email: string;
				displayName?: string;
				avatarUrl?: string;
				creditsAvailable: number;
			};
		}

		interface PageData {}

		interface PageState {}

		interface Platform {
			env: {
				// SST-linked D1 Databases
				DB: D1Database;
				SPOTIFY_CACHE: D1Database;

				// SST-linked KV Namespaces
				CACHE: KVNamespace;
				SESSIONS: KVNamespace;
				RATE_LIMITS: KVNamespace;
				CONFIG: KVNamespace;
				SPOTIFY_KV: KVNamespace;

				// SST-linked R2 Buckets
				STORAGE: R2Bucket;
				SPOTIFY_STORAGE: R2Bucket;

				// Vectorize Index (manual wrangler setup until SST adds support)
				TRACKS: VectorizeIndex;
				SPOTIFY_VECTORS: VectorizeIndex;

				// Durable Objects (via pipeline worker)
				MUSIC_PIPELINE: DurableObjectNamespace;
				RATE_LIMITER: DurableObjectNamespace;

				// SST Secrets
				LASTFM_API_KEY: string;
				ANTHROPIC_API_KEY: string;
				HEARTWOOD_CLIENT_ID: string;
				HEARTWOOD_CLIENT_SECRET: string;
				HEARTWOOD_REDIRECT_URI: string;

				// Worker URLs (from SST links)
				PIPELINE_WORKER_URL: string;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
