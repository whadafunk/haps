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
      : data.guests.filter((g: GuestRow) => {
          const q = search.toLowerCase()
          return (
            (g.displayName ?? '').toLowerCase().includes(q) ||
            (g.email ?? '').toLowerCase().includes(q) ||
            (g.phone ?? '').toLowerCase().includes(q) ||
            g.id.slice(0, 8).includes(q)
          )
        })
  )

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function guestHref(g: { id: string; type: string }) {
    return `/admin/guests/c-${g.id}`
  }

  // ── Multi-select ────────────────────────────────────────────────────────────
  let selected = $state(new Set<string>())

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    selected = next
  }

  function selectAll() {
    selected = new Set(filtered.filter((g: GuestRow) => g.type !== 'admin' && g.type !== 'organizer').map((g: GuestRow) => g.id))
  }

  function clearSelection() {
    selected = new Set()
  }

  const selectableGuests = $derived(
    filtered.filter((g: GuestRow) => g.type !== 'admin' && g.type !== 'organizer')
  )
  const selectedContacts = $derived(
    filtered.filter((g: GuestRow) => selected.has(g.id))
  )
  const selectedNonContacts = $derived([] as GuestRow[])

  // ── Bulk delete ─────────────────────────────────────────────────────────────
  let showBulkDeleteModal = $state(false)
  let bulkDeleting = $state(false)
  let bulkError = $state('')

  async function doBulkDelete() {
    bulkDeleting = true; bulkError = ''
    try {
      await Promise.all(selectedContacts.map((g: GuestRow) => api.deleteGuest(g.id)))
      showBulkDeleteModal = false
      clearSelection()
      await invalidateAll()
    } catch (e: unknown) {
      bulkError = e instanceof ApiError ? e.message : 'Some deletions failed.'
    } finally { bulkDeleting = false }
  }

  // ── Bulk invite to event ─────────────────────────────────────────────────────
  let showBulkInviteModal = $state(false)
  let inviteEvents = $state<Array<{ slug: string; title: string; status: string; startsAt: string }>>([])
  let inviteEventsLoading = $state(false)
  let selectedEventSlug = $state('')
  let inviteSendEmail = $state(false)
  let inviteSendWhatsapp = $state(false)
  let inviting = $state(false)
  let inviteError = $state('')
  let inviteResults = $state<Array<{ guestName: string; inviteLink: string; emailSent: boolean; whatsappUrl: string | null }> | null>(null)

  const inviteSelectedEmailCount = $derived(
    selectedContacts.filter((g: GuestRow) => g.email).length
  )
  const inviteSelectedPhoneCount = $derived(
    selectedContacts.filter((g: GuestRow) => g.phone).length
  )

  async function openBulkInviteModal() {
    showBulkInviteModal = true
    inviteResults = null
    inviteError = ''
    selectedEventSlug = ''
    inviteSendEmail = false
    inviteSendWhatsapp = false
    if (inviteEvents.length === 0) {
      inviteEventsLoading = true
      try {
        const res = await api.listAdminEvents()
        inviteEvents = res.events.filter(e => e.status === 'published')
      } catch { inviteError = 'Failed to load events.' }
      finally { inviteEventsLoading = false }
    }
  }

  async function doBulkInvite() {
    if (!selectedEventSlug || selectedContacts.length === 0) return
    inviting = true
    inviteError = ''
    try {
      const channels: string[] = []
      if (inviteSendEmail) channels.push('email')
      if (inviteSendWhatsapp) channels.push('whatsapp')
      const res = await api.bulkInvite(selectedEventSlug, selectedContacts.map((g: GuestRow) => g.id), channels)
      for (const inv of res.invitations) {
        try { localStorage.setItem(`haps:inviteLink:${selectedEventSlug}:${inv.tokenId}`, inv.inviteLink) } catch { /* */ }
      }
      inviteResults = res.invitations.map(inv => ({
        guestName: (inv as unknown as { guestName: string }).guestName ?? (inv as unknown as { contactName: string }).contactName,
        inviteLink: inv.inviteLink ?? '',
        emailSent: inv.emailSent,
        whatsappUrl: inv.whatsappUrl,
      }))
    } catch (e: unknown) {
      inviteError = e instanceof ApiError ? e.message : 'Failed to send invitations.'
    } finally { inviting = false }
  }

  let copiedInviteIdx = $state<number | null>(null)
  async function copyInviteResult(idx: number, link: string) {
    try {
      await navigator.clipboard.writeText(link)
      copiedInviteIdx = idx
      setTimeout(() => { copiedInviteIdx = null }, 2000)
    } catch { /* */ }
  }

  // ── Add contact modal ────────────────────────────────────────────────────────
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

  async function addContact() {
    if (!addName.trim()) { addError = 'Name is required.'; return }
    if (!addEmail.trim()) { addError = 'Email is required.'; return }
    addSaving = true; addError = ''
    try {
      await api.createGuest({
        name: addName.trim(),
        email: addEmail.trim(),
        phone: addPhone.trim() || undefined,
        instagramHandle: addInstagram.trim() || undefined,
      })
      showAddModal = false
      await invalidateAll()
    } catch (e: unknown) {
      addError = e instanceof ApiError ? e.message : 'Failed to add contact.'
    } finally { addSaving = false }
  }
</script>

<main class="page">
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Guests</h1>
        <p class="subtitle">{data.guests.length} {data.guests.length !== 1 ? 'entries' : 'entry'}</p>
      </div>
      <button class="btn-add" onclick={openAddModal}>+ Add contact</button>
    </div>

    <div class="toolbar">
      <input type="search" bind:value={search} placeholder="Search by name, email or phone…" class="search-input" />
      <label class="select-all-wrap">
        <input
          type="checkbox"
          class="check"
          checked={selected.size > 0 && selected.size === selectableGuests.length}
          indeterminate={selected.size > 0 && selected.size < selectableGuests.length}
          onchange={() => selected.size === selectableGuests.length ? clearSelection() : selectAll()}
        />
        <span class="select-all-label">All</span>
      </label>
    </div>

    {#if selected.size > 0}
      <div class="bulk-bar">
        <span class="bulk-count">
          {selected.size} selected
        </span>
        <button class="btn-ghost-sm" onclick={clearSelection}>Clear</button>
        <button
          class="btn-invite-sm"
          disabled={selectedContacts.length === 0}
          onclick={openBulkInviteModal}
        >
          Invite to event
        </button>
        <button
          class="btn-danger-sm"
          disabled={selectedContacts.length === 0}
          onclick={() => { bulkError = ''; showBulkDeleteModal = true }}
        >
          Delete {selectedContacts.length > 0 ? selectedContacts.length : ''} contact{selectedContacts.length !== 1 ? 's' : ''}
        </button>

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
          {@const isOperator = guest.type === 'admin' || guest.type === 'organizer'}
          <div class="guest-row-wrap" class:is-selected={selected.has(guest.id)}>
            {#if isOperator}
              <div class="row-check row-check-placeholder"></div>
            {:else}
              <label class="row-check" onclick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  class="check"
                  checked={selected.has(guest.id)}
                  onchange={() => toggleSelect(guest.id)}
                />
              </label>
            {/if}
            <a href={guestHref(guest)} class="guest-row">
              <div class="guest-info">
                <span class="guest-name">{guest.displayName ?? 'Anonymous'}</span>
                {#if guest.email}
                  <span class="guest-email">{guest.email}</span>
                {/if}
                {#if guest.phone}
                  <span class="guest-phone">{guest.phone}</span>
                {/if}
              </div>
              <div class="guest-meta">
                <span class="event-count">{guest.eventCount > 0 ? `${guest.eventCount} event${guest.eventCount !== 1 ? 's' : ''}` : 'Not yet attended'}</span>
                {#if guest.eventCount > 0}
                  <span class="first-seen">{formatDate(guest.firstSeen)}</span>
                {/if}
                {#if guest.status === 'blocked'}
                  <span class="status-badge status-blocked">Blocked</span>
                {:else if guest.status === 'removed'}
                  <span class="status-badge status-removed">Removed</span>
                {/if}
                <span class="type-badge type-{guest.type}">
                  {guest.type === 'admin' ? 'Admin' : guest.type === 'organizer' ? 'Organizer' : guest.type === 'claimed' ? 'Claimed' : 'Unclaimed'}
                </span>
              </div>
            </a>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>

<!-- Bulk invite to event -->
{#if showBulkInviteModal}
  <div class="modal-backdrop" role="presentation" onclick={() => { if (!inviting) showBulkInviteModal = false }}>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="Invite to event" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Invite {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''} to event</h3>
        <button class="modal-close" onclick={() => showBulkInviteModal = false} aria-label="Close" disabled={inviting}>×</button>
      </div>

      {#if inviteResults}
        <!-- Results view -->
        <div class="modal-body">
          <div class="success-banner">{inviteResults.length} invitation{inviteResults.length !== 1 ? 's' : ''} generated.</div>
          <div class="invited-results-list">
            {#each inviteResults as inv, idx (idx)}
              <div class="invited-result-row">
                <div class="invited-result-header">
                  <span class="dir-name">{inv.guestName}</span>
                  {#if inv.emailSent}<span class="delivery-badge">Email sent</span>{/if}
                </div>
                {#if inv.inviteLink}
                  <div class="invite-link-row">
                    <code class="invite-url">{inv.inviteLink}</code>
                    <button class="copy-btn" onclick={() => copyInviteResult(idx, inv.inviteLink)}>
                      {copiedInviteIdx === idx ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                {/if}
                {#if inv.whatsappUrl}
                  <a href={inv.whatsappUrl} target="_blank" rel="noopener noreferrer" class="btn-whatsapp">Open WhatsApp</a>
                {/if}
              </div>
            {/each}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" onclick={() => { inviteResults = null; showBulkInviteModal = false; clearSelection() }}>Done</button>
        </div>

      {:else}
        <!-- Selection view -->
        <div class="modal-body">
          {#if inviteError}
            <div class="error-banner">{inviteError}</div>
          {/if}

          <div class="field">
            <span class="field-label">Event <span class="req">*</span></span>
            {#if inviteEventsLoading}
              <p class="loading-text">Loading events…</p>
            {:else if inviteEvents.length === 0}
              <p class="field-hint">No published events found.</p>
            {:else}
              <select bind:value={selectedEventSlug} class="field-select">
                <option value="">Select an event…</option>
                {#each inviteEvents as ev (ev.slug)}
                  <option value={ev.slug}>{ev.title}</option>
                {/each}
              </select>
            {/if}
          </div>

          <div class="channel-section">
            <p class="channel-section-label">Delivery channels</p>
            <label class="checkbox">
              <input type="checkbox" bind:checked={inviteSendEmail} />
              Email
              <span class="channel-count">({inviteSelectedEmailCount} of {selectedContacts.length} have email)</span>
            </label>
            <label class="checkbox">
              <input type="checkbox" bind:checked={inviteSendWhatsapp} />
              WhatsApp
              <span class="channel-count">({inviteSelectedPhoneCount} of {selectedContacts.length} have phone)</span>
            </label>
            <label class="checkbox checkbox-disabled">
              <input type="checkbox" disabled />
              In-app <span class="phase-badge-sm">Phase 2</span>
            </label>
            {#if !inviteSendEmail && !inviteSendWhatsapp && selectedEventSlug}
              <p class="channel-hint">No delivery channel selected — for invite-only events, personal links are still generated.</p>
            {/if}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick={() => showBulkInviteModal = false} disabled={inviting}>Cancel</button>
          <button
            class="btn-primary"
            onclick={doBulkInvite}
            disabled={inviting || !selectedEventSlug || selectedContacts.length === 0}
          >
            {inviting ? 'Sending…' : `Invite ${selectedContacts.length}`}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

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

<!-- Add contact modal -->
{#if showAddModal}
  <div class="modal-backdrop" onclick={() => showAddModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add contact">
      <div class="modal-header">
        <h3>Add contact</h3>
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
          <span class="field-label">Email <span class="req">*</span></span>
          <input id="add-email" type="email" bind:value={addEmail} placeholder="person@example.com" required />
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
        <button class="btn-primary" onclick={addContact} disabled={addSaving}>
          {addSaving ? 'Adding…' : 'Add contact'}
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
  .btn-invite-sm { background: #b05525; color: #fff; border: none; padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.825rem; font-weight: 600; cursor: pointer; }
  .btn-invite-sm:hover:not(:disabled) { background: #924418; }
  .btn-invite-sm:disabled { opacity: 0.4; cursor: default; }
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
  .guest-phone { font-size: 0.8rem; color: #8a7a6e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .guest-meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .event-count { font-size: 0.8rem; color: #6b6058; white-space: nowrap; }
  .first-seen { font-size: 0.8rem; color: #8a7a6e; white-space: nowrap; }

  .type-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap; }
  .type-admin { background: #e8f0fc; color: #2a4a7a; }
  .type-organizer { background: #e8f0fc; color: #2a4a7a; }
  .type-claimed { background: #e6f4ea; color: #1a5c30; }
  .type-unclaimed { background: #f4eddc; color: #6e4e1a; }
  .row-check-placeholder { width: 2.5rem; flex-shrink: 0; }

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
  .success-banner { background: #e8f4e4; border: 1px solid #a8d8a0; color: #2a5e28; border-radius: 8px; padding: .625rem .875rem; font-size: .875rem; margin: 0; }
  .req { color: #c03828; }
  .modal-wide { max-width: 560px; }
  .field-select { padding: .5rem .75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: .9rem; font-family: inherit; background: #fff; color: #1a1510; width: 100%; }
  .field-select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .loading-text { margin: 0; font-size: 0.875rem; color: #6b6058; }
  .channel-section { display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid #e0d4c4; padding-top: 0.75rem; }
  .channel-section-label { margin: 0 0 0.125rem; font-size: 0.8rem; font-weight: 600; color: #6b6058; text-transform: uppercase; letter-spacing: 0.04em; }
  .checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #1a1510; cursor: pointer; }
  .checkbox input { accent-color: #b05525; cursor: pointer; }
  .checkbox-disabled { opacity: 0.5; cursor: not-allowed; }
  .checkbox-disabled input { cursor: not-allowed; }
  .channel-count { font-size: 0.8rem; color: #9a8f86; }
  .channel-hint { margin: 0; font-size: 0.8rem; color: #8a6020; background: #faf0d8; border: 1px solid #e0c880; border-radius: 6px; padding: 0.4rem 0.625rem; }
  .phase-badge-sm { font-size: 0.7rem; font-weight: 700; background: #e8ddd0; color: #9a8f86; padding: 0.1rem 0.4rem; border-radius: 3px; }
  .invited-results-list { display: flex; flex-direction: column; gap: 0.75rem; max-height: 320px; overflow-y: auto; }
  .invited-result-row { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem; background: #fff; border: 1px solid #e0d4c4; border-radius: 8px; }
  .invited-result-header { display: flex; align-items: center; gap: 0.5rem; }
  .dir-name { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .delivery-badge { font-size: 0.75rem; font-weight: 600; background: #e8f4e4; color: #2a5e28; padding: 0.15rem 0.5rem; border-radius: 4px; }
  .invite-link-row { display: flex; align-items: center; gap: 0.5rem; }
  .invite-url { font-size: 0.75rem; color: #4e453e; background: #f0e8da; border-radius: 4px; padding: 0.2rem 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .copy-btn { background: #ede8e0; border: 1px solid #c8bdb0; color: #4e453e; font-size: 0.775rem; font-weight: 600; padding: 0.25rem 0.625rem; border-radius: 6px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
  .copy-btn:hover { background: #e0d8cc; }
  .btn-whatsapp { display: inline-block; background: #25d366; color: #fff; text-decoration: none; font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0.625rem; border-radius: 6px; width: fit-content; }
  .btn-whatsapp:hover { background: #1dae53; }
</style>
