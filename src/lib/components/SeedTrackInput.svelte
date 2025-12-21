<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		submit: {
			query: string;
			playlistSize: number;
			preferences: {
				eraRange?: [number, number];
				moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
				popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
			};
		};
	}>();

	let query = $state('');
	let playlistSize = $state(30);
	let showAdvanced = $state(false);

	// Advanced preferences
	let moodBias = $state<'upbeat' | 'melancholy' | 'energetic' | 'chill' | undefined>(undefined);
	let popularityBias = $state<'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced'>('balanced');
	let eraStart = $state<number | undefined>(undefined);
	let eraEnd = $state<number | undefined>(undefined);

	const playlistSizes = [
		{ value: 15, label: '15 tracks', credits: 1 },
		{ value: 30, label: '30 tracks', credits: 2 },
		{ value: 50, label: '50 tracks', credits: 2 },
		{ value: 75, label: '75 tracks', credits: 3 },
		{ value: 100, label: '100 tracks', credits: 4 }
	];

	function handleSubmit() {
		if (!query.trim()) return;

		const preferences: {
			eraRange?: [number, number];
			moodBias?: 'upbeat' | 'melancholy' | 'energetic' | 'chill';
			popularityBias?: 'popular' | 'deep-cuts' | 'hidden-gems' | 'balanced';
		} = {};

		if (moodBias) preferences.moodBias = moodBias;
		if (popularityBias !== 'balanced') preferences.popularityBias = popularityBias;
		if (eraStart && eraEnd) preferences.eraRange = [eraStart, eraEnd];

		dispatch('submit', {
			query: query.trim(),
			playlistSize,
			preferences
		});
	}

	function getCreditsForSize(size: number): number {
		return playlistSizes.find((s) => s.value === size)?.credits || 2;
	}
</script>

<form onsubmit={handleSubmit} class="seed-input">
	<div class="input-group">
		<label for="seed-query">Enter a song to build your playlist around</label>
		<input
			id="seed-query"
			type="text"
			bind:value={query}
			placeholder="e.g., 'Paranoid Android by Radiohead' or 'Bohemian Rhapsody'"
			required
		/>
		<p class="hint">Try: "Song by Artist" or "Artist - Song"</p>
	</div>

	<div class="size-selector">
		<label>Playlist Size</label>
		<div class="size-options">
			{#each playlistSizes as option}
				<button
					type="button"
					class="size-option"
					class:selected={playlistSize === option.value}
					onclick={() => (playlistSize = option.value)}
				>
					<span class="size-label">{option.label}</span>
					<span class="size-credits">{option.credits} credit{option.credits > 1 ? 's' : ''}</span>
				</button>
			{/each}
		</div>
	</div>

	<button
		type="button"
		class="advanced-toggle"
		onclick={() => (showAdvanced = !showAdvanced)}
	>
		{showAdvanced ? '▼' : '▶'} Advanced Options
	</button>

	{#if showAdvanced}
		<div class="advanced-options">
			<div class="option-group">
				<label>Mood Preference</label>
				<select bind:value={moodBias}>
					<option value={undefined}>No preference</option>
					<option value="upbeat">Upbeat</option>
					<option value="melancholy">Melancholy</option>
					<option value="energetic">Energetic</option>
					<option value="chill">Chill</option>
				</select>
			</div>

			<div class="option-group">
				<label>Discovery Level</label>
				<select bind:value={popularityBias}>
					<option value="balanced">Balanced mix</option>
					<option value="popular">Mostly popular tracks</option>
					<option value="deep-cuts">Deep cuts & B-sides</option>
					<option value="hidden-gems">Hidden gems only</option>
				</select>
			</div>

			<div class="option-group era-range">
				<label>Era Range (optional)</label>
				<div class="era-inputs">
					<input
						type="number"
						bind:value={eraStart}
						placeholder="From"
						min="1900"
						max="2025"
					/>
					<span>to</span>
					<input
						type="number"
						bind:value={eraEnd}
						placeholder="To"
						min="1900"
						max="2025"
					/>
				</div>
			</div>
		</div>
	{/if}

	<button type="submit" class="generate-button" disabled={!query.trim()}>
		Generate Playlist ({getCreditsForSize(playlistSize)} credit{getCreditsForSize(playlistSize) > 1 ? 's' : ''})
	</button>
</form>

<style>
	.seed-input {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 600px;
		margin: 0 auto;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-weight: 500;
		color: #e0e0e0;
	}

	.input-group input {
		padding: 0.875rem 1rem;
		font-size: 1.1rem;
		border: 2px solid #3a3a4a;
		border-radius: 8px;
		background: #1a1a2e;
		color: #fff;
		transition: border-color 0.2s;
	}

	.input-group input:focus {
		outline: none;
		border-color: #6366f1;
	}

	.hint {
		font-size: 0.85rem;
		color: #888;
	}

	.size-selector label {
		display: block;
		font-weight: 500;
		color: #e0e0e0;
		margin-bottom: 0.5rem;
	}

	.size-options {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.size-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 1rem;
		border: 2px solid #3a3a4a;
		border-radius: 8px;
		background: #1a1a2e;
		color: #e0e0e0;
		cursor: pointer;
		transition: all 0.2s;
	}

	.size-option:hover {
		border-color: #6366f1;
	}

	.size-option.selected {
		border-color: #6366f1;
		background: #2d2d5a;
	}

	.size-label {
		font-weight: 500;
	}

	.size-credits {
		font-size: 0.75rem;
		color: #888;
	}

	.advanced-toggle {
		background: none;
		border: none;
		color: #6366f1;
		cursor: pointer;
		font-size: 0.9rem;
		text-align: left;
		padding: 0;
	}

	.advanced-toggle:hover {
		text-decoration: underline;
	}

	.advanced-options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: #1a1a2e;
		border-radius: 8px;
		border: 1px solid #3a3a4a;
	}

	.option-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.option-group label {
		font-size: 0.9rem;
		color: #b0b0b0;
	}

	.option-group select {
		padding: 0.5rem;
		border: 1px solid #3a3a4a;
		border-radius: 4px;
		background: #0d0d1a;
		color: #e0e0e0;
	}

	.era-inputs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.era-inputs input {
		width: 80px;
		padding: 0.5rem;
		border: 1px solid #3a3a4a;
		border-radius: 4px;
		background: #0d0d1a;
		color: #e0e0e0;
	}

	.era-inputs span {
		color: #888;
	}

	.generate-button {
		padding: 1rem 2rem;
		font-size: 1.1rem;
		font-weight: 600;
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: white;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.generate-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
	}

	.generate-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
