/**
 * Auth Login Route
 * Initiates Heartwood OAuth flow
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const GET: RequestHandler = async ({ platform, cookies }) => {
	if (!platform?.env) {
		throw new Error('Platform bindings not available');
	}

	const authService = new HeartWoodAuthService({
		clientId: platform.env.HEARTWOOD_CLIENT_ID || 'grovemusic',
		clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
		redirectUri: platform.env.HEARTWOOD_REDIRECT_URI || 'https://aria.grove.place/api/auth/callback',
		sessionsKV: platform.env.SESSIONS
	});

	const { authUrl, state, codeVerifier } = await authService.startLogin();

	// Store state and code verifier for PKCE
	await authService.storeAuthState(state, codeVerifier);

	// Also store state in a cookie for validation
	cookies.set('auth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});

	throw redirect(302, authUrl);
};
