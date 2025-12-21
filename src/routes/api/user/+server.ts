/**
 * User Profile Route
 * Returns current user info and credits
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const GET: RequestHandler = async ({ platform, cookies }) => {
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

	const user = await platform.env.DB.prepare(
		`SELECT
			id,
			email,
			display_name,
			avatar_url,
			credits_available,
			credits_pending,
			credits_used_total,
			subscription_tier,
			subscription_expires_at,
			created_at,
			last_login_at
		FROM users WHERE id = ?`
	)
		.bind(session.userId)
		.first();

	if (!user) {
		throw error(404, 'User not found');
	}

	return json({
		id: user.id,
		email: user.email,
		displayName: user.display_name,
		avatarUrl: user.avatar_url,
		credits: {
			available: user.credits_available,
			pending: user.credits_pending,
			usedTotal: user.credits_used_total
		},
		subscription: {
			tier: user.subscription_tier,
			expiresAt: user.subscription_expires_at
		},
		createdAt: user.created_at,
		lastLoginAt: user.last_login_at
	});
};
