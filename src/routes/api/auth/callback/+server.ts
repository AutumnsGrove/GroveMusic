/**
 * Auth Callback Route
 * Handles OAuth callback from Heartwood
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService, createSessionCookie } from '$lib/services/auth';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	if (!platform?.env) {
		throw error(500, 'Platform bindings not available');
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	// Handle OAuth errors
	if (errorParam) {
		const errorDescription = url.searchParams.get('error_description') || 'Authentication failed';
		throw redirect(302, `/?error=${encodeURIComponent(errorDescription)}`);
	}

	// Validate code and state
	if (!code || !state) {
		throw redirect(302, '/?error=missing_params');
	}

	// Validate state matches
	const cookieState = cookies.get('auth_state');
	if (!cookieState || cookieState !== state) {
		throw redirect(302, '/?error=invalid_state');
	}

	// Clear state cookie
	cookies.delete('auth_state', { path: '/' });

	const authService = new HeartWoodAuthService({
		clientId: platform.env.HEARTWOOD_CLIENT_ID || 'grovemusic',
		clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
		redirectUri: platform.env.HEARTWOOD_REDIRECT_URI || 'https://aria.grove.place/api/auth/callback',
		sessionsKV: platform.env.SESSIONS
	});

	try {
		// Get stored code verifier
		const authState = await authService.getAndClearAuthState(state);
		if (!authState) {
			throw redirect(302, '/?error=expired_state');
		}

		// Exchange code for tokens
		const tokens = await authService.exchangeCode(code, authState.codeVerifier);

		// Create session
		const { sessionToken, session } = await authService.createSession(tokens);

		// Create or update user in database
		await authService.getOrCreateUser(session, platform.env.DB);

		// Set session cookie
		cookies.set('session', sessionToken, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 30 * 24 * 60 * 60 // 30 days
		});

		// Redirect to home or return URL
		const returnUrl = url.searchParams.get('return') || '/';
		throw redirect(302, returnUrl);
	} catch (err) {
		if ((err as { status?: number })?.status === 302) {
			throw err;
		}
		console.error('Auth callback error:', err);
		throw redirect(302, '/?error=auth_failed');
	}
};
