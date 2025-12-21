<script lang="ts">
	import { SeedTrackInput, PipelineProgress, PlaylistView, UserCredits } from '$lib/components';

	interface PageData {
		user?: {
			id: string;
			email: string;
			displayName?: string;
			credits: {
				available: number;
				pending: number;
			};
		};
	}

	let { data }: { data: PageData } = $props();

	// UI state
	let view = $state<'input' | 'generating' | 'result'>('input');
	let currentRunId = $state<string | null>(null);
	let playlist = $state<unknown[]>([]);
	let seedTrack = $state<{ title: string; artist: string } | null>(null);
	let errorMessage = $state<string | null>(null);

	async function handleSubmit(event: CustomEvent<{
		query: string;
		playlistSize: number;
		preferences: Record<string, unknown>;
	}>) {
		errorMessage = null;

		if (!data?.user) {
			window.location.href = '/api/auth/login';
			return;
		}

		try {
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(event.detail)
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to start generation');
			}

			const result = await response.json();
			currentRunId = result.runId;
			view = 'generating';

			// Parse query for seed track display
			const query = event.detail.query;
			const byMatch = query.match(/^(.+?)\s+by\s+(.+)$/i);
			const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);

			if (byMatch) {
				seedTrack = { title: byMatch[1].trim(), artist: byMatch[2].trim() };
			} else if (dashMatch) {
				seedTrack = { title: dashMatch[2].trim(), artist: dashMatch[1].trim() };
			} else {
				seedTrack = { title: query, artist: 'Unknown' };
			}
		} catch (err) {
			errorMessage = (err as Error).message;
		}
	}

	function handleComplete(result: unknown[]) {
		playlist = result;
		view = 'result';
	}

	function handleError(error: { code: string; message: string }) {
		errorMessage = error.message;
		view = 'input';
	}

	function resetToInput() {
		view = 'input';
		currentRunId = null;
		playlist = [];
		seedTrack = null;
		errorMessage = null;
	}
</script>

<main>
	<header>
		<h1>Aria</h1>
		<p>AI-powered playlist generation based on seed tracks</p>

		{#if data?.user}
			<div class="user-bar">
				<span class="user-name">
					{data.user.displayName || data.user.email}
				</span>
				<UserCredits
					available={data.user.credits.available}
					pending={data.user.credits.pending}
				/>
				<a href="/api/auth/logout" class="logout-link">Sign out</a>
			</div>
		{:else}
			<a href="/api/auth/login" class="login-button">Sign in with Google</a>
		{/if}
	</header>

	{#if errorMessage}
		<div class="error-banner">
			<span>⚠️</span>
			<p>{errorMessage}</p>
			<button onclick={() => (errorMessage = null)}>×</button>
		</div>
	{/if}

	{#if view === 'input'}
		<section class="generator">
			<SeedTrackInput onsubmit={handleSubmit} />
		</section>
	{:else if view === 'generating' && currentRunId}
		<PipelineProgress
			runId={currentRunId}
			onComplete={handleComplete}
			onError={handleError}
		/>
	{:else if view === 'result' && seedTrack && playlist.length > 0}
		<div class="result-header">
			<button class="back-button" onclick={resetToInput}>
				← Generate another
			</button>
		</div>
		<PlaylistView {seedTrack} playlist={playlist as never} />
	{/if}
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	header > p {
		color: #888;
		margin-bottom: 1rem;
	}

	.user-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.user-name {
		color: #e0e0e0;
		font-weight: 500;
	}

	.logout-link {
		color: #888;
		font-size: 0.9rem;
		text-decoration: none;
	}

	.logout-link:hover {
		color: #e0e0e0;
		text-decoration: underline;
	}

	.login-button {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: white;
		text-decoration: none;
		border-radius: 8px;
		font-weight: 500;
		transition: transform 0.2s;
	}

	.login-button:hover {
		transform: translateY(-2px);
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
		background: #3a1a1a;
		border: 1px solid #ef4444;
		border-radius: 8px;
	}

	.error-banner p {
		flex: 1;
		margin: 0;
		color: #f87171;
	}

	.error-banner button {
		background: none;
		border: none;
		color: #ef4444;
		font-size: 1.5rem;
		cursor: pointer;
		line-height: 1;
	}

	.generator {
		background: #1a1a2e;
		border-radius: 1rem;
		padding: 2rem;
		border: 1px solid #3a3a4a;
	}

	.result-header {
		margin-bottom: 1rem;
	}

	.back-button {
		background: none;
		border: 1px solid #3a3a4a;
		color: #888;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-button:hover {
		border-color: #6366f1;
		color: #e0e0e0;
	}
</style>
