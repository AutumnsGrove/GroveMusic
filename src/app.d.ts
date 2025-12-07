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
			};
		}

		interface PageData {}

		interface PageState {}

		interface Platform {
			env: {
				// D1 Database
				DB: D1Database;

				// KV Namespaces
				CACHE: KVNamespace;
				SESSIONS: KVNamespace;
				RATE_LIMITS: KVNamespace;
				CONFIG: KVNamespace;

				// R2 Bucket
				STORAGE: R2Bucket;

				// Vectorize Index
				TRACKS: VectorizeIndex;

				// Durable Objects
				MUSIC_PIPELINE: DurableObjectNamespace;
				RATE_LIMITER: DurableObjectNamespace;

				// Secrets (from wrangler secret)
				GOOGLE_CLIENT_ID: string;
				GOOGLE_CLIENT_SECRET: string;
				LASTFM_API_KEY: string;
				ANTHROPIC_API_KEY: string;
				SESSION_SECRET: string;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
