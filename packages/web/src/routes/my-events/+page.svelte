<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const showRegisterNudge = $derived(!data.user && data.events.length > 0)
</script>

<main class="page">
  <div class="container">
    {#if showRegisterNudge}
      <div class="register-nudge">
        <div class="nudge-text">
          <strong>Keep your event history.</strong>
          Register to access your events across all devices and never miss an update.
        </div>
        <div class="nudge-actions">
          <a href="/register" class="nudge-btn-primary">Create account</a>
          <a href="/login" class="nudge-btn-secondary">Log in</a>
        </div>
      </div>
    {/if}

    <h1>My Events</h1>
    {#if data.session?.displayName}
      <p class="greeting">Hi, {data.session.displayName}!</p>
    {/if}

    {#if data.events.length === 0}
      <div class="empty">
        <p>No events yet. Visit an event link to get started.</p>
      </div>
    {:else}
      <div class="event-list">
        {#each data.events as event (event.slug)}
          <a href="/event/{event.slug}" class="event-card">
            <div class="event-info">
              <h3>{event.title}</h3>
              <p class="event-date">{formatDate(event.startsAt)}</p>
            </div>
            <div class="event-badges">
              {#if event.isEditor}
                <span class="badge host">Host</span>
              {/if}
              {#if event.myStatus}
                <span class="badge status-{event.myStatus}">{event.myStatus}</span>
              {/if}
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 600px; margin: 0 auto; }
  h1 { margin: 0 0 0.25rem; color: #1a1510; }
  .greeting { color: #6b6058; margin: 0 0 1.5rem; }

  .register-nudge {
    background: #f5ede2;
    border: 1px solid #d4a574;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .nudge-text { font-size: 0.9rem; color: #3d352e; flex: 1; min-width: 200px; }
  .nudge-text strong { color: #1a1510; }
  .nudge-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .nudge-btn-primary {
    background: #b05525;
    color: #fff;
    text-decoration: none;
    padding: 0.375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .nudge-btn-primary:hover { background: #924418; }
  .nudge-btn-secondary {
    color: #3d352e;
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .nudge-btn-secondary:hover { color: #b05525; }

  .empty { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 2rem; text-align: center; color: #6b6058; }
  .event-list { display: flex; flex-direction: column; gap: 0.625rem; }
  .event-card { display: flex; align-items: center; justify-content: space-between; background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1rem 1.25rem; text-decoration: none; color: inherit; }
  .event-card:hover { border-color: #b05525; }
  .event-info h3 { margin: 0 0 0.25rem; font-size: 1rem; color: #1a1510; }
  .event-date { margin: 0; font-size: 0.8rem; color: #6b6058; }
  .event-badges { display: flex; gap: 0.375rem; align-items: center; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; }
  .badge.host { background: #f0ddd0; color: #9a3f1a; }
  .badge.status-yes { background: #e8f4e4; color: #2a5e28; }
  .badge.status-maybe { background: #fef4e0; color: #7a5a1a; }
  .badge.status-no { background: #ede8e0; color: #4e453e; }
</style>
