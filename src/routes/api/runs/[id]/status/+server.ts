/**
 * Run Status Route
 * Returns real-time status or streams updates via SSE
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const GET: RequestHandler = async ({ params, url, platform, cookies }) => {
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

	// Verify run belongs to user
	const run = await platform.env.DB.prepare(
		'SELECT id, status FROM runs WHERE id = ? AND user_id = ?'
	)
		.bind(params.id, session.userId)
		.first();

	if (!run) {
		throw error(404, 'Run not found');
	}

	// Check if SSE stream is requested
	const stream = url.searchParams.get('stream') === 'true';

	if (stream) {
		// Return SSE stream from pipeline worker
		const pipelineUrl = platform.env.PIPELINE_WORKER_URL || 'http://localhost:8787';
		const pipelineResponse = await fetch(`${pipelineUrl}/pipeline/${params.id}/stream`);

		return new Response(pipelineResponse.body, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	}

	// Return one-time status from pipeline worker
	const pipelineUrl = platform.env.PIPELINE_WORKER_URL || 'http://localhost:8787';
	const pipelineResponse = await fetch(`${pipelineUrl}/pipeline/${params.id}/status`);

	if (!pipelineResponse.ok) {
		// Fallback to database status
		return json({
			runId: params.id,
			status: run.status,
			progress: run.status === 'complete' ? 100 : 0
		});
	}

	const status = await pipelineResponse.json();
	return json(status);
};
