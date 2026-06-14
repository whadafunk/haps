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
    const prefix = g.type === 'user' ? 'u' : g.type === 'contact' ? 'c' : 's'
    return `/admin/guests/${prefix}-${g.id}`
  }

  // ── Multi-select ────────────────────────────────────────────────────────────
  let selected = $state(new Set<string>())

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    selected = next
  }

  function selectAll() {
    selected = new Set(filtered.map((g: GuestRow) => g.id))
  }

  function clearSelection() {
    selected = new Set()
  }

  const selectedContacts = $derived(
    filtered.filter((g: GuestRow) => selected.has(g.id) && g.type === 'contact')
  )
  const selectedNonContacts = $derived(
    filtered.filter((g: GuestRow) => selected.has(g.id) && g.type !== 'contact')
  )

  // ── Bulk delete ─────────────────────────────────────────────────────────────
  let showBulkDeleteModal = $state(false)
  let bulkDeleting = $state(false)
  let bulkError = $state('')

  async function doBulkDelete() {
    bulkDeleting = true; bulkError = ''
    try {
      await Promise.all(selectedContacts.map((g: GuestRow) => api.deleteContact(g.id)))
      showBulkDeleteModal = false
      clearSelection()
      await invalidateAll()
    } catch (e: unknown) {
      bulkError = e instanceof ApiError ? e.message : 'Some deletions failed.'
    } finally { bulkDeleting = false }
  }

  // ── Add person modal ────────────────────────────────────────────────────────
  let showAddModal = $state(false)
  let addName = $state('')
  let addEmail = $state('')
  let addPhone = $state('')
  let addInstagram = $state('')
  let addError = $state('')
  let addSaving = $state(false)

  function openAddModal() {
    addName = ''; addEmail = ''; addPhone = ''; addInstagram = ''; addError = ''
    showAddModal = true
  }

  async function addPerson() {
    if (!addName.trim()) { addError = 'Name is required.'; return }
    addSaving = true; addError = ''
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
    } finally { addSaving = false }
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

    <div class="toolbar">
      <input type="search" bind:value={search} placeholder="Search by name or email…" class="search-input" />
      <label class="select-all-wrap">
        <input
          type="checkbox"
          class="check"
          checked={selected.size > 0 && selected.size === filtered.length}
          indeterminate={selected.size > 0 && selected.size < filtered.length}
          onchange={() => selected.size === filtered.length ? clearSelection() : selectAll()}
        />
        <span class="select-all-label">All</span>
      </label>
    </div>

    {#if selected.size > 0}
      <div class="bulk-bar">
        <span class="bulk-count">
          {selected.size} selected
          {#if selectedNonContacts.length > 0}
            <span class="bulk-hint">({selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''})</span>
          {/if}
        </span>
        <button class="btn-ghost-sm" onclick={clearSelection}>Clear</button>
        <button
          class="btn-danger-sm"
          disabled={selectedContacts.length === 0}
          onclick={() => { bulkError = ''; showBulkDeleteModal = true }}
        >
          Delete {selectedContacts.length > 0 ? selectedContacts.length : ''} contact{selectedContacts.length !== 1 ? 's' : ''}
        </button>
        {#if selectedNonContacts.length > 0}
          <span class="bulk-hint">Guest/member entries must be managed individually.</span>
        {/if}
      </div>
    {/if}

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
          <div class="guest-row-wrap" class:is-selected={selected.has(guest.id)}>
            <label class="row-check" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                class="check"
                checked={selected.has(guest.id)}
                onchange={() => toggleSelect(guest.id)}
              />
            </label>
            <a href={guestHref(guest)} class="guest-row">
              <div class="guest-info">
                <span class="guest-name">{guest.displayName ?? 'Anonymous'}</span>
                {#if guest.email}
                  <span class="guest-email">{guest.email}</span>
                {/if}
              </div>
              <div class="guest-meta">
                {#if guest.type === 'contact'}
                  <span class="event-count">Not yet attended</span>
                {:else}
                  <span class="event-count">{guest.eventCount} event{guest.eventCount !== 1 ? 's' : ''}</span>
                  <span class="first-seen">{formatDate(guest.firstSeen)}</span>
                  {#if guest.status === 'blocked'}
                    <span class="status-badge status-blocked">Blocked</span>
                  {:else if guest.status === 'removed'}
                    <span class="status-badge status-removed">Removed</span>
                  {/if}
                {/if}
                <span class="type-badge type-{guest.type}">
                  {guest.type === 'user' ? 'Registered' : guest.type === 'contact' ? 'Contact' : 'Guest'}
                </span>
              </div>
            </a>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>

<!-- Bulk delete confirmation -->
{#if showBulkDeleteModal}
  <div class="modal-backdrop" role="presentation" onclick={() => showBulkDeleteModal = false}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Delete contacts" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Delete {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''}?</h3>
        <button class="modal-close" onclick={() => showBulkDeleteModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">
          Remove {selectedContacts.length} {selectedContacts.length === 1 ? 'contact' : 'contacts'} from the directory?
          Invite tokens issued to them will remain active.
        </p>
        {#if bulkError}
          <p class="error-banner">{bulkError}</p>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showBulkDeleteModal = false} disabled={bulkDeleting}>Cancel</button>
        <button class="btn-danger" onclick={doBulkDelete} disabled={bulkDeleting}>
          {bulkDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add person modal -->
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
        <label class="field">
          <span class="field-label">Name <span class="req">*</span></span>
          <input id="add-name" type="text" bind:value={addName} placeholder="Full name" />
        </label>
        <label class="field">
          <span class="field-label">Email</span>
          <input id="add-email" type="email" bind:value={addEmail} placeholder="person@example.com" />
          <p class="field-hint">Used to match with future RSVPs and send email invitations.</p>
        </label>
        <label class="field">
          <span class="field-label">Phone</span>
          <input id="add-phone" type="tel" bind:value={addPhone} placeholder="+1 555 000 0000" />
        </label>
        <label class="field">
          <span class="field-label">Instagram</span>
          <input id="add-instagram" type="text" bind:value={addInstagram} placeholder="@handle" />
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showAddModal = false}>Cancel</button>
        <button class="btn-primary" onclick={addPerson} disabled={addSaving}>
          {addSaving ? 'Adding…' : 'Add person'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 800px; margin: 0 auto; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
  h1 { margin: 0; font-size: 1.75rem; color: #1a1510; }
  .subtitle { margin: 0.25rem 0 0; color: #6b6058; font-size: 0.9rem; }

  .toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.875rem; }
  .search-input { flex: 1; padding: 0.625rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .search-input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .select-all-wrap { display: flex; align-items: center; gap: 0.375rem; cursor: pointer; flex-shrink: 0; padding: 0.375rem 0.625rem; border: 1px solid #c8bdb0; border-radius: 8px; background: #fff; }
  .select-all-label { font-size: 0.825rem; color: #4e453e; white-space: nowrap; }
  .check { cursor: pointer; accent-color: #b05525; width: 1rem; height: 1rem; }

  /* Bulk bar */
  .bulk-bar {
    display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    padding: 0.625rem 1rem; background: #f8f2e8; border: 1px solid #c8bdb0;
    border-radius: 10px; margin-bottom: 0.875rem; font-size: 0.875rem;
  }
  .bulk-count { font-weight: 600; color: #1a1510; }
  .bulk-hint { color: #6b6058; font-size: 0.8rem; }
  .btn-ghost-sm { background: none; border: none; color: #6b6058; font-size: 0.825rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 6px; }
  .btn-ghost-sm:hover { background: #ede8e0; color: #1a1510; }
  .btn-danger-sm { background: #b03016; color: #fff; border: none; padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.825rem; font-weight: 600; cursor: pointer; }
  .btn-danger-sm:hover:not(:disabled) { background: #8a2412; }
  .btn-danger-sm:disabled { opacity: 0.4; cursor: default; }

  .empty { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 2rem; text-align: center; color: #6b6058; font-size: 0.9rem; }
  .empty p { margin: 0; }

  /* Row with checkbox */
  .guest-list { display: flex; flex-direction: column; gap: 0.375rem; }

  .guest-row-wrap {
    display: flex; align-items: stretch;
    border: 1px solid #cfc3b0; border-radius: 10px; overflow: hidden;
    background: #f0e8da; transition: border-color 0.1s;
  }
  .guest-row-wrap:hover { border-color: #b8aa98; }
  .guest-row-wrap.is-selected { border-color: #b05525; background: #faf0e4; }

  .row-check {
    display: flex; align-items: center; padding: 0 0.75rem;
    border-right: 1px solid #cfc3b0; cursor: pointer; flex-shrink: 0;
    background: transparent;
  }
  .guest-row-wrap.is-selected .row-check { border-right-color: #d4a880; }

  .guest-row {
    flex: 1; display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 1rem; text-decoration: none; gap: 1rem; min-width: 0;
  }
  .guest-row-wrap:hover .guest-row { background: #e8ddd0; }
  .guest-row-wrap.is-selected .guest-row { background: #faf0e4; }
  .guest-row-wrap.is-selected:hover .guest-row { background: #f0e4d4; }

  .guest-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .guest-name { font-weight: 600; color: #1a1510; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .guest-email { font-size: 0.8rem; color: #6b6058; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .guest-meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .event-count { font-size: 0.8rem; color: #6b6058; white-space: nowrap; }
  .first-seen { font-size: 0.8rem; color: #8a7a6e; white-space: nowrap; }

  .type-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap; }
  .type-user { background: #e8f0fc; color: #2a4a7a; }
  .type-session { background: #ede8e0; color: #4e453e; }
  .type-contact { background: #f4eddc; color: #6e4e1a; }

  .status-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap; }
  .status-blocked { background: #fef3cd; color: #7a5a10; }
  .status-removed { background: #ede8e0; color: #9a8f86; text-decoration: line-through; }

  /* Buttons */
  .btn-add { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
  .btn-add:hover { background: #924418; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: default; }
  .btn-secondary { background: #ede8e0; color: #3d352e; border: 1px solid #c8bdb0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
  .btn-secondary:hover:not(:disabled) { background: #e0d8cc; }
  .btn-secondary:disabled { opacity: 0.6; cursor: default; }
  .btn-danger { background: #b03016; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #8a2412; }
  .btn-danger:disabled { opacity: 0.6; cursor: default; }

  /* Modals */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(26,21,16,.45); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .modal { background: #f8f2e8; border: 1px solid #cfc3b0; border-radius: 16px; width: 100%; max-width: 480px; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #e0d4c4; }
  .modal-header h3 { margin: 0; font-size: 1.1rem; color: #1a1510; }
  .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #6b6058; cursor: pointer; padding: .1rem .25rem; }
  .modal-close:hover { color: #1a1510; }
  .modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: .875rem; }
  .modal-desc { margin: 0; font-size: 0.875rem; color: #4e453e; }
  .modal-actions { display: flex; gap: .75rem; padding: 1rem 1.5rem 1.25rem; border-top: 1px solid #e0d4c4; justify-content: flex-end; }

  .field { display: flex; flex-direction: column; gap: .3rem; }
  .field-label { font-size: .825rem; font-weight: 600; color: #4e453e; }
  .field input { padding: .5rem .75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: .9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .field input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .field-hint { font-size: .775rem; color: #9a8f86; margin: 0; }
  .error-banner { background: #fdf2ee; border: 1px solid #f0c8b8; color: #7a2a1a; border-radius: 8px; padding: .625rem .875rem; font-size: .875rem; margin: 0; }
  .req { color: #c03828; }
</style>
