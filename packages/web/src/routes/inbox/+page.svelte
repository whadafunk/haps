<script lang="ts">
  import type { PageData } from './$types'
  import type { InboxItem } from './+page.server'
  import { apiFetch } from '$lib/api'
  import { invalidateAll } from '$app/navigation'
  import { goto } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  let items = $state<InboxItem[]>(data.items)
  let busy = $state(false)

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

  async function open(item: InboxItem) {
    if (!item.read) {
      items = items.map(i => i.id === item.id ? { ...i, read: true } : i)
      try {
        await apiFetch(`/notifications/${item.id}/read`, { method: 'PATCH' })
      } catch {}
      await invalidateAll()
    }
    if (item.link) goto(item.link)
  }

  async function markAllRead() {
    busy = true
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      items = items.map(i => ({ ...i, read: true }))
    } catch { /* non-critical */ }
    await invalidateAll()
    busy = false
  }

  const unread = $derived(items.filter(i => !i.read).length)
</script>

<div class="inbox-page">
  <div class="inbox-header">
    <h1 class="inbox-title">Inbox</h1>
    {#if unread > 0}
      <button class="mark-all-btn" onclick={markAllRead} disabled={busy}>
        Mark all read
      </button>
    {/if}
  </div>

  {#if items.length === 0}
    <div class="empty">
      <p>Your inbox is empty.</p>
    </div>
  {:else}
    <ul class="item-list">
      {#each items as item (item.id)}
        <li class="item" class:item-unread={!item.read}>
          <button class="item-btn" onclick={() => open(item)}>
            <div class="item-meta">
              <span class="item-sender">{item.senderName ?? 'Haps'}</span>
              {#if item.eventTitle}
                <span class="item-event">{item.eventTitle}</span>
              {/if}
              <span class="item-type">{typeLabel(item.type)}</span>
            </div>
            {#if item.subject}
              <div class="item-subject">{item.subject}</div>
            {/if}
            <div class="item-body">{item.body}</div>
            <div class="item-time">{timeAgo(item.createdAt)}</div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .inbox-page {
    max-width: 680px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .inbox-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .inbox-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1a1510;
    margin: 0;
  }

  .mark-all-btn {
    background: none;
    border: none;
    font-size: 0.8rem;
    color: #924418;
    font-family: inherit;
    padding: 0;
  }
  .mark-all-btn:hover { color: #b05525; }
  .mark-all-btn:disabled { opacity: 0.5; }

  .empty {
    text-align: center;
    padding: 3rem 0;
    color: #7a6e64;
    font-size: 0.9rem;
  }

  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    overflow: hidden;
  }

  .item {
    border-bottom: 1px solid #e0d4c3;
  }
  .item:last-child { border-bottom: none; }

  .item-unread { background: #faf3e8; }

  .item-btn {
    width: 100%;
    background: none;
    border: none;
    padding: 0.875rem 1rem;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .item-btn:hover { background: #f5ead8; }
  .item-unread .item-btn:hover { background: #f0e2cc; }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .item-sender {
    font-size: 0.8rem;
    font-weight: 600;
    color: #1a1510;
  }

  .item-event {
    font-size: 0.75rem;
    color: #924418;
    background: #f5e8d8;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .item-type {
    font-size: 0.7rem;
    color: #9a8e84;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .item-subject {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1510;
    line-height: 1.3;
  }

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

  .item-time {
    font-size: 0.7rem;
    color: #9a8e84;
    margin-top: 0.125rem;
  }
</style>
