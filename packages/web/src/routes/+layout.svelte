<script lang="ts">
  import type { LayoutData } from './$types'

  let { data, children } = $props<{ data: LayoutData; children: any }>()
</script>

<svelte:head>
  <title>{data.meta?.title ?? 'Haps'}</title>
  {#if data.meta}
    <meta property="og:title" content={data.meta.title} />
    <meta property="og:description" content={data.meta.description ?? ''} />
    <meta property="og:image" content={data.meta.image ?? ''} />
    <meta property="og:url" content={data.meta.url ?? ''} />
    <meta name="twitter:card" content="summary_large_image" />
  {/if}
</svelte:head>

<nav class="nav">
  <a href="/" class="nav-brand">Haps</a>
  <div class="nav-links">
    <a href="/my-events">My Events</a>
  </div>
</nav>

{@render children()}

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #1a1510;
    background: #e8ddd0;
  }
  :global(a) { color: #b05525; }
  :global(button) { cursor: pointer; }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #f0e8da;
    border-bottom: 1px solid #cfc3b0;
  }
  .nav-brand {
    font-weight: 800;
    font-size: 1.1rem;
    text-decoration: none;
    color: #1a1510;
    letter-spacing: 0.02em;
  }
  .nav-links {
    display: flex;
    gap: 1rem;
  }
  .nav-links a {
    text-decoration: none;
    font-size: 0.9rem;
    color: #3d352e;
  }
  .nav-links a:hover { color: #b05525; }
</style>
