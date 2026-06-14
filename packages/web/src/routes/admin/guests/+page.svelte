<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'

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

  // Add person modal
  let showAddModal = $state(false)
  let addName = $state('')
  let addEmail = $state('')
  let addPhone = $state('')
  let addInstagram = $state('')
  let addError = $state('')
  let addSaving = $state(false)

  function openAddModal() {
    addName = ''
    addEmail = ''
    addPhone = ''
    addInstagram = ''
    addError = ''
    showAddModal = true
  }

  async function addPerson() {
    if (!addName.trim()) { addError = 'Name is required.'; return }
    addSaving = true
    addError = ''
    try {
      await api.createContact({
        name: addName.trim(),
        email: addEmail.trim() || undefined,
        phone: addPhone.trim() || undefined,
        instagramHandle: addInstagram.trim() || undefined,
      })
      showAddModal = false
      await invalidateAll()
    } catch (e: unknown) {
      addError = e instanceof ApiError ? e.message : 'Failed to add person.'
    } finally {
      addSaving = false
    }
  }
</script>

<main class="page">
  <div class="container">
    <div class="page-header">
      <div>
        <h1>People</h1>
        <p class="subtitle">{data.guests.length} person{data.guests.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn-add" onclick={openAddModal}>+ Add person</button>
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
          {#if guest.type === 'contact'}
            <div class="guest-row guest-row-contact">
              <div class="guest-info">
                <span class="guest-name">{guest.displayName ?? 'Unknown'}</span>
                {#if guest.email}
                  <span class="guest-email">{guest.email}</span>
                {/if}
              </div>
              <div class="guest-meta">
                <span class="event-count">Not yet attended</span>
                <span class="type-badge type-contact">Contact</span>
              </div>
            </div>
          {:else}
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
          {/if}
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

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
  .btn-add { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
  .btn-add:hover { background: #924418; }

  .guest-row-contact { cursor: default; }
  .guest-row-contact:hover { background: #f0e8da; border-color: #cfc3b0; }
  .type-contact { background: #f4eddc; color: #6e4e1a; }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(26,21,16,.45); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .modal { background: #f8f2e8; border: 1px solid #cfc3b0; border-radius: 16px; width: 100%; max-width: 480px; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #e0d4c4; }
  .modal-header h3 { margin: 0; font-size: 1.1rem; color: #1a1510; }
  .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #6b6058; cursor: pointer; padding: .1rem .25rem; }
  .modal-close:hover { color: #1a1510; }
  .modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: .875rem; }
  .field { display: flex; flex-direction: column; gap: .3rem; }
  .field label { font-size: .825rem; font-weight: 600; color: #4e453e; }
  .field input { padding: .5rem .75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: .9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .field input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .field-hint { font-size: .775rem; color: #9a8f86; margin: 0; }
  .error-banner { background: #fdf2ee; border: 1px solid #f0c8b8; color: #7a2a1a; border-radius: 8px; padding: .625rem .875rem; font-size: .875rem; }
  .modal-actions { display: flex; gap: .75rem; padding-top: .25rem; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: .625rem 1.25rem; border-radius: 8px; font-size: .9rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: .6; }
  .btn-ghost { background: none; border: none; color: #6b6058; font-size: .9rem; cursor: pointer; padding: .625rem .75rem; }
  .btn-ghost:hover { color: #1a1510; }
</style>

{#if showAddModal}
  <div class="modal-backdrop" onclick={() => showAddModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add person">
      <div class="modal-header">
        <h3>Add person</h3>
        <button class="modal-close" onclick={() => showAddModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if addError}
          <div class="error-banner">{addError}</div>
        {/if}
        <div class="field">
          <label for="add-name">Name *</label>
          <input id="add-name" type="text" bind:value={addName} placeholder="Full name" />
        </div>
        <div class="field">
          <label for="add-email">Email</label>
          <input id="add-email" type="email" bind:value={addEmail} placeholder="person@example.com" />
          <p class="field-hint">Used to match with future RSVPs and send email invitations.</p>
        </div>
        <div class="field">
          <label for="add-phone">Phone</label>
          <input id="add-phone" type="tel" bind:value={addPhone} placeholder="+1 555 000 0000" />
        </div>
        <div class="field">
          <label for="add-instagram">Instagram</label>
          <input id="add-instagram" type="text" bind:value={addInstagram} placeholder="@handle" />
        </div>
        <div class="modal-actions">
          <button class="btn-primary" onclick={addPerson} disabled={addSaving}>
            {addSaving ? 'Adding…' : 'Add person'}
          </button>
          <button class="btn-ghost" onclick={() => showAddModal = false}>Cancel</button>
        </div>
      </div>
    </div>
  </div>
{/if}
