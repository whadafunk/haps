<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()

  let search = $state('')

  type GuestRow = typeof data.guests[number]

  const filtered = $derived(
    search.trim() === ''
      ? data.guests
      : data.guests.filter((g: GuestRow) =>
          (g.displayName ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (g.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
          g.id.slice(0, 8).includes(search.toLowerCase())
        )
  )

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function guestHref(g: { id: string; type: string }) {
    return `/admin/guests/${g.type === 'user' ? 'u' : 's'}-${g.id}`
  }
</script>

<main class="page">
  <div class="container">
    <div class="page-header">
      <div>
        <h1>People</h1>
        <p class="subtitle">{data.guests.length} guest{data.guests.length !== 1 ? 's' : ''} across all events</p>
      </div>
    </div>

    <div class="search-row">
      <input type="search" bind:value={search} placeholder="Search by name or email…" class="search-input" />
    </div>

    {#if filtered.length === 0}
      <div class="empty">
        {#if search.trim()}
          <p>No guests match "{search}".</p>
        {:else}
          <p>No guests yet. They appear here once they RSVP to an event.</p>
        {/if}
      </div>
    {:else}
      <div class="guest-list">
        {#each filtered as guest (guest.id)}
          <a href={guestHref(guest)} class="guest-row">
            <div class="guest-info">
              <span class="guest-name">{guest.displayName ?? 'Anonymous'}</span>
              {#if guest.email}
                <span class="guest-email">{guest.email}</span>
              {/if}
            </div>
            <div class="guest-meta">
              <span class="event-count">{guest.eventCount} event{guest.eventCount !== 1 ? 's' : ''}</span>
              <span class="first-seen">{formatDate(guest.firstSeen)}</span>
              {#if guest.status === 'blocked'}
                <span class="status-badge status-blocked">Blocked</span>
              {:else if guest.status === 'removed'}
                <span class="status-badge status-removed">Removed</span>
              {/if}
              <span class="type-badge type-{guest.type}">{guest.type === 'user' ? 'Registered' : 'Guest'}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 800px; margin: 0 auto; }
  .page-header { margin-bottom: 1.25rem; }
  h1 { margin: 0; font-size: 1.75rem; color: #1a1510; }
  .subtitle { margin: 0.25rem 0 0; color: #6b6058; font-size: 0.9rem; }

  .search-row { margin-bottom: 1rem; }
  .search-input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid #c8bdb0;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    background: #fff;
    color: #1a1510;
    box-sizing: border-box;
  }
  .search-input:focus { outline: 2px solid #b05525; outline-offset: -1px; }

  .empty {
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    color: #6b6058;
    font-size: 0.9rem;
  }
  .empty p { margin: 0; }

  .guest-list { display: flex; flex-direction: column; gap: 0.375rem; }
  .guest-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 10px;
    text-decoration: none;
    gap: 1rem;
  }
  .guest-row:hover { background: #e8ddd0; border-color: #b8aa98; }

  .guest-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .guest-name { font-weight: 600; color: #1a1510; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .guest-email { font-size: 0.8rem; color: #6b6058; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .guest-meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .event-count { font-size: 0.8rem; color: #6b6058; white-space: nowrap; }
  .first-seen { font-size: 0.8rem; color: #8a7a6e; white-space: nowrap; }

  .type-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
  }
  .type-user { background: #e8f0fc; color: #2a4a7a; }
  .type-session { background: #ede8e0; color: #4e453e; }

  .status-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
  }
  .status-blocked { background: #fef3cd; color: #7a5a10; }
  .status-removed { background: #ede8e0; color: #9a8f86; text-decoration: line-through; }
</style>
