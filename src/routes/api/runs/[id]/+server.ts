/**
 * Individual Run Route
 * Returns details and playlist for a specific run
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const GET: RequestHandler = async ({ params, platform, cookies }) => {
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

	const run = await platform.env.DB.prepare(
		`SELECT * FROM runs WHERE id = ? AND user_id = ?`
	)
		.bind(params.id, session.userId)
		.first();

	if (!run) {
		throw error(404, 'Run not found');
	}

	// Parse playlist JSON
	let playlist = [];
	if (run.playlist_json) {
		try {
			playlist = JSON.parse(run.playlist_json as string);
		} catch {
			playlist = [];
		}
	}

	// Parse preferences JSON
	let preferences = {};
	if (run.preferences_json) {
		try {
			preferences = JSON.parse(run.preferences_json as string);
		} catch {
			preferences = {};
		}
	}

	return json({
		id: run.id,
		status: run.status,
		seedQuery: run.seed_query,
		seedTrack: run.seed_track_mbid
			? {
					mbid: run.seed_track_mbid,
					title: run.seed_track_title,
					artist: run.seed_track_artist
				}
			: null,
		playlistSize: run.playlist_size,
		preferences,
		playlist,
		trackCount: run.track_count,
		creditsCharged: run.credits_charged,
		processingTimeMs: run.processing_time_ms,
		error: run.error_message
			? {
					code: run.error_code,
					message: run.error_message
				}
			: null,
		createdAt: run.created_at,
		completedAt: run.completed_at
	});
};
