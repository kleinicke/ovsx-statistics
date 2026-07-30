<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import { Moon, Sun } from 'lucide-svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />

<div class="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
	<header class="border-b border-[var(--color-border)] px-3 py-3 sm:px-6 sm:py-4">
		<div class="mx-auto flex max-w-7xl items-center justify-between">
			<a href="/" class="text-lg font-semibold tracking-tight">
				Open VSX Tracker
			</a>
			<button
				onclick={toggleMode}
				class="rounded-md p-2 hover:bg-[var(--color-accent)] transition-colors"
				aria-label="Toggle dark mode"
			>
				<Sun class="h-4 w-4 hidden dark:block" />
				<Moon class="h-4 w-4 dark:hidden" />
			</button>
		</div>
	</header>

	<main class="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6 sm:py-8">
		{@render children()}
	</main>

	<footer class="border-t border-[var(--color-border)] px-3 py-6 sm:px-6">
		<div
			class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-[var(--color-muted-foreground)]"
		>
			<span>© {new Date().getFullYear()} Florian Kleinicke</span>
			<nav class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<a
					href="https://f-kleinicke.de"
					class="hover:text-[var(--color-foreground)] transition-colors"
				>
					f-kleinicke.de
				</a>
				<a
					href="https://f-kleinicke.de/impressum.html"
					class="hover:text-[var(--color-foreground)] transition-colors"
				>
					Impressum
				</a>
				<a
					href="https://f-kleinicke.de/datenschutz.html"
					class="hover:text-[var(--color-foreground)] transition-colors"
				>
					Datenschutz
				</a>
			</nav>
		</div>
	</footer>
</div>
