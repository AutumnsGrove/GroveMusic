/**
 * Home Page Server Load
 * Fetches user data if authenticated
 */

import type { PageServerLoad } from './$types';
import { HeartWoodAuthService } from '$lib/services/auth';

export const load: PageServerLoad = async ({ platform, cookies }) => {
	if (!platform?.env) {
		return { user: null };
	}

	const sessionToken = cookies.get('session');
	if (!sessionToken) {
		return { user: null };
	}

	try {
		const authService = new HeartWoodAuthService({
			clientId: platform.env.HEARTWOOD_CLIENT_ID || '',
			clientSecret: platform.env.HEARTWOOD_CLIENT_SECRET || '',
			redirectUri: '',
			sessionsKV: platform.env.SESSIONS
		});

		const session = await authService.getSession(sessionToken);
		if (!session) {
			return { user: null };
		}

		const user = await platform.env.DB.prepare(
			`SELECT
				id,
				email,
				display_name,
				avatar_url,
				credits_available,
				credits_pending
			FROM users WHERE id = ?`
		)
			.bind(session.userId)
			.first();

		if (!user) {
			return { user: null };
		}

		return {
			user: {
				id: user.id as string,
				email: user.email as string,
				displayName: user.display_name as string | undefined,
				avatarUrl: user.avatar_url as string | undefined,
				credits: {
					available: (user.credits_available as number) || 0,
					pending: (user.credits_pending as number) || 0
				}
			}
		};
	} catch {
		return { user: null };
	}
};
