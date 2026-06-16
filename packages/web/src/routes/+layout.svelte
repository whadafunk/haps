<script lang="ts">
  import type { LayoutData } from './$types'
  import { api } from '$lib/api'
  import { goto } from '$app/navigation'

  let { data, children } = $props<{ data: LayoutData; children: any }>()

  let menuOpen = $state(false)

  function handleWindowClick(e: MouseEvent) {
    const menu = document.querySelector('.user-menu')
    if (menu && !menu.contains(e.target as Node)) menuOpen = false
  }

  function clearIdentity() {
    menuOpen = false
    goto('/clear-identity')
  }
</script>

<svelte:window onclick={handleWindowClick} />

<svelte:head>
  {#if data.meta?.title}
    <title>{data.meta.title} · Haps</title>
  {:else}
    <title>Haps</title>
  {/if}
  {#if data.meta}
    <meta property="og:title" content={data.meta.title ?? ''} />
    <meta property="og:description" content={data.meta.description ?? ''} />
    <meta property="og:image" content={data.meta.image ?? ''} />
    <meta property="og:url" content={data.meta.url ?? ''} />
    <meta name="twitter:card" content="summary_large_image" />
  {/if}
</svelte:head>

<nav class="nav">
  <a href="/" class="nav-brand">Haps</a>
  <div class="nav-right">
    {#if data.user}
      {#if data.user.role === 'admin' || data.user.role === 'organizer'}
        <a href="/admin" class="nav-link">Dashboard</a>
      {/if}
      <div class="user-menu">
        <button class="user-menu-btn" onclick={() => (menuOpen = !menuOpen)}>
          {data.user.displayName}<span class="chevron" class:open={menuOpen}>▾</span>
        </button>
        {#if menuOpen}
          <div class="user-menu-dropdown" role="menu">
            {#if data.user.role === 'member'}
              <a href="/my-events" class="menu-item" onclick={() => (menuOpen = false)}>My events</a>
            {/if}
            <a href="/account" class="menu-item" onclick={() => (menuOpen = false)}>My account</a>
            <a href="/logout" class="menu-item menu-item-logout" data-sveltekit-reload>Log out</a>
          </div>
        {/if}
      </div>
    {:else if data.session?.displayName}
      <div class="user-menu">
        <button class="user-menu-btn" onclick={() => (menuOpen = !menuOpen)}>
          {data.session.displayName}<span class="chevron" class:open={menuOpen}>▾</span>
        </button>
        {#if menuOpen}
          <div class="user-menu-dropdown" role="menu">
            <a href="/my-events" class="menu-item" onclick={() => (menuOpen = false)}>My events</a>
            <a href="/register" class="menu-item" onclick={() => (menuOpen = false)}>Create account</a>
            <a href="/login" class="menu-item" onclick={() => (menuOpen = false)}>Log in</a>
            <button class="menu-item menu-item-clear" onclick={clearIdentity}>Clear identity</button>
          </div>
        {/if}
      </div>
    {:else}
      <a href="/register" class="nav-link">Register</a>
      <a href="/login" class="nav-link nav-link-cta">Log in</a>
    {/if}
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
  :global(a) { color: #924418; }
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
  .nav-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .nav-link {
    text-decoration: none;
    font-size: 0.9rem;
    color: #3d352e;
  }
  .nav-link:hover { color: #b05525; }
  .nav-link-cta {
    background: #b05525;
    color: #fff;
    padding: 0.375rem 0.875rem;
    border-radius: 6px;
    font-weight: 600;
  }
  .nav-link-cta:hover { background: #924418; color: #fff; }

  .user-menu { position: relative; }
  .user-menu-btn {
    background: none;
    border: 1px solid #cfc3b0;
    border-radius: 6px;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #3d352e;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .user-menu-btn:hover { border-color: #b05525; color: #b05525; }
  .chevron {
    font-size: 0.7rem;
    transition: transform 0.15s;
    display: inline-block;
  }
  .chevron.open { transform: rotate(180deg); }
  .user-menu-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    padding: 0.375rem;
    min-width: 160px;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }
  .menu-item {
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: 5px;
    text-decoration: none;
    font-size: 0.875rem;
    color: #3d352e;
  }
  .menu-item:hover { background: #e8ddd0; color: #1a1510; }
  .menu-item-logout { color: #924418; margin-top: 0.25rem; border-top: 1px solid #cfc3b0; padding-top: 0.625rem; }
  .menu-item-logout:hover { background: #f8e8e2; color: #7a2a1a; }
  .menu-item-clear { width: 100%; text-align: left; background: none; border: none; font-family: inherit; color: #924418; margin-top: 0.25rem; border-top: 1px solid #cfc3b0; padding: 0.625rem 0.75rem 0.5rem; }
  .menu-item-clear:hover { background: #f8e8e2; color: #7a2a1a; }
</style>
