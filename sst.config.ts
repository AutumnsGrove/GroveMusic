/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: 'grovemusic',
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			home: 'cloudflare'
		};
	},
	async run() {
		// ─────────────────────────────────────────────────────────────────────────
		// Core Database & Storage Resources
		// ─────────────────────────────────────────────────────────────────────────

		// Primary D1 database for user data, runs, credits
		const db = new sst.cloudflare.D1('GroveMusicDB');

		// KV namespaces for caching and sessions
		const cache = new sst.cloudflare.Kv('Cache');
		const sessions = new sst.cloudflare.Kv('Sessions');
		const rateLimits = new sst.cloudflare.Kv('RateLimits');
		const config = new sst.cloudflare.Kv('Config');

		// R2 bucket for playlist storage and Spotify data
		const storage = new sst.cloudflare.Bucket('Storage');

		// ─────────────────────────────────────────────────────────────────────────
		// Spotify Metadata Resources (for Phase S)
		// ─────────────────────────────────────────────────────────────────────────

		// Dedicated resources for Spotify metadata integration
		const spotifyCache = new sst.cloudflare.D1('SpotifyCache');
		const spotifyKV = new sst.cloudflare.Kv('SpotifyKV');
		const spotifyStorage = new sst.cloudflare.Bucket('SpotifyStorage');

		// ─────────────────────────────────────────────────────────────────────────
		// Secrets
		// ─────────────────────────────────────────────────────────────────────────

		const lastfmApiKey = new sst.Secret('LastfmApiKey');
		const anthropicApiKey = new sst.Secret('AnthropicApiKey');
		const heartwoodClientId = new sst.Secret('HeartwoodClientId');
		const heartwoodClientSecret = new sst.Secret('HeartwoodClientSecret');

		// ─────────────────────────────────────────────────────────────────────────
		// Pipeline Worker (Durable Objects)
		// ─────────────────────────────────────────────────────────────────────────

		const pipeline = new sst.cloudflare.Worker('Pipeline', {
			handler: './workers/pipeline/src/index.ts',
			link: [db, cache, storage, lastfmApiKey, anthropicApiKey],
			url: true
		});

		// ─────────────────────────────────────────────────────────────────────────
		// SvelteKit Frontend
		// ─────────────────────────────────────────────────────────────────────────

		const site = new sst.cloudflare.SvelteKit('Site', {
			link: [
				db,
				cache,
				sessions,
				rateLimits,
				config,
				storage,
				lastfmApiKey,
				anthropicApiKey,
				heartwoodClientId,
				heartwoodClientSecret,
				pipeline
			],
			domain:
				$app.stage === 'production'
					? 'aria.grove.place'
					: undefined
		});

		// ─────────────────────────────────────────────────────────────────────────
		// Background Jobs (Cron)
		// ─────────────────────────────────────────────────────────────────────────

		// Daily promotion job for Spotify tracks (Phase S)
		const promotionCron = new sst.cloudflare.Cron('SpotifyPromotionCron', {
			job: {
				handler: './workers/spotify-promotion/src/index.ts',
				link: [spotifyCache, spotifyKV, spotifyStorage]
			},
			schedules: ['0 3 * * *'] // 3 AM UTC daily
		});

		// ─────────────────────────────────────────────────────────────────────────
		// Outputs
		// ─────────────────────────────────────────────────────────────────────────

		return {
			siteUrl: site.url,
			pipelineUrl: pipeline.url
		};
	}
});
