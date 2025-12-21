/**
 * LLM Service Abstraction
 * Provides a unified interface for Claude and future LLM providers.
 */

import type { EnrichedTrack, ScoredTrack, PlaylistTrack } from '$lib/types';

export type LLMProvider = 'claude' | 'deepseek' | 'kimi';

export interface LLMConfig {
	provider: LLMProvider;
	model: string;
	apiKey: string;
	maxTokens: number;
	temperature: number;
}

export interface TrackExplanation {
	mbid: string;
	reason: string;
	flowRole: PlaylistTrack['flowRole'];
}

export interface CurationContext {
	seedTrack: EnrichedTrack;
	candidates: ScoredTrack[];
	playlistSize: number;
	preferences?: {
		moodBias?: string;
		popularityBias?: string;
	};
}

export interface LLMService {
	config: LLMConfig;

	generateTrackExplanations(context: CurationContext): Promise<TrackExplanation[]>;

	suggestPlaylistOrder(tracks: ScoredTrack[]): Promise<string[]>;

	generatePlaylistNarrative(seedTrack: EnrichedTrack, playlist: PlaylistTrack[]): Promise<string>;
}

/** Claude/Anthropic implementation */
export class ClaudeService implements LLMService {
	config: LLMConfig;

	constructor(config: Partial<LLMConfig> & { apiKey: string }) {
		this.config = {
			provider: 'claude',
			model: config.model || 'claude-sonnet-4-20250514',
			apiKey: config.apiKey,
			maxTokens: config.maxTokens || 4096,
			temperature: config.temperature || 0.7
		};
	}

	private async request(
		messages: Array<{ role: 'user' | 'assistant'; content: string }>,
		system?: string
	): Promise<string> {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.config.apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: this.config.model,
				max_tokens: this.config.maxTokens,
				temperature: this.config.temperature,
				system,
				messages
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Claude API error: ${response.status} - ${error}`);
		}

		const data = (await response.json()) as {
			content: Array<{ type: string; text: string }>;
		};

		return data.content[0]?.text || '';
	}

	async generateTrackExplanations(context: CurationContext): Promise<TrackExplanation[]> {
		const { seedTrack, candidates, playlistSize } = context;

		// Take top candidates based on playlist size
		const topCandidates = candidates.slice(0, playlistSize);

		const system = `You are a music curator creating personalized playlist explanations.
Your task is to explain why each track connects to the seed track.
Be concise (2-3 sentences per track), insightful, and focus on musical connections.
Output valid JSON only.`;

		const prompt = `Given this seed track:
- "${seedTrack.title}" by ${seedTrack.artist}
- Tags: ${seedTrack.tags.slice(0, 5).map((t) => t.name).join(', ')}

Explain why each of these tracks belongs in the playlist. For each track, provide:
1. A 2-3 sentence "reason" explaining the musical connection
2. A "flowRole" (one of: opener, builder, peak, valley, closer, transition)

Tracks to explain:
${topCandidates
	.map(
		(t, i) => `${i + 1}. "${t.title}" by ${t.artist} (similarity: ${t.scores.overall.toFixed(1)}/10)
   Tags: ${t.tags.slice(0, 3).map((tag) => tag.name).join(', ')}`
	)
	.join('\n')}

Respond with a JSON array of objects with keys: mbid, reason, flowRole
Example: [{"mbid": "abc-123", "reason": "This track shares...", "flowRole": "builder"}]`;

		try {
			const response = await this.request([{ role: 'user', content: prompt }], system);

			// Extract JSON from response (handle markdown code blocks)
			const jsonMatch = response.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				throw new Error('No JSON array found in response');
			}

			const explanations = JSON.parse(jsonMatch[0]) as TrackExplanation[];

			// Ensure we have explanations for all tracks
			return topCandidates.map((track, index) => {
				const explanation = explanations[index] || {
					mbid: track.mbid,
					reason: `This track shares similar sonic qualities with "${seedTrack.title}".`,
					flowRole: this.assignDefaultFlowRole(index, topCandidates.length)
				};
				return {
					mbid: track.mbid,
					reason: explanation.reason,
					flowRole: explanation.flowRole
				};
			});
		} catch (error) {
			console.error('LLM explanation generation failed:', error);
			// Fallback to template-based explanations
			return topCandidates.map((track, index) => ({
				mbid: track.mbid,
				reason: this.generateFallbackReason(seedTrack, track),
				flowRole: this.assignDefaultFlowRole(index, topCandidates.length)
			}));
		}
	}

	async suggestPlaylistOrder(tracks: ScoredTrack[]): Promise<string[]> {
		const system = `You are a DJ creating a flowing playlist.
Order these tracks for the best listening experience.
Consider energy flow, key transitions, and emotional arc.
Output only a JSON array of track MBIDs in the suggested order.`;

		const prompt = `Order these tracks for optimal flow:
${tracks
	.map(
		(t) =>
			`- "${t.title}" by ${t.artist} (MBID: ${t.mbid})
  Energy: ${this.describeScore(t.scores.tagOverlap)}, Category: ${t.category}`
	)
	.join('\n')}

Respond with a JSON array of MBIDs in order: ["mbid1", "mbid2", ...]`;

		try {
			const response = await this.request([{ role: 'user', content: prompt }], system);

			const jsonMatch = response.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				throw new Error('No JSON array found in response');
			}

			return JSON.parse(jsonMatch[0]) as string[];
		} catch (error) {
			console.error('LLM ordering failed:', error);
			// Fallback: return original order
			return tracks.map((t) => t.mbid);
		}
	}

	async generatePlaylistNarrative(
		seedTrack: EnrichedTrack,
		playlist: PlaylistTrack[]
	): Promise<string> {
		const system = `You are a music writer creating playlist descriptions.
Write engaging, concise narratives that capture the playlist's essence.
Keep it to 2-3 sentences.`;

		const prompt = `Write a brief narrative for this playlist:

Seed track: "${seedTrack.title}" by ${seedTrack.artist}
Number of tracks: ${playlist.length}
Key artists: ${[...new Set(playlist.slice(0, 5).map((t) => t.artist))].join(', ')}
Vibe: ${seedTrack.tags.slice(0, 3).map((t) => t.name).join(', ')}

Write 2-3 sentences capturing the playlist's essence.`;

		try {
			const response = await this.request([{ role: 'user', content: prompt }], system);
			return response.trim();
		} catch (error) {
			console.error('LLM narrative failed:', error);
			return `A ${playlist.length}-track journey inspired by "${seedTrack.title}" by ${seedTrack.artist}, exploring similar sonic territories.`;
		}
	}

	private describeScore(score: number): string {
		if (score >= 0.8) return 'high';
		if (score >= 0.5) return 'medium';
		return 'low';
	}

	private assignDefaultFlowRole(
		index: number,
		total: number
	): PlaylistTrack['flowRole'] {
		const position = index / (total - 1);
		if (index === 0) return 'opener';
		if (index === total - 1) return 'closer';
		if (position < 0.3) return 'builder';
		if (position < 0.6) return 'peak';
		if (position < 0.8) return 'valley';
		return 'transition';
	}

	private generateFallbackReason(seed: EnrichedTrack, track: ScoredTrack): string {
		const sharedTags = seed.tags
			.filter((t) => track.tags.some((tt) => tt.name === t.name))
			.slice(0, 2)
			.map((t) => t.name);

		if (sharedTags.length > 0) {
			return `Shares the ${sharedTags.join(' and ')} aesthetic with "${seed.title}", creating a natural sonic connection.`;
		}

		if (track.scores.artistSimilarity > 0.5) {
			return `From an artist in ${seed.artist}'s musical orbit, bringing familiar creative sensibilities.`;
		}

		return `Complements the mood of "${seed.title}" with similar energy and production style.`;
	}
}

/** Factory function to create LLM service based on provider */
export function createLLMService(config: Partial<LLMConfig> & { apiKey: string }): LLMService {
	const provider = config.provider || 'claude';

	switch (provider) {
		case 'claude':
			return new ClaudeService(config);
		case 'deepseek':
		case 'kimi':
			// Future: implement these providers
			console.warn(`Provider ${provider} not yet implemented, falling back to Claude`);
			return new ClaudeService(config);
		default:
			return new ClaudeService(config);
	}
}

/** Prompt templates for LLM calls */
export const PROMPT_TEMPLATES = {
	trackExplanation: `Given seed track "{seedTitle}" by {seedArtist}, explain why "{trackTitle}" by {trackArtist} belongs in this playlist. Be concise (2-3 sentences).`,

	playlistNarrative: `Write a brief (2-3 sentence) description for a playlist inspired by "{seedTitle}" by {seedArtist} featuring {trackCount} tracks.`,

	flowOrdering: `As a DJ, order these {trackCount} tracks for optimal listening flow, considering energy, mood, and transitions.`
} as const;
