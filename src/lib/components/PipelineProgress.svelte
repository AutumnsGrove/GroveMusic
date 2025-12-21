<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		runId: string;
		onComplete?: (playlist: unknown[]) => void;
		onError?: (error: { code: string; message: string }) => void;
	}

	let { runId, onComplete, onError }: Props = $props();

	let status = $state<string>('pending');
	let progress = $state(0);
	let error = $state<{ code: string; message: string } | null>(null);
	let eventSource: EventSource | null = null;

	const stages = [
		{ id: 'pending', label: 'Starting', emoji: '🎵' },
		{ id: 'resolving', label: 'Finding track', emoji: '🔍' },
		{ id: 'enriching', label: 'Gathering metadata', emoji: '📊' },
		{ id: 'generating', label: 'Finding similar tracks', emoji: '🎶' },
		{ id: 'scoring', label: 'Scoring candidates', emoji: '⚖️' },
		{ id: 'curating', label: 'Curating playlist', emoji: '✨' },
		{ id: 'explaining', label: 'Writing explanations', emoji: '📝' },
		{ id: 'complete', label: 'Complete!', emoji: '🎉' }
	];

	function getCurrentStageIndex(): number {
		return stages.findIndex((s) => s.id === status);
	}

	onMount(() => {
		// Connect to SSE stream
		eventSource = new EventSource(`/api/runs/${runId}/status?stream=true`);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				status = data.status;
				progress = data.progress;

				if (data.error) {
					error = data.error;
					if (onError) onError(data.error);
					eventSource?.close();
				}

				if (data.status === 'complete') {
					eventSource?.close();
					// Fetch complete result
					fetchResult();
				}
			} catch {
				console.error('Failed to parse SSE message');
			}
		};

		eventSource.onerror = () => {
			// Fallback to polling
			eventSource?.close();
			startPolling();
		};
	});

	onDestroy(() => {
		eventSource?.close();
	});

	async function fetchResult() {
		try {
			const response = await fetch(`/api/runs/${runId}`);
			if (response.ok) {
				const data = await response.json();
				if (onComplete && data.playlist) {
					onComplete(data.playlist);
				}
			}
		} catch (err) {
			console.error('Failed to fetch result:', err);
		}
	}

	function startPolling() {
		const poll = async () => {
			try {
				const response = await fetch(`/api/runs/${runId}/status`);
				if (response.ok) {
					const data = await response.json();
					status = data.status;
					progress = data.progress;

					if (data.error) {
						error = data.error;
						if (onError) onError(data.error);
						return;
					}

					if (data.status === 'complete') {
						fetchResult();
						return;
					}

					if (data.status !== 'failed') {
						setTimeout(poll, 1000);
					}
				}
			} catch {
				setTimeout(poll, 2000);
			}
		};
		poll();
	}
</script>

<div class="pipeline-progress">
	<div class="progress-header">
		<h3>Generating your playlist...</h3>
		<div class="progress-bar">
			<div class="progress-fill" style="width: {progress}%"></div>
		</div>
		<span class="progress-percent">{progress}%</span>
	</div>

	<div class="stages">
		{#each stages as stage, i}
			{@const currentIndex = getCurrentStageIndex()}
			<div
				class="stage"
				class:completed={i < currentIndex}
				class:active={i === currentIndex}
				class:pending={i > currentIndex}
			>
				<span class="stage-emoji">{stage.emoji}</span>
				<span class="stage-label">{stage.label}</span>
				{#if i === currentIndex && status !== 'complete' && status !== 'failed'}
					<span class="stage-spinner">⏳</span>
				{:else if i < currentIndex}
					<span class="stage-check">✓</span>
				{/if}
			</div>
		{/each}
	</div>

	{#if error}
		<div class="error-message">
			<span class="error-icon">⚠️</span>
			<div class="error-content">
				<strong>Error: {error.code}</strong>
				<p>{error.message}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.pipeline-progress {
		max-width: 500px;
		margin: 2rem auto;
		padding: 1.5rem;
		background: #1a1a2e;
		border-radius: 12px;
		border: 1px solid #3a3a4a;
	}

	.progress-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.progress-header h3 {
		margin: 0 0 1rem;
		color: #e0e0e0;
	}

	.progress-bar {
		height: 8px;
		background: #2a2a3a;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #6366f1, #8b5cf6);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-percent {
		font-size: 0.9rem;
		color: #888;
	}

	.stages {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.stage {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 8px;
		background: #0d0d1a;
		transition: all 0.2s;
	}

	.stage.completed {
		background: #1a3a2a;
		color: #4ade80;
	}

	.stage.active {
		background: #2d2d5a;
		color: #a5b4fc;
		animation: pulse 2s infinite;
	}

	.stage.pending {
		opacity: 0.5;
		color: #888;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.stage-emoji {
		font-size: 1.25rem;
	}

	.stage-label {
		flex: 1;
		font-weight: 500;
	}

	.stage-spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.stage-check {
		color: #4ade80;
		font-weight: bold;
	}

	.error-message {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		margin-top: 1rem;
		background: #3a1a1a;
		border: 1px solid #ef4444;
		border-radius: 8px;
	}

	.error-icon {
		font-size: 1.5rem;
	}

	.error-content {
		flex: 1;
	}

	.error-content strong {
		color: #ef4444;
	}

	.error-content p {
		margin: 0.5rem 0 0;
		color: #f87171;
		font-size: 0.9rem;
	}
</style>
