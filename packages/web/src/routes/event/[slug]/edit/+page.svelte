<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'
  import { goto } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  const event = $state({ ...data.event })
  let saving = $state(false)
  let saveError = $state('')
  let saveSuccess = $state(false)
  let deleting = $state(false)

  async function saveEvent() {
    saving = true
    saveError = ''
    saveSuccess = false
    try {
      await api.updateEvent(event.slug, {
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? undefined,
        status: event.status,
        showGuests: event.showGuests,
        allowComments: event.allowComments,
      }, data.editToken)
      saveSuccess = true
    } catch (e: unknown) {
      saveError = e instanceof ApiError ? e.message : 'Failed to save.'
    } finally {
      saving = false
    }
  }

  async function deleteEvent() {
    if (!confirm('Delete this event? This cannot be undone.')) return
    deleting = true
    try {
      await api.deleteEvent(event.slug, data.editToken)
      goto('/')
    } catch (e: unknown) {
      saveError = e instanceof ApiError ? e.message : 'Failed to delete.'
      deleting = false
    }
  }

  async function removeRsvp(rsvpId: string) {
    if (!confirm('Remove this RSVP?')) return
    try {
      await api.deleteRsvp(event.slug, rsvpId)
      await invalidateAll()
    } catch { /**/ }
  }
</script>

<main class="edit-page">
  <div class="header">
    <a href="/event/{event.slug}">← Back to event</a>
    <h1>Edit: {event.title}</h1>
  </div>

  <div class="grid">
    <section class="card">
      <h2>Event details</h2>

      {#if saveError}
        <div class="error-banner">{saveError}</div>
      {/if}
      {#if saveSuccess}
        <div class="success-banner">Saved!</div>
      {/if}

      <div class="form">
        <label>Title <input type="text" bind:value={event.title} /></label>
        <label>Description <textarea bind:value={event.description} rows="4"></textarea></label>
        <label>Location <input type="text" bind:value={event.location} /></label>
        <label>Starts at <input type="datetime-local" value={event.startsAt?.slice(0, 16)} oninput={(e) => { event.startsAt = (e.target as HTMLInputElement).value + ':00Z' }} /></label>
        <label>
          Status
          <select bind:value={event.status}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <div class="checkboxes">
          <label class="checkbox"><input type="checkbox" bind:checked={event.showGuests} /> Show guest list publicly</label>
          <label class="checkbox"><input type="checkbox" bind:checked={event.allowComments} /> Allow comments</label>
        </div>
        <div class="form-actions">
          <button onclick={saveEvent} disabled={saving} class="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button onclick={deleteEvent} disabled={deleting} class="btn-danger">
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Guest list ({data.rsvps.length})</h2>
      {#if data.rsvps.length === 0}
        <p class="muted">No RSVPs yet.</p>
      {:else}
        <div class="rsvp-list">
          {#each data.rsvps as rsvp (rsvp.id)}
            <div class="rsvp-row">
              <div>
                <strong>{rsvp.displayName}</strong>
                <span class="badge badge-{rsvp.status}">{rsvp.status}</span>
                {#if rsvp.headCount > 1}<span class="muted">+{rsvp.headCount - 1}</span>{/if}
              </div>
              {#if rsvp.note}<p class="note">{rsvp.note}</p>{/if}
              <button class="btn-remove" onclick={() => removeRsvp(rsvp.id)}>Remove</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</main>

<style>
  .edit-page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  .header { margin-bottom: 1.5rem; }
  .header a { font-size: 0.875rem; color: #6b6058; text-decoration: none; }
  .header a:hover { color: #b05525; }
  h1 { margin: 0.5rem 0 0; font-size: 1.5rem; color: #1a1510; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
  @media (min-width: 768px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .form { display: flex; flex-direction: column; gap: 0.75rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  label.checkbox { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
  .checkboxes { display: flex; flex-direction: column; gap: 0.5rem; }
  input, textarea, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus, select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; }
  .btn-danger { background: #f0e8da; color: #8b3016; border: 1px solid #f0c8b8; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #fdf2ee; }
  .btn-danger:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .success-banner { background: #edf4ec; color: #2d5a2a; border: 1px solid #b8d9b4; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .rsvp-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .rsvp-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.15rem 0.4rem; border-radius: 4px; margin-left: 0.375rem; background: #ede8e0; color: #4e453e; }
  .badge-yes { background: #e8f4e4; color: #2a5e28; }
  .badge-maybe { background: #fef4e0; color: #7a5a1a; }
  .badge-no { background: #ede8e0; color: #4e453e; }
  .note { margin: 0.25rem 0 0; font-size: 0.8rem; color: #6b6058; }
  .btn-remove { background: none; border: none; color: #9a8f86; font-size: 0.75rem; cursor: pointer; padding: 0; }
  .btn-remove:hover { color: #8b3016; }
  .muted { color: #6b6058; font-size: 0.875rem; }
</style>
