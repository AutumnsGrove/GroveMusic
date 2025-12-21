/**
 * Runs List Route
 * Returns user's playlist generation history
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	if (!platform?.env) {
		throw error(500, 'Platform bindings not available');
	}

	const sessionToken = cookies.get('session');
	if (!sessionToken) {
		throw error(401, 'Authentication required');
	}

	const authService = new HeartWoodAuthService({
		clientId: platform.env.HEARTWOOD_CLIENT_ID || '',
		clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
		redirectUri: '',
		sessionsKV: platform.env.SESSIONS
	});

	const session = await authService.getSession(sessionToken);
	if (!session) {
		throw error(401, 'Invalid or expired session');
	}

	// Pagination
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const runs = await platform.env.DB.prepare(
		`SELECT
			id,
			status,
			seed_query,
			seed_track_title,
			seed_track_artist,
			playlist_size,
			track_count,
			credits_charged,
			processing_time_ms,
			created_at,
			completed_at
		FROM runs
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?`
	)
		.bind(session.userId, limit, offset)
		.all();

	const total = await platform.env.DB.prepare(
		'SELECT COUNT(*) as count FROM runs WHERE user_id = ?'
	)
		.bind(session.userId)
		.first();

	return json({
		runs: runs.results.map((run) => ({
			id: run.id,
			status: run.status,
			seedQuery: run.seed_query,
			seedTrack: run.seed_track_title
				? {
						title: run.seed_track_title,
						artist: run.seed_track_artist
					}
				: null,
			playlistSize: run.playlist_size,
			trackCount: run.track_count,
			creditsCharged: run.credits_charged,
			processingTimeMs: run.processing_time_ms,
			createdAt: run.created_at,
			completedAt: run.completed_at
		})),
		pagination: {
			total: (total?.count as number) || 0,
			limit,
			offset
		}
	});
};
