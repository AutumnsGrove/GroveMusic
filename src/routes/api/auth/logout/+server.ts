/**
 * Auth Logout Route
 * Clears session and redirects to home
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const POST: RequestHandler = async ({ platform, cookies }) => {
	if (!platform?.env) {
		throw redirect(302, '/');
	}

	const sessionToken = cookies.get('session');

	if (sessionToken) {
		const authService = new HeartWoodAuthService({
			clientId: platform.env.HEARTWOOD_CLIENT_ID || 'grovemusic',
			clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
			redirectUri: platform.env.HEARTWOOD_REDIRECT_URI || '',
			sessionsKV: platform.env.SESSIONS
		});

		// Delete session from KV
		await authService.deleteSession(sessionToken);
	}

	// Clear session cookie
	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};

// Also support GET for simple link-based logout
export const GET: RequestHandler = async ({ platform, cookies }) => {
	if (!platform?.env) {
		throw redirect(302, '/');
	}

	const sessionToken = cookies.get('session');

	if (sessionToken) {
		const authService = new HeartWoodAuthService({
			clientId: platform.env.HEARTWOOD_CLIENT_ID || 'grovemusic',
			clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
			redirectUri: platform.env.HEARTWOOD_REDIRECT_URI || '',
			sessionsKV: platform.env.SESSIONS
		});

		await authService.deleteSession(sessionToken);
	}

	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};
