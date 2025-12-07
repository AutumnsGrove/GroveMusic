<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>GroveMusic</title>
</svelte:head>

{@render children()}

<style>
	:global(body) {
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		margin: 0;
		padding: 0;
		background: #0a0a0a;
		color: #fafafa;
	}

	:global(*) {
		box-sizing: border-box;
	}
</style>
