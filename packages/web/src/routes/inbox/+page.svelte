<script lang="ts">
  import type { PageData } from './$types'
  import type { InboxItem, DmThread } from './+page.server'
  import { apiFetch } from '$lib/api'
  import { onMount } from 'svelte'
  import { unreadCount } from '$lib/unread'
  import { page } from '$app/stores'

  let { data } = $props<{ data: PageData }>()

  let items = $state<InboxItem[]>(data.items)
  let threads = $state<DmThread[]>(data.threads)
  let busy = $state(false)

  // Tab from URL param so refreshing preserves it
  let activeTab = $derived(($page.url.searchParams.get('tab') ?? 'updates') as 'messages' | 'updates')

  function setTab(tab: 'messages' | 'updates') {
    const url = new URL(window.location.href)
    if (tab === 'updates') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    history.replaceState(null, '', url)
    // Trigger reactive re-read of $page — SvelteKit stores update on navigation only,
    // so we mirror the active tab with a local signal
    _tab = tab
  }
  let _tab = $state<'messages' | 'updates'>('updates')
  const tab = $derived(($page.url.searchParams.get('tab') as 'messages' | 'updates' | null) ?? _tab)

  onMount(() => {
    const initial = ($page.url.searchParams.get('tab') as 'messages' | 'updates' | null) ?? 'updates'
    _tab = initial

    // Auto-mark notifications as read when landing on the updates tab
    if (initial === 'updates' && items.some(i => !i.read)) {
      apiFetch('/notifications/read-all', { method: 'POST' })
        .then(() => {
          items = items.map(i => ({ ...i, read: true }))
          unreadCount.set(data.dmUnreadCount)
        })
        .catch(() => {})
    }
  })

  // When switching to updates tab, mark notifications as read
  let prevTab = _tab
  $effect(() => {
    if (tab === 'updates' && prevTab !== 'updates' && items.some(i => !i.read)) {
      apiFetch('/notifications/read-all', { method: 'POST' })
        .then(() => {
          items = items.map(i => ({ ...i, read: true }))
          unreadCount.set(data.dmUnreadCount)
        })
        .catch(() => {})
    }
    prevTab = tab
  })

  async function markAllRead() {
    busy = true
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      items = items.map(i => ({ ...i, read: true }))
      unreadCount.set(data.dmUnreadCount)
    } catch { /* non-critical */ }
    busy = false
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function typeLabel(type: string) {
    if (type === 'announcement') return 'Announcement'
    if (type === 'waitlist_promotion' || type === 'waitlist_confirmed') return 'Waitlist update'
    if (type === 'event_cancelled') return 'Event cancelled'
    if (type === 'event_rescheduled') return 'Event rescheduled'
    if (type === 'reminder_1d' || type === 'reminder_2d' || type === 'reminder_7d') return 'Reminder'
    if (type === 'welcome') return 'Welcome'
    return 'Message'
  }

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  // Deterministic color from name
  function avatarColor(name: string) {
    const colors = ['#b05525','#5a7a3a','#3a6a8a','#7a4a8a','#8a6a2a','#2a7a6a']
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return colors[h % colors.length]
  }

  const notifUnread = $derived(items.filter(i => !i.read).length)
  const dmUnread = $derived(threads.reduce((s, t) => s + t.unreadCount, 0))
</script>

<div class="inbox-page">
  <h1 class="inbox-title">Inbox</h1>

  <div class="tabs">
    <button
      class="tab"
      class:tab-active={tab === 'messages'}
      onclick={() => setTab('messages')}
    >
      Messages
      {#if dmUnread > 0}
        <span class="tab-badge">{dmUnread > 9 ? '9+' : dmUnread}</span>
      {/if}
    </button>
    <button
      class="tab"
      class:tab-active={tab === 'updates'}
      onclick={() => setTab('updates')}
    >
      Updates
      {#if notifUnread > 0}
        <span class="tab-badge">{notifUnread > 9 ? '9+' : notifUnread}</span>
      {/if}
    </button>
  </div>

  {#if tab === 'messages'}
    {#if threads.length === 0}
      <div class="empty">
        <p>No messages yet.</p>
        <p class="empty-hint">Start a conversation from an event's guest list.</p>
      </div>
    {:else}
      <ul class="thread-list">
        {#each threads as thread (thread.otherGuestId + thread.eventId)}
          <li class="thread" class:thread-unread={thread.unreadCount > 0}>
            <a href="/event/{thread.eventSlug}?dm={thread.otherGuestId}" class="thread-link">
              <div class="thread-avatar" style="background:{avatarColor(thread.otherGuestName)}">
                {initials(thread.otherGuestName)}
              </div>
              <div class="thread-body">
                <div class="thread-top">
                  <span class="thread-name">{thread.otherGuestName}</span>
                  <span class="thread-time">{timeAgo(thread.lastMessageAt)}</span>
                </div>
                <div class="thread-event">{thread.eventTitle}</div>
                <div class="thread-preview">
                  {#if thread.fromMe}<span class="thread-you">You: </span>{/if}{thread.lastMessage}
                </div>
              </div>
              {#if thread.unreadCount > 0}
                <div class="thread-dot"></div>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <div class="updates-header">
      {#if notifUnread > 0}
        <button class="mark-all-btn" onclick={markAllRead} disabled={busy}>
          Mark all read
        </button>
      {/if}
    </div>

    {#if items.length === 0}
      <div class="empty">
        <p>No updates yet.</p>
      </div>
    {:else}
      <ul class="item-list">
        {#each items as item (item.id)}
          <li class="item" class:item-unread={!item.read}>
            <div class="item-btn">
              <div class="item-meta">
                <span class="item-sender">{item.senderName ?? 'Haps'}</span>
                {#if item.eventTitle && item.link}
                  <a class="item-event" href={item.link}>{item.eventTitle}</a>
                {:else if item.eventTitle}
                  <span class="item-event">{item.eventTitle}</span>
                {/if}
                <span class="item-type">{typeLabel(item.type)}</span>
              </div>
              {#if item.subject}
                <div class="item-subject">{item.subject}</div>
              {/if}
              <div class="item-body">{item.body}</div>
              <div class="item-time">{timeAgo(item.createdAt)}</div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .inbox-page {
    max-width: 680px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .inbox-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1a1510;
    margin: 0 0 1.25rem;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #cfc3b0;
    margin-bottom: 1.25rem;
  }
  .tab {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    color: #6b6058;
    padding: 0.5rem 1rem;
    cursor: pointer;
    position: relative;
    bottom: -2px;
    border-bottom: 2px solid transparent;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .tab:hover { color: #3d352e; }
  .tab-active {
    color: #1a1510;
    font-weight: 600;
    border-bottom-color: #b05525;
  }
  .tab-badge {
    background: #b05525;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    min-width: 15px;
    height: 15px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    line-height: 1;
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: 3rem 0;
    color: #7a6e64;
    font-size: 0.9rem;
  }
  .empty p { margin: 0 0 0.375rem; }
  .empty-hint { font-size: 0.8rem; color: #9a8e84; }

  /* Thread list */
  .thread-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    overflow: hidden;
  }
  .thread { border-bottom: 1px solid #e0d4c3; }
  .thread:last-child { border-bottom: none; }
  .thread-unread { background: #faf3e8; }

  .thread-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    text-decoration: none;
    color: inherit;
  }
  .thread-link:hover { background: #f5ede0; }

  .thread-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.02em;
  }

  .thread-body { flex: 1; min-width: 0; }
  .thread-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.1rem;
  }
  .thread-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1510;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .thread-unread .thread-name { font-weight: 700; }
  .thread-time { font-size: 0.7rem; color: #9a8e84; flex-shrink: 0; }

  .thread-event {
    font-size: 0.7rem;
    color: #924418;
    margin-bottom: 0.2rem;
  }

  .thread-preview {
    font-size: 0.8rem;
    color: #6b6058;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .thread-you { color: #9a8e84; }

  .thread-dot {
    width: 8px;
    height: 8px;
    background: #b05525;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Updates tab */
  .updates-header {
    display: flex;
    justify-content: flex-end;
    min-height: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .mark-all-btn {
    background: none;
    border: none;
    font-size: 0.8rem;
    color: #924418;
    font-family: inherit;
    padding: 0;
    cursor: pointer;
  }
  .mark-all-btn:hover { color: #b05525; }
  .mark-all-btn:disabled { opacity: 0.5; }

  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    overflow: hidden;
  }
  .item { border-bottom: 1px solid #e0d4c3; }
  .item:last-child { border-bottom: none; }
  .item-unread { background: #faf3e8; }

  .item-btn {
    width: 100%;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .item-event {
    font-size: 0.75rem;
    color: #924418;
    background: #f5e8d8;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    text-decoration: none;
  }
  .item-event:hover { text-decoration: underline; }
  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .item-sender { font-size: 0.8rem; font-weight: 600; color: #1a1510; }
  .item-type { font-size: 0.7rem; color: #9a8e84; text-transform: uppercase; letter-spacing: 0.04em; }
  .item-subject { font-size: 0.9rem; font-weight: 600; color: #1a1510; line-height: 1.3; }
  .item-unread .item-subject { font-weight: 700; }
  .item-body {
    font-size: 0.85rem;
    color: #3d352e;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .item-time { font-size: 0.7rem; color: #9a8e84; margin-top: 0.125rem; }
</style>
