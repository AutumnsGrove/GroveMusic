/**
 * Heartwood Auth Service
 * Integrates with GroveAuth (Heartwood) for centralized authentication.
 * Uses OAuth 2.0 Authorization Code flow with PKCE.
 */

import type { User } from '$lib/types';

const HEARTWOOD_URL = 'https://heartwood.grove.place';

export interface AuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	sessionsKV: KVNamespace;
}

export interface HeartWoodTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number; // Unix timestamp
}

export interface HeartWoodUserInfo {
	id: string;
	email: string;
	name?: string;
	picture?: string;
	provider: 'google' | 'github' | 'magic';
}

export interface Session {
	userId: string;
	email: string;
	displayName?: string;
	avatarUrl?: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	createdAt: number;
}

/**
 * Generate a cryptographically secure random string for PKCE.
 */
function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

/**
 * Generate the code challenge from the verifier (SHA-256).
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode (no padding, URL-safe characters).
 */
function base64UrlEncode(buffer: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...buffer));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a secure random state parameter.
 */
function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

/**
 * Generate a session token (random 32 bytes, hex encoded).
 */
function generateSessionToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export class HeartWoodAuthService {
	private config: AuthConfig;

	constructor(config: AuthConfig) {
		this.config = config;
	}

	/**
	 * Start the login flow - returns URL to redirect user to.
	 * Also returns state and code_verifier to store temporarily.
	 */
	async startLogin(): Promise<{
		authUrl: string;
		state: string;
		codeVerifier: string;
	}> {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);

		const params = new URLSearchParams({
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			response_type: 'code',
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256'
		});

		return {
			authUrl: `${HEARTWOOD_URL}/login?${params.toString()}`,
			state,
			codeVerifier
		};
	}

	/**
	 * Exchange authorization code for tokens.
	 */
	async exchangeCode(
		code: string,
		codeVerifier: string
	): Promise<HeartWoodTokens> {
		const response = await fetch(`${HEARTWOOD_URL}/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				grant_type: 'authorization_code',
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				code,
				redirect_uri: this.config.redirectUri,
				code_verifier: codeVerifier
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token exchange failed: ${response.status} - ${error}`);
		}

		const data = (await response.json()) as {
			access_token: string;
			refresh_token: string;
			expires_in: number;
		};

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000
		};
	}

	/**
	 * Refresh tokens using the refresh token.
	 */
	async refreshTokens(refreshToken: string): Promise<HeartWoodTokens> {
		const response = await fetch(`${HEARTWOOD_URL}/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				grant_type: 'refresh_token',
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				refresh_token: refreshToken
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token refresh failed: ${response.status} - ${error}`);
		}

		const data = (await response.json()) as {
			access_token: string;
			refresh_token: string;
			expires_in: number;
		};

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000
		};
	}

	/**
	 * Verify an access token.
	 */
	async verifyToken(accessToken: string): Promise<boolean> {
		try {
			const response = await fetch(`${HEARTWOOD_URL}/verify`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`
				}
			});

			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Get user info from Heartwood.
	 */
	async getUserInfo(accessToken: string): Promise<HeartWoodUserInfo | null> {
		try {
			const response = await fetch(`${HEARTWOOD_URL}/userinfo`, {
				headers: {
					Authorization: `Bearer ${accessToken}`
				}
			});

			if (!response.ok) {
				return null;
			}

			return (await response.json()) as HeartWoodUserInfo;
		} catch {
			return null;
		}
	}

	/**
	 * Create a session and store it in KV.
	 */
	async createSession(tokens: HeartWoodTokens): Promise<{ sessionToken: string; session: Session }> {
		const userInfo = await this.getUserInfo(tokens.accessToken);
		if (!userInfo) {
			throw new Error('Failed to get user info');
		}

		const sessionToken = generateSessionToken();
		const session: Session = {
			userId: userInfo.id,
			email: userInfo.email,
			displayName: userInfo.name,
			avatarUrl: userInfo.picture,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			expiresAt: tokens.expiresAt,
			createdAt: Date.now()
		};

		// Store session in KV (expires in 30 days)
		await this.config.sessionsKV.put(`session:${sessionToken}`, JSON.stringify(session), {
			expirationTtl: 30 * 24 * 60 * 60
		});

		return { sessionToken, session };
	}

	/**
	 * Get session from KV by session token.
	 */
	async getSession(sessionToken: string): Promise<Session | null> {
		const data = await this.config.sessionsKV.get(`session:${sessionToken}`, { type: 'json' });
		if (!data) {
			return null;
		}

		const session = data as Session;

		// Check if access token is expired or about to expire (within 5 minutes)
		if (session.expiresAt < Date.now() + 5 * 60 * 1000) {
			// Refresh tokens
			try {
				const newTokens = await this.refreshTokens(session.refreshToken);
				session.accessToken = newTokens.accessToken;
				session.refreshToken = newTokens.refreshToken;
				session.expiresAt = newTokens.expiresAt;

				// Update session in KV
				await this.config.sessionsKV.put(`session:${sessionToken}`, JSON.stringify(session), {
					expirationTtl: 30 * 24 * 60 * 60
				});
			} catch {
				// Refresh failed - session is invalid
				await this.deleteSession(sessionToken);
				return null;
			}
		}

		return session;
	}

	/**
	 * Delete a session.
	 */
	async deleteSession(sessionToken: string): Promise<void> {
		await this.config.sessionsKV.delete(`session:${sessionToken}`);
	}

	/**
	 * Get user from session, creating/updating in D1 if needed.
	 */
	async getOrCreateUser(session: Session, db: D1Database): Promise<User> {
		// Check if user exists
		const existing = await db
			.prepare('SELECT * FROM users WHERE id = ?')
			.bind(session.userId)
			.first();

		if (existing) {
			// Update last login
			await db
				.prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?')
				.bind(session.userId)
				.run();

			return {
				id: existing.id as string,
				googleId: existing.google_id as string,
				email: existing.email as string,
				displayName: existing.display_name as string | undefined,
				avatarUrl: existing.avatar_url as string | undefined,
				creditsAvailable: existing.credits_available as number,
				creditsPending: existing.credits_pending as number,
				creditsUsedTotal: existing.credits_used_total as number,
				subscriptionTier: existing.subscription_tier as User['subscriptionTier'],
				subscriptionExpiresAt: existing.subscription_expires_at
					? new Date(existing.subscription_expires_at as string)
					: undefined,
				createdAt: new Date(existing.created_at as string),
				updatedAt: new Date(existing.updated_at as string),
				lastLoginAt: new Date()
			};
		}

		// Create new user
		const id = session.userId;
		await db
			.prepare(
				`INSERT INTO users (id, google_id, email, display_name, avatar_url, last_login_at)
         VALUES (?, ?, ?, ?, ?, datetime("now"))`
			)
			.bind(id, id, session.email, session.displayName || null, session.avatarUrl || null)
			.run();

		return {
			id,
			googleId: id,
			email: session.email,
			displayName: session.displayName,
			avatarUrl: session.avatarUrl,
			creditsAvailable: 5, // Default free credits
			creditsPending: 0,
			creditsUsedTotal: 0,
			subscriptionTier: 'free',
			createdAt: new Date(),
			updatedAt: new Date(),
			lastLoginAt: new Date()
		};
	}

	/**
	 * Store temporary auth state (for PKCE flow).
	 */
	async storeAuthState(
		state: string,
		codeVerifier: string
	): Promise<void> {
		await this.config.sessionsKV.put(
			`auth_state:${state}`,
			JSON.stringify({ codeVerifier, createdAt: Date.now() }),
			{ expirationTtl: 10 * 60 } // 10 minute expiry
		);
	}

	/**
	 * Get and clear auth state.
	 */
	async getAndClearAuthState(
		state: string
	): Promise<{ codeVerifier: string } | null> {
		const data = await this.config.sessionsKV.get(`auth_state:${state}`, { type: 'json' });
		if (!data) {
			return null;
		}

		// Delete immediately to prevent replay
		await this.config.sessionsKV.delete(`auth_state:${state}`);

		return data as { codeVerifier: string };
	}
}

/**
 * Parse session token from cookie.
 */
export function getSessionTokenFromCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(';').map((c) => c.trim());
	const sessionCookie = cookies.find((c) => c.startsWith('session='));

	if (!sessionCookie) return null;

	return sessionCookie.split('=')[1];
}

/**
 * Create Set-Cookie header for session.
 */
export function createSessionCookie(sessionToken: string, maxAge = 30 * 24 * 60 * 60): string {
	return `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Create Set-Cookie header to clear session.
 */
export function clearSessionCookie(): string {
	return 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
