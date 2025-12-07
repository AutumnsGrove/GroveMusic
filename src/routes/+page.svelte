<script lang="ts">
	let seedQuery = $state('');
	let playlistSize = $state(15);
</script>

<main>
	<header>
		<h1>GroveMusic</h1>
		<p>AI-powered playlist generation based on seed tracks</p>
	</header>

	<section class="generator">
		<form>
			<label for="seed-track">
				Enter a seed track
				<input
					id="seed-track"
					type="text"
					bind:value={seedQuery}
					placeholder="Song Name by Artist"
				/>
			</label>

			<label for="playlist-size">
				Playlist size: {playlistSize}
				<input
					id="playlist-size"
					type="range"
					min="15"
					max="100"
					step="5"
					bind:value={playlistSize}
				/>
			</label>

			<button type="submit" disabled={!seedQuery.trim()}>
				Generate Playlist
			</button>
		</form>
	</section>
</main>

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 3rem;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #22c55e, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	header p {
		color: #888;
	}

	.generator {
		background: #1a1a1a;
		border-radius: 1rem;
		padding: 2rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #aaa;
	}

	input[type="text"] {
		padding: 0.75rem 1rem;
		border: 1px solid #333;
		border-radius: 0.5rem;
		background: #0a0a0a;
		color: #fafafa;
		font-size: 1rem;
	}

	input[type="text"]:focus {
		outline: none;
		border-color: #22c55e;
	}

	input[type="range"] {
		accent-color: #22c55e;
	}

	button {
		padding: 1rem;
		border: none;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, #22c55e, #16a34a);
		color: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	button:hover:not(:disabled) {
		opacity: 0.9;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
