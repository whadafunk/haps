<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
</script>

<main class="page">
  <div class="container">
    <div class="dashboard-header">
      <div>
        <h1>Dashboard</h1>
        <p class="welcome">Welcome back, {data.user.displayName}</p>
      </div>
      <a href="/new-event" class="btn-primary">+ New Event</a>
    </div>

    <section class="section">
      <h2>Your Events</h2>
      {#if data.events.length === 0}
        <div class="empty">
          <p>No events yet. <a href="/new-event">Create your first event →</a></p>
        </div>
      {:else}
        <div class="event-list">
          {#each data.events as event (event.slug)}
            <div class="event-row">
              <div>
                <a href="/event/{event.slug}/edit" class="event-title">{event.title}</a>
                <p class="event-meta">{formatDate(event.startsAt)}</p>
              </div>
              <span class="badge status-{event.status}">{event.status}</span>
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
  .dashboard-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
  h1 { margin: 0; font-size: 1.75rem; color: #1a1510; }
  .welcome { margin: 0.25rem 0 0; color: #6b6058; }
  .btn-primary { background: #b05525; color: #fff; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; white-space: nowrap; }
  .btn-primary:hover { background: #924418; }
  .section { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .empty { color: #6b6058; font-size: 0.9rem; }
  .event-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .event-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; }
  .event-title { font-weight: 600; text-decoration: none; color: #1a1510; }
  .event-title:hover { color: #b05525; }
  .event-meta { margin: 0.2rem 0 0; font-size: 0.8rem; color: #6b6058; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .badge.status-draft { background: #ede8e0; color: #4e453e; }
  .badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
</style>
