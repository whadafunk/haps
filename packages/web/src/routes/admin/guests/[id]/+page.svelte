<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { goto, invalidateAll } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const rsvpColors: Record<string, string> = {
    yes: 'status-yes',
    maybe: 'status-maybe',
    no: 'status-no',
  }

  // ── Block / Unblock / Remove (session guests) ──────────────────────────────
  let showBlockModal = $state(false)
  let showRemoveModal = $state(false)
  let blockReason = $state('')
  let blockEmail = $state(false)
  let removeBlockEmail = $state(false)
  let actionLoading = $state(false)
  let actionError = $state('')

  async function doBlock() {
    if (!blockReason.trim()) { actionError = 'Reason is required.'; return }
    actionLoading = true; actionError = ''
    try {
      await api.blockGuest(data.guest.id, { reason: blockReason.trim(), blockEmail: blockEmail || undefined })
      showBlockModal = false
      goto('/admin/guests')
    } catch (e: unknown) {
      actionError = e instanceof ApiError ? e.message : 'Failed to block guest.'
    } finally { actionLoading = false }
  }

  async function doUnblock() {
    actionLoading = true; actionError = ''
    try {
      await api.unblockGuest(data.guest.id)
      goto('/admin/guests')
    } catch (e: unknown) {
      actionError = e instanceof ApiError ? e.message : 'Failed to unblock guest.'
    } finally { actionLoading = false }
  }

  async function doRemove() {
    actionLoading = true; actionError = ''
    try {
      await api.removeGuest(data.guest.id, { blockEmail: removeBlockEmail || undefined })
      showRemoveModal = false
      goto('/admin/guests')
    } catch (e: unknown) {
      actionError = e instanceof ApiError ? e.message : 'Failed to remove guest.'
    } finally { actionLoading = false }
  }

  // ── Contact edit modal ─────────────────────────────────────────────────────
  let showEditModal = $state(false)
  let editName = $state('')
  let editEmail = $state('')
  let editPhone = $state('')
  let editInstagram = $state('')
  let editNotes = $state('')
  let editError = $state('')
  let editSaving = $state(false)

  function openEditModal() {
    editName = data.guest.displayName ?? ''
    editEmail = data.guest.email ?? ''
    editPhone = data.guest.phone ?? ''
    editInstagram = data.guest.instagramHandle ?? ''
    editNotes = data.guest.notes ?? ''
    editError = ''
    showEditModal = true
  }

  async function saveEdit() {
    if (!editName.trim()) { editError = 'Name is required.'; return }
    editSaving = true; editError = ''
    try {
      await api.updateGuest(data.guest.id, {
        name:            editName.trim(),
        email:           editEmail.trim() || null,
        phone:           editPhone.trim() || null,
        instagramHandle: editInstagram.trim() || null,
        notes:           editNotes.trim() || null,
      })
      showEditModal = false
      await invalidateAll()
    } catch (e: unknown) {
      editError = e instanceof ApiError ? e.message : 'Failed to save changes.'
    } finally { editSaving = false }
  }

  // ── Contact delete ─────────────────────────────────────────────────────────
  let showDeleteModal = $state(false)
  let deleteLoading = $state(false)
  let deleteError = $state('')

  async function doDeleteContact() {
    deleteLoading = true; deleteError = ''
    try {
      await api.deleteGuest(data.guest.id)
      showDeleteModal = false
      goto('/admin/guests')
    } catch (e: unknown) {
      deleteError = e instanceof ApiError ? e.message : 'Failed to delete contact.'
    } finally { deleteLoading = false }
  }
</script>

<main class="page">
  <div class="container">
    <div class="back-link"><a href="/admin/guests">← Guests</a></div>

    <div class="guest-header">
      <div class="guest-identity">
        <div class="name-row">
          <h1>{data.guest.displayName ?? 'Anonymous'}</h1>
          <span class="short-id">#{data.guest.shortId}</span>
        </div>
        {#if data.guest.email}
          <p class="guest-detail">{data.guest.email}</p>
        {/if}
        {#if data.guest.phone}
          <p class="guest-detail">{data.guest.phone}</p>
        {/if}
        {#if data.guest.instagramHandle}
          <p class="guest-detail">@{data.guest.instagramHandle.replace(/^@/, '')}</p>
        {/if}
        {#if data.guest.notes}
          <p class="guest-notes">{data.guest.notes}</p>
        {/if}
        <div class="guest-badges">
          {#if data.guest.type === 'unclaimed'}
            <span class="type-badge type-contact">Guest</span>
          {:else if data.guest.type === 'claimed'}
            <span class="type-badge type-guest">Registered</span>
          {:else if data.guest.type === 'admin'}
            <span class="type-badge type-admin">Admin</span>
          {:else if data.guest.type === 'organizer'}
            <span class="type-badge type-organizer">Organizer</span>
          {:else}
            <span class="type-badge type-guest">Guest</span>
          {/if}
          {#if data.guest.status === 'blocked'}
            <span class="status-badge status-blocked">Blocked</span>
          {:else if data.guest.status === 'removed'}
            <span class="status-badge status-removed">Removed</span>
          {/if}
          <span class="first-seen">Added {formatDate(data.guest.firstSeen)}</span>
        </div>
        {#if data.guest.statusReason && data.guest.status !== 'active'}
          <p class="status-reason">{data.guest.statusReason}</p>
        {/if}
      </div>

      <div class="actions">
        {#if actionError || deleteError}
          <p class="action-error">{actionError || deleteError}</p>
        {/if}
        {#if data.guest.type === 'unclaimed' || data.guest.type === 'claimed' || data.guest.type === 'admin' || data.guest.type === 'organizer'}
          <button class="btn-secondary" onclick={openEditModal}>Edit</button>
          <button class="btn-danger-outline" onclick={() => { showDeleteModal = true; deleteError = '' }}>Delete</button>
        {:else if data.guest.type === 'session' && data.guest.status !== 'removed'}
          {#if data.guest.status === 'active'}
            <button class="btn-danger-outline" onclick={() => { showBlockModal = true; actionError = '' }}>Block</button>
            <button class="btn-danger" onclick={() => { showRemoveModal = true; actionError = '' }}>Remove</button>
          {:else if data.guest.status === 'blocked'}
            <button class="btn-secondary" onclick={doUnblock} disabled={actionLoading}>
              {actionLoading ? 'Unblocking…' : 'Unblock'}
            </button>
            <button class="btn-danger" onclick={() => { showRemoveModal = true; actionError = '' }}>Remove</button>
          {/if}
        {/if}
      </div>
    </div>

    <!-- RSVP history (all types) -->
    <section class="section">
      <h2>RSVPs ({data.guest.events.length})</h2>
      {#if data.guest.events.length === 0}
        <p class="empty">No event responses yet.</p>
      {:else}
        <div class="event-list">
          {#each data.guest.events as ev}
            <div class="event-row">
              <div class="event-info">
                <a href="/event/{ev.eventSlug}" class="event-title">{ev.eventTitle}</a>
                <p class="event-date">{formatDate(ev.startsAt)}</p>
              </div>
              <div class="event-badges">
                <span class="badge {rsvpColors[ev.rsvpStatus] ?? ''}">{ev.rsvpStatus}</span>
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

    {#if data.guest.invites && data.guest.invites.length > 0}
      <!-- Formal invitations sent to this contact -->
      <section class="section">
        <h2>Sent invitations ({data.guest.invites.length})</h2>
        <div class="event-list">
          {#each data.guest.invites as invite}
            <div class="event-row">
              <div class="event-info">
                <a href="/event/{invite.eventSlug}" class="event-title">{invite.eventTitle}</a>
                <p class="event-date">{formatDate(invite.startsAt)}</p>
              </div>
              <div class="event-badges">
                {#if invite.tokenStatus === 'active' && !invite.visited}
                  <span class="badge badge-pending">Pending</span>
                {:else if invite.visited && invite.rsvpStatus}
                  <span class="badge {rsvpColors[invite.rsvpStatus] ?? ''}">{invite.rsvpStatus}</span>
                  <span class="badge badge-visited">Visited</span>
                {:else if invite.visited}
                  <span class="badge badge-visited">Visited</span>
                {:else if invite.tokenStatus !== 'active'}
                  <span class="badge badge-revoked">Revoked</span>
                {/if}
                {#if invite.headCount && invite.headCount > 1}
                  <span class="head-count">×{invite.headCount}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</main>

<!-- Contact edit modal -->
{#if showEditModal}
  <div class="modal-backdrop" role="presentation" onclick={() => showEditModal = false}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit contact" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Edit contact</h3>
        <button class="modal-close" onclick={() => showEditModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if editError}
          <p class="action-error">{editError}</p>
        {/if}
        <label class="modal-label">
          Name <span class="req">*</span>
          <input type="text" bind:value={editName} placeholder="Full name" />
        </label>
        <label class="modal-label">
          Email
          <input type="email" bind:value={editEmail} placeholder="person@example.com" />
        </label>
        <label class="modal-label">
          Phone
          <input type="tel" bind:value={editPhone} placeholder="+1 555 000 0000" />
        </label>
        <label class="modal-label">
          Instagram
          <input type="text" bind:value={editInstagram} placeholder="@handle" />
        </label>
        <label class="modal-label">
          Notes
          <textarea bind:value={editNotes} rows="3" placeholder="Any notes…"></textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showEditModal = false} disabled={editSaving}>Cancel</button>
        <button class="btn-primary" onclick={saveEdit} disabled={editSaving}>
          {editSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Contact delete confirmation -->
{#if showDeleteModal}
  <div class="modal-backdrop" role="presentation" onclick={() => showDeleteModal = false}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Delete contact" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Delete contact</h3>
        <button class="modal-close" onclick={() => showDeleteModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">Remove <strong>{data.guest.displayName}</strong> from the directory? Their invite tokens will have the contact association removed, but the tokens themselves remain.</p>
        {#if deleteError}
          <p class="action-error">{deleteError}</p>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showDeleteModal = false} disabled={deleteLoading}>Cancel</button>
        <button class="btn-danger" onclick={doDeleteContact} disabled={deleteLoading}>
          {deleteLoading ? 'Deleting…' : 'Delete contact'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Block modal -->
{#if showBlockModal}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        <h3>Block guest</h3>
        <button class="modal-close" onclick={() => showBlockModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">The guest will be unable to RSVP. Their existing RSVPs are preserved but hidden from public view.</p>
        {#if actionError}
          <p class="action-error">{actionError}</p>
        {/if}
        <label class="modal-label">
          Reason <span class="req">*</span>
          <textarea bind:value={blockReason} rows="3" placeholder="Reason for blocking…"></textarea>
        </label>
        <label class="modal-check">
          <input type="checkbox" bind:checked={blockEmail} />
          Also block their email address (prevent re-entry with same email)
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showBlockModal = false} disabled={actionLoading}>Cancel</button>
        <button class="btn-danger" onclick={doBlock} disabled={actionLoading}>
          {actionLoading ? 'Blocking…' : 'Block guest'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Remove modal -->
{#if showRemoveModal}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        <h3>Remove guest</h3>
        <button class="modal-close" onclick={() => showRemoveModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">This is permanent. The guest's token will be blacklisted and all their RSVPs deleted.</p>
        {#if actionError}
          <p class="action-error">{actionError}</p>
        {/if}
        <label class="modal-check">
          <input type="checkbox" bind:checked={removeBlockEmail} />
          Also permanently block their email address
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => showRemoveModal = false} disabled={actionLoading}>Cancel</button>
        <button class="btn-danger" onclick={doRemove} disabled={actionLoading}>
          {actionLoading ? 'Removing…' : 'Remove permanently'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 800px; margin: 0 auto; }

  .back-link { margin-bottom: 1.25rem; }
  .back-link a { color: #b05525; text-decoration: none; font-size: 0.875rem; font-weight: 500; }
  .back-link a:hover { text-decoration: underline; }

  .guest-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; flex-wrap: wrap; }
  .name-row { display: flex; align-items: baseline; gap: 0.625rem; margin-bottom: 0.25rem; }
  h1 { margin: 0; font-size: 1.75rem; color: #1a1510; }
  .short-id { font-size: 0.9rem; color: #8a7a6e; font-family: monospace; background: #ede8e0; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .guest-detail { margin: 0.125rem 0; color: #6b6058; font-size: 0.875rem; }
  .guest-notes { margin: 0.5rem 0 0; color: #4e453e; font-size: 0.875rem; font-style: italic; max-width: 480px; }
  .guest-badges { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .first-seen { font-size: 0.8rem; color: #8a7a6e; }
  .status-reason { margin: 0.375rem 0 0; font-size: 0.825rem; color: #7a3010; font-style: italic; }

  .type-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; }
  .type-guest { background: #e8f0fc; color: #2a4a7a; }
  .type-admin { background: #e8f0fc; color: #2a4a7a; }
  .type-organizer { background: #e8f0fc; color: #2a4a7a; }
  .type-session { background: #ede8e0; color: #4e453e; }
  .type-contact { background: #f4eddc; color: #6e4e1a; }

  .status-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; }
  .status-blocked { background: #fef3cd; color: #7a5a10; }
  .status-removed { background: #ede8e0; color: #9a8f86; text-decoration: line-through; }

  .actions { display: flex; align-items: flex-start; flex-direction: column; gap: 0.5rem; flex-shrink: 0; }
  .action-error { margin: 0; font-size: 0.825rem; color: #8b3016; }

  .section { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .empty { color: #6b6058; font-size: 0.9rem; margin: 0; }

  .event-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .event-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; gap: 1rem;
  }
  .event-info { min-width: 0; }
  .event-title { font-weight: 600; text-decoration: none; color: #1a1510; font-size: 0.95rem; }
  .event-title:hover { color: #b05525; }
  .event-date { margin: 0.2rem 0 0; font-size: 0.8rem; color: #6b6058; }

  .event-badges { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; flex-wrap: wrap; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .status-yes { background: #e8f4e4; color: #2a5e28; }
  .status-maybe { background: #fef6e0; color: #7a5a10; }
  .status-no { background: #f8e8e2; color: #7a2a1a; }
  .badge-checkin { background: #e0f0f8; color: #1a4a6e; }
  .badge-visited { background: #e8f0fc; color: #2a4a7a; }
  .badge-pending { background: #fef6e0; color: #7a5a10; }
  .badge-revoked { background: #f8e8e2; color: #7a2a1a; }
  .head-count { font-size: 0.8rem; color: #6b6058; }

  /* Buttons */
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-secondary { background: #ede8e0; color: #3d352e; border: 1px solid #c8bdb0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
  .btn-secondary:hover:not(:disabled) { background: #e0d8cc; }
  .btn-danger { background: #b03016; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #8a2412; }
  .btn-danger-outline { background: transparent; color: #b03016; border: 1.5px solid #b03016; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-danger-outline:hover:not(:disabled) { background: #fdf2ee; }
  button:disabled { opacity: 0.6; cursor: default; }

  /* Modals */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(26,21,16,.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
  .modal { background: #f8f2e8; border: 1px solid #cfc3b0; border-radius: 16px; max-width: 460px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #e0d4c4; }
  h3 { margin: 0; font-size: 1.1rem; color: #1a1510; }
  .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #6b6058; cursor: pointer; padding: .1rem .25rem; }
  .modal-close:hover { color: #1a1510; }
  .modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: .75rem; }
  .modal-desc { margin: 0; font-size: 0.875rem; color: #4e453e; }
  .modal-label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .modal-label input, .modal-label textarea { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .modal-label input:focus, .modal-label textarea:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .modal-label textarea { resize: vertical; }
  .modal-check { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.875rem; color: #3d352e; cursor: pointer; }
  .modal-check input { margin-top: 0.125rem; flex-shrink: 0; }
  .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; padding: 1rem 1.5rem 1.25rem; border-top: 1px solid #e0d4c4; }
  .req { color: #c03828; }
</style>
