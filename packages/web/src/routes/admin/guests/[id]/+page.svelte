<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const statusColors: Record<string, string> = {
    yes: 'status-yes',
    maybe: 'status-maybe',
    no: 'status-no',
  }
</script>

<main class="page">
  <div class="container">
    <div class="back-link"><a href="/admin/guests">← People</a></div>

    <div class="guest-header">
      <div class="guest-identity">
        <h1>{data.guest.displayName ?? 'Anonymous'}</h1>
        {#if data.guest.email}
          <p class="guest-email">{data.guest.email}</p>
        {/if}
        <div class="guest-badges">
          <span class="type-badge type-{data.guest.type}">
            {data.guest.type === 'user' ? 'Registered' : 'Guest'}
          </span>
          <span class="first-seen">First seen {formatDate(data.guest.firstSeen)}</span>
        </div>
      </div>
    </div>

    <section class="section">
      <h2>Events ({data.guest.events.length})</h2>
      {#if data.guest.events.length === 0}
        <p class="empty">No events to show.</p>
      {:else}
        <div class="event-list">
          {#each data.guest.events as ev}
            <div class="event-row">
              <div class="event-info">
                <a href="/event/{ev.eventSlug}" class="event-title">{ev.eventTitle}</a>
                <p class="event-date">{formatDate(ev.startsAt)}</p>
              </div>
              <div class="event-badges">
                <span class="badge {statusColors[ev.rsvpStatus] ?? ''}">{ev.rsvpStatus}</span>
                {#if ev.checkedIn}
                  <span class="badge badge-checkin">checked in</span>
                {/if}
                {#if ev.headCount > 1}
                  <span class="head-count">×{ev.headCount}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 800px; margin: 0 auto; }

  .back-link { margin-bottom: 1.25rem; }
  .back-link a { color: #b05525; text-decoration: none; font-size: 0.875rem; font-weight: 500; }
  .back-link a:hover { text-decoration: underline; }

  .guest-header { margin-bottom: 1.75rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.75rem; color: #1a1510; }
  .guest-email { margin: 0 0 0.5rem; color: #6b6058; font-size: 0.9rem; }
  .guest-badges { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .first-seen { font-size: 0.8rem; color: #8a7a6e; }

  .type-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .type-user { background: #e8f0fc; color: #2a4a7a; }
  .type-session { background: #ede8e0; color: #4e453e; }

  .section { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .empty { color: #6b6058; font-size: 0.9rem; margin: 0; }

  .event-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .event-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: #e8ddd0;
    border-radius: 8px;
    border: 1px solid #cfc3b0;
    gap: 1rem;
  }
  .event-info { min-width: 0; }
  .event-title { font-weight: 600; text-decoration: none; color: #1a1510; font-size: 0.95rem; }
  .event-title:hover { color: #b05525; }
  .event-date { margin: 0.2rem 0 0; font-size: 0.8rem; color: #6b6058; }

  .event-badges { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; flex-wrap: wrap; }
  .badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: #ede8e0;
    color: #4e453e;
  }
  .status-yes { background: #e8f4e4; color: #2a5e28; }
  .status-maybe { background: #fef6e0; color: #7a5a10; }
  .status-no { background: #f8e8e2; color: #7a2a1a; }
  .badge-checkin { background: #e0f0f8; color: #1a4a6e; }
  .head-count { font-size: 0.8rem; color: #6b6058; }
</style>
