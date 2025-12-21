/**
 * Generate Playlist Route
 * Starts the pipeline for playlist generation
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';
import { calculateCredits, CREDIT_COSTS } from '$lib/types';

interface GenerateRequest {
	query: string;
	playlistSize: number;
	preferences?: {
		eraRange?: [number, number];
		moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
		popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
	};
}

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform?.env) {
		throw error(500, 'Platform bindings not available');
	}

	// Authenticate user
	const sessionToken = cookies.get('session');
	if (!sessionToken) {
		throw error(401, 'Authentication required');
	}

	const authService = new HeartWoodAuthService({
		clientId: platform.env.HEARTWOOD_CLIENT_ID || 'grovemusic',
		clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
		redirectUri: '',
		sessionsKV: platform.env.SESSIONS
	});

	const session = await authService.getSession(sessionToken);
	if (!session) {
		throw error(401, 'Invalid or expired session');
	}

	// Get user from database
	const user = await platform.env.DB.prepare('SELECT * FROM users WHERE id = ?')
		.bind(session.userId)
		.first();

	if (!user) {
		throw error(404, 'User not found');
	}

	// Parse request
	let body: GenerateRequest;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	// Validate request
	if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
		throw error(400, 'Query is required');
	}

	const validSizes = [15, 30, 50, 75, 100];
	if (!validSizes.includes(body.playlistSize)) {
		throw error(400, `Playlist size must be one of: ${validSizes.join(', ')}`);
	}

	// Check credits
	const creditsNeeded = CREDIT_COSTS[body.playlistSize] || calculateCredits(body.playlistSize);
	const creditsAvailable = (user.credits_available as number) || 0;

	if (creditsAvailable < creditsNeeded) {
		throw error(402, `Insufficient credits. Need ${creditsNeeded}, have ${creditsAvailable}`);
	}

	// Generate run ID
	const runId = crypto.randomUUID();

	// Reserve credits
	await platform.env.DB.prepare(
		`UPDATE users SET
      credits_available = credits_available - ?,
      credits_pending = credits_pending + ?
    WHERE id = ?`
	)
		.bind(creditsNeeded, creditsNeeded, session.userId)
		.run();

	// Create run record
	await platform.env.DB.prepare(
		`INSERT INTO runs (id, user_id, status, seed_query, playlist_size, preferences_json, credits_charged)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`
	)
		.bind(
			runId,
			session.userId,
			body.query,
			body.playlistSize,
			JSON.stringify(body.preferences || {}),
			creditsNeeded
		)
		.run();

	// Start pipeline via worker
	try {
		const pipelineUrl = platform.env.PIPELINE_WORKER_URL || 'http://localhost:8787';
		const pipelineResponse = await fetch(`${pipelineUrl}/pipeline/${runId}/start`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				runId,
				userId: session.userId,
				seedTrack: {
					query: body.query,
					playlistSize: body.playlistSize,
					preferences: body.preferences
				}
			})
		});

		if (!pipelineResponse.ok) {
			// Rollback credits
			await platform.env.DB.prepare(
				`UPDATE users SET
          credits_available = credits_available + ?,
          credits_pending = credits_pending - ?
        WHERE id = ?`
			)
				.bind(creditsNeeded, creditsNeeded, session.userId)
				.run();

			throw error(500, 'Failed to start pipeline');
		}

		const pipelineResult = await pipelineResponse.json();

		return json({
			runId,
			status: 'pending',
			creditsCharged: creditsNeeded,
			...pipelineResult
		});
	} catch (err) {
		// Rollback credits on any error
		await platform.env.DB.prepare(
			`UPDATE users SET
        credits_available = credits_available + ?,
        credits_pending = credits_pending - ?
      WHERE id = ?`
		)
			.bind(creditsNeeded, creditsNeeded, session.userId)
			.run();

		throw err;
	}
};
