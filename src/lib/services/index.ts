/**
 * Services Index
 * Re-exports all service modules for convenient imports.
 */

// Last.fm API service
export { LastfmService, type LastfmServiceConfig } from './lastfm';

// MusicBrainz API service
export { MusicBrainzService, type MusicBrainzServiceConfig } from './musicbrainz';

// LLM service abstraction
export {
	ClaudeService,
	createLLMService,
	PROMPT_TEMPLATES,
	type LLMService,
	type LLMConfig,
	type LLMProvider,
	type TrackExplanation,
	type CurationContext
} from './llm';

// Heartwood authentication service
export {
	HeartWoodAuthService,
	getSessionTokenFromCookie,
	createSessionCookie,
	clearSessionCookie,
	type AuthConfig,
	type HeartWoodTokens,
	type HeartWoodUserInfo,
	type Session
} from './auth';
