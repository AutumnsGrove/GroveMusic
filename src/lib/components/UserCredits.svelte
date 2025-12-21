<script lang="ts">
	interface Props {
		available: number;
		pending?: number;
	}

	let { available, pending = 0 }: Props = $props();
</script>

<div class="credits-display">
	<div class="credits-icon">🎵</div>
	<div class="credits-info">
		<span class="credits-amount">{available}</span>
		<span class="credits-label">
			credit{available !== 1 ? 's' : ''} available
		</span>
		{#if pending > 0}
			<span class="credits-pending">({pending} pending)</span>
		{/if}
	</div>
</div>

<style>
	.credits-display {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #1a1a2e, #2d2d5a);
		border-radius: 8px;
		border: 1px solid #3a3a4a;
	}

	.credits-icon {
		font-size: 1.25rem;
	}

	.credits-info {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.credits-amount {
		font-size: 1.25rem;
		font-weight: 700;
		color: #4ade80;
	}

	.credits-label {
		font-size: 0.85rem;
		color: #888;
	}

	.credits-pending {
		font-size: 0.75rem;
		color: #f59e0b;
	}
</style>
