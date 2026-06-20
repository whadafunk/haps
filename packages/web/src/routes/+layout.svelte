<script lang="ts">
  import type { LayoutData } from './$types'
  import { goto, invalidateAll } from '$app/navigation'
  import { apiFetch } from '$lib/api'

  let { data, children } = $props<{ data: LayoutData; children: any }>()

  let menuOpen = $state(false)
  let bellOpen = $state(false)
  let notifications = $state<Array<{ id: string; type: string; body: string; link: string | null; read: boolean; createdAt: string }>>([])
  let unreadCount = $state(data.unreadCount ?? 0)
  let notifLoaded = $state(false)

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as Node
    if (!document.querySelector('.user-menu')?.contains(target)) menuOpen = false
    if (!document.querySelector('.bell-menu')?.contains(target)) bellOpen = false
  }

  function clearIdentity() {
    menuOpen = false
    goto('/clear-identity', { invalidateAll: true })
  }

  async function openBell() {
    bellOpen = !bellOpen
    if (bellOpen && !notifLoaded) {
      try {
        const data = await apiFetch<{ notifications: typeof notifications; unreadCount: number }>('/notifications')
        notifications = data.notifications.slice(0, 8)
        unreadCount = data.unreadCount
        notifLoaded = true
      } catch { /* non-critical */ }
    }
  }

  async function markAllRead() {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      notifications = notifications.map(n => ({ ...n, read: true }))
      unreadCount = 0
      invalidateAll()
    } catch { /* non-critical */ }
  }

  async function markRead(id: string, link: string | null) {
    bellOpen = false
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' })
      notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n)
      unreadCount = Math.max(0, unreadCount - 1)
    } catch { /* non-critical */ }
    if (link) goto(link)
  }

  function notifIcon(type: string) {
    if (type === 'welcome') return '👋'
    if (type === 'event_cancelled') return '❌'
    if (type === 'event_rescheduled') return '📅'
    if (type === 'waitlist_promotion' || type === 'waitlist_confirmed') return '🎉'
    if (type.startsWith('reminder')) return '⏰'
    if (type === 'new_message') return '💬'
    if (type === 'new_signal') return '✨'
    if (type === 'crush_revealed') return '💘'
    return '🔔'
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const hasSession = $derived(data.user || data.session)
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
    {/if}

    {#if hasSession}
      <div class="bell-menu">
        <button class="bell-btn" onclick={openBell} aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {#if unreadCount > 0}
            <span class="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          {/if}
        </button>
        {#if bellOpen}
          <div class="bell-dropdown" role="menu">
            <div class="bell-header">
              <span class="bell-title">Notifications</span>
              {#if unreadCount > 0}
                <button class="bell-read-all" onclick={markAllRead}>Mark all read</button>
              {/if}
            </div>
            {#if notifications.length === 0}
              <p class="bell-empty">No notifications yet.</p>
            {:else}
              {#each notifications as n (n.id)}
                <button
                  class="notif-item"
                  class:notif-unread={!n.read}
                  onclick={() => markRead(n.id, n.link)}
                >
                  <span class="notif-icon">{notifIcon(n.type)}</span>
                  <span class="notif-body">
                    <span class="notif-text">{n.body}</span>
                    <span class="notif-time">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if data.user}
      <div class="user-menu">
        <button class="user-menu-btn" onclick={() => (menuOpen = !menuOpen)}>
          {data.user.displayName}<span class="chevron" class:open={menuOpen}>▾</span>
        </button>
        {#if menuOpen}
          <div class="user-menu-dropdown" role="menu">
            {#if data.user.type === 'guest'}
              <a href="/my-events" class="menu-item" onclick={() => (menuOpen = false)}>My events</a>
            {/if}
            <a href="/account" class="menu-item" onclick={() => (menuOpen = false)}>My account</a>
            <a href="/logout" class="menu-item menu-item-logout" data-sveltekit-reload>Log out</a>
          </div>
        {/if}
      </div>
    {:else if data.session}
      <div class="user-menu">
        <button class="user-menu-btn" onclick={() => (menuOpen = !menuOpen)}>
          {data.session.displayName ?? 'My account'}<span class="chevron" class:open={menuOpen}>▾</span>
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

  /* Bell */
  .bell-menu { position: relative; }
  .bell-btn {
    position: relative;
    background: none;
    border: 1px solid #cfc3b0;
    border-radius: 6px;
    padding: 0.375rem 0.5rem;
    color: #3d352e;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bell-btn:hover { border-color: #b05525; color: #b05525; }
  .bell-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #b05525;
    color: #fff;
    font-size: 0.625rem;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    line-height: 1;
  }
  .bell-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    width: 300px;
    max-width: calc(100vw - 2rem);
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    overflow: hidden;
  }
  .bell-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid #e0d4c3;
  }
  .bell-title { font-size: 0.8rem; font-weight: 600; color: #3d352e; text-transform: uppercase; letter-spacing: 0.05em; }
  .bell-read-all {
    background: none;
    border: none;
    font-size: 0.75rem;
    color: #924418;
    padding: 0;
    font-family: inherit;
  }
  .bell-read-all:hover { color: #b05525; }
  .bell-empty { margin: 1.25rem 0.875rem; font-size: 0.875rem; color: #7a6e64; }
  .notif-item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.875rem;
    background: none;
    border: none;
    border-bottom: 1px solid #e8ddd0;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }
  .notif-item:last-child { border-bottom: none; }
  .notif-item:hover { background: #e8ddd0; }
  .notif-unread { background: #faf3e8; }
  .notif-unread:hover { background: #f5ead8; }
  .notif-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
  .notif-body { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
  .notif-text { font-size: 0.8rem; color: #1a1510; line-height: 1.4; word-break: break-word; }
  .notif-time { font-size: 0.7rem; color: #9a8e84; }

  /* User menu */
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
