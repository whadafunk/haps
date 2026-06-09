<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>All Events</h1>
    <a href="/new-event" class="btn">+ New Event</a>
  </div>

  {#if data.events.length === 0}
    <p class="muted">No events yet.</p>
  {:else}
    <table class="table">
      <thead>
        <tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {#each data.events as event (event.slug)}
          <tr>
            <td><a href="/event/{event.slug}">{event.title}</a></td>
            <td><span class="badge status-{event.status}">{event.status}</span></td>
            <td>{new Date(event.startsAt).toLocaleDateString()}</td>
            <td><a href="/event/{event.slug}/edit" class="action-link">Edit</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  h1 { margin: 0; font-size: 1.5rem; color: #1a1510; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
  .btn { background: #b05525; color: #fff; text-decoration: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; }
  .btn:hover { background: #924418; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; overflow: hidden; }
  .table th { text-align: left; font-size: 0.75rem; font-weight: 600; color: #6b6058; text-transform: uppercase; padding: 0.75rem 1rem; border-bottom: 1px solid #cfc3b0; }
  .table td { padding: 0.75rem 1rem; border-bottom: 1px solid #dfd4c4; color: #1a1510; }
  .table tr:last-child td { border-bottom: none; }
  .table a { text-decoration: none; color: #b05525; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .badge.status-draft { background: #ede8e0; color: #4e453e; }
  .badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  .action-link { font-size: 0.8rem; }
  .muted { color: #6b6058; font-size: 0.875rem; }
</style>
