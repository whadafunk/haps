<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'

  let { data } = $props<{ data: PageData }>()

  const event = $state({ ...data.event })
  let saving = $state(false)
  let saveError = $state('')
  let saveSuccess = $state(false)
  let deleting = $state(false)

  let editLink = $state('')
  let linkCopied = $state(false)

  let comments = $state<Array<{ id: string; displayName: string; body: string; createdAt: string }>>([])
  let commentsLoaded = $state(false)

  type TokenRow = { id: string; type: string; label: string | null; status: string; singleUse: boolean; claimedBySessionId: string | null; createdAt: string }
  const generalTokenId = (data.tokens as TokenRow[]).find(t => t.type === 'attendee' && !t.singleUse && t.status === 'active')?.id ?? null
  let generalTokenRaw = $state<string | null>(null)
  let generalCopied = $state(false)
  let generatingInvite = $state(false)
  let singleUseCopied = $state(false)
  let inviteError = $state('')

  // Invite-only token management
  let inviteTokens = $state((data.tokens as TokenRow[]).filter(t => t.type === 'attendee'))
  let newlyGenerated = $state<Array<{ tokenId: string; rawToken: string }>>([])
  let newLinkLabel = $state('')
  let generatingPersonalInvite = $state(false)
  let invitePersonalError = $state('')
  let copiedInviteTokenId = $state<string | null>(null)
  let showInviteModal = $state(false)
  const activeInviteTokens = $derived(inviteTokens.filter((t: TokenRow) => t.status === 'active'))
  const claimedInviteCount = $derived(activeInviteTokens.filter((t: TokenRow) => t.claimedBySessionId !== null).length)
  const unclaimedInviteCount = $derived(activeInviteTokens.filter((t: TokenRow) => t.claimedBySessionId === null).length)

  let blastSubject = $state('')
  let blastBody = $state('')
  let blastEmail = $state(true)
  let blastSms = $state(false)
  let blastLoading = $state(false)
  let blastError = $state('')
  let blastSuccess = $state('')

  let coverUploading = $state(false)
  let coverError = $state('')
  let coverPreview = $state<string | null>(event.coverImageUrl ?? null)

  async function uploadCover(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    coverError = ''
    coverUploading = true
    try {
      const res = await api.uploadCover(event.slug, file, data.editToken)
      event.coverImageUrl = res.coverImageUrl
      coverPreview = res.coverImageUrl
    } catch (err: unknown) {
      coverError = err instanceof ApiError ? err.message : 'Upload failed.'
    } finally {
      coverUploading = false
      input.value = ''
    }
  }

  onMount(() => {
    // Read edit link from localStorage (stored when the token-based URL was first visited)
    try {
      const stored = localStorage.getItem(`haps:editLink:${event.slug}`)
      if (stored) editLink = stored
    } catch { /* storage disabled */ }

    // Load general token raw value from localStorage
    if (generalTokenId) {
      try {
        const raw = localStorage.getItem(`haps:inviteToken:${event.slug}:${generalTokenId}`)
        if (raw) generalTokenRaw = raw
      } catch { /* storage disabled */ }
    }

    api.listComments(event.slug).then(res => {
      comments = res.comments
      commentsLoaded = true
    }).catch(() => { commentsLoaded = true })
  })

  function inviteUrl(rawToken: string) {
    return `${window.location.origin}/event/${event.slug}?t=${rawToken}`
  }

  async function copyGeneralLink() {
    if (!generalTokenRaw) return
    try {
      await navigator.clipboard.writeText(inviteUrl(generalTokenRaw))
      generalCopied = true
      setTimeout(() => { generalCopied = false }, 2000)
    } catch { /* clipboard unavailable */ }
  }

  async function copySingleUseLink() {
    generatingInvite = true
    inviteError = ''
    try {
      const res = await api.createToken(event.slug, { type: 'attendee', singleUse: true }, data.editToken)
      await navigator.clipboard.writeText(inviteUrl(res.rawToken))
      singleUseCopied = true
      setTimeout(() => { singleUseCopied = false }, 2000)
    } catch (e: unknown) {
      inviteError = e instanceof ApiError ? e.message : 'Failed to generate link.'
    } finally {
      generatingInvite = false
    }
  }

  async function generatePersonalInvite() {
    generatingPersonalInvite = true
    invitePersonalError = ''
    try {
      const res = await api.createToken(event.slug, { type: 'attendee', singleUse: true, label: newLinkLabel || undefined }, data.editToken)
      inviteTokens = [...inviteTokens, { id: res.token.id, type: 'attendee', label: res.token.label, status: 'active', singleUse: true, claimedBySessionId: null, createdAt: new Date().toISOString() }]
      newlyGenerated = [...newlyGenerated, { tokenId: res.token.id, rawToken: res.rawToken }]
      newLinkLabel = ''
    } catch (e: unknown) {
      invitePersonalError = e instanceof ApiError ? e.message : 'Failed to generate invite.'
    } finally {
      generatingPersonalInvite = false
    }
  }

  async function revokeInviteToken(tokenId: string) {
    if (!confirm('Revoke this invite link? It will no longer work.')) return
    try {
      await api.deleteToken(event.slug, tokenId, data.editToken)
      inviteTokens = inviteTokens.map(t => t.id === tokenId ? { ...t, status: 'blacklisted' } : t)
      newlyGenerated = newlyGenerated.filter(g => g.tokenId !== tokenId)
    } catch { /**/ }
  }

  async function copyPersonalInviteLink(tokenId: string) {
    const gen = newlyGenerated.find(g => g.tokenId === tokenId)
    if (!gen) return
    try {
      await navigator.clipboard.writeText(inviteUrl(gen.rawToken))
      copiedInviteTokenId = tokenId
      setTimeout(() => { copiedInviteTokenId = null }, 2000)
    } catch { /**/ }
  }

  let publishError = $state('')

  async function updateStatus(newStatus: string) {
    if (newStatus === 'published') {
      publishError = ''
      if (!event.title?.trim()) { publishError = 'Event title is required.'; return }
      if (!event.startsAt) { publishError = 'Event date is required.'; return }
    }
    saving = true
    saveError = ''
    try {
      await api.updateEvent(event.slug, { status: newStatus }, data.editToken)
      event.status = newStatus
    } catch (e: unknown) {
      saveError = e instanceof ApiError ? e.message : 'Failed to update status.'
    } finally {
      saving = false
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(editLink)
      linkCopied = true
      setTimeout(() => { linkCopied = false }, 2000)
    } catch { /* clipboard unavailable */ }
  }

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
        theme: event.theme ?? undefined,
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
      await api.deleteRsvp(event.slug, rsvpId, data.editToken)
      await invalidateAll()
    } catch { /**/ }
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    try {
      await api.deleteComment(event.slug, commentId, data.editToken)
      comments = comments.filter(c => c.id !== commentId)
    } catch { /**/ }
  }

  async function sendBlast() {
    if (!blastSubject || !blastBody) { blastError = 'Subject and message are required.'; return }
    const channels: string[] = []
    if (blastEmail) channels.push('email')
    if (blastSms) channels.push('sms')
    blastLoading = true
    blastError = ''
    blastSuccess = ''
    try {
      const res = await api.sendBlast(event.slug, { subject: blastSubject, body: blastBody, channels }, data.editToken)
      blastSuccess = channels.length > 0
        ? `Blast posted. ${res.queued} delivery job${res.queued !== 1 ? 's' : ''} queued.`
        : 'Blast posted to event channel.'
      blastSubject = ''
      blastBody = ''
    } catch (e: unknown) {
      blastError = e instanceof ApiError ? e.message : 'Failed to send blast.'
    } finally {
      blastLoading = false
    }
  }
</script>

<main class="edit-page">
  <div class="header">
    <a href="/event/{event.slug}">← Back to event</a>
    <h1>Manage: {event.title}</h1>
  </div>

  <div class="cover-card">
    <h2>Cover image</h2>
    {#if coverPreview}
      <img src={coverPreview} alt="Event cover" class="cover-preview" />
    {:else}
      <div class="cover-placeholder">No cover image</div>
    {/if}
    {#if coverError}
      <div class="error-banner">{coverError}</div>
    {/if}
    <label class="cover-upload-btn">
      {coverUploading ? 'Uploading…' : coverPreview ? 'Change image' : 'Upload image'}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={uploadCover} disabled={coverUploading} hidden />
    </label>
  </div>

  <div class="grid">
    {#if editLink}
      <section class="card wide">
        <h2>Edit link</h2>
        <p class="muted">Bookmark this page or share the link below with anyone who needs to co-manage this event.</p>
        <div class="invite-url-row">
          <code class="invite-url">{editLink}</code>
          <button class="copy-btn" onclick={copyLink}>{linkCopied ? 'Copied!' : 'Copy'}</button>
        </div>
      </section>
    {/if}

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
          Theme
          <select bind:value={event.theme}>
            <option value="">Default (warm)</option>
            <option value="forest">Forest (green)</option>
            <option value="ocean">Ocean (blue)</option>
            <option value="sunset">Sunset (red)</option>
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
      <h2>Status</h2>
      <div class="status-row">
        <span class="status-badge status-{event.status}">{event.status}</span>
        {#if event.status === 'draft'}
          <div class="status-actions">
            {#if publishError}
              <p class="publish-error">{publishError}</p>
            {/if}
            <button class="btn-publish" onclick={() => updateStatus('published')} disabled={saving}>
              Publish event
            </button>
          </div>
        {:else if event.status === 'published'}
          <button class="btn-cancel-event" onclick={() => { if (confirm('Cancel this event? Guests will see a cancellation notice.')) updateStatus('cancelled') }} disabled={saving}>
            Cancel event
          </button>
        {:else if event.status === 'cancelled'}
          <p class="status-note">This event has been cancelled.</p>
        {/if}
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

    <section class="card wide">
      <h2>Invite links <span class="event-type-badge event-type-{event.eventType}">{event.eventType === 'invite_only' ? 'Invite-only' : 'Open'}</span></h2>

      {#if event.status === 'draft'}
        <p class="draft-lock">Publish the event to share invite links.</p>
      {:else if event.eventType === 'invite_only'}
        <div class="invite-summary">
          <span class="invite-counter">{activeInviteTokens.length} invite{activeInviteTokens.length !== 1 ? 's' : ''} · {claimedInviteCount} claimed · {unclaimedInviteCount} unclaimed</span>
          <button class="btn-manage-invites" onclick={() => showInviteModal = true}>Manage invitations →</button>
        </div>
      {:else}
        {#if inviteError}
          <div class="error-banner">{inviteError}</div>
        {/if}
        <div class="invite-type-rows">
          <div class="invite-type-row">
            <div class="invite-type-info">
              <span class="invite-type-label">General invite link</span>
              <span class="invite-type-desc">Reusable — anyone with this link can RSVP</span>
            </div>
            {#if generalTokenRaw}
              <button class="copy-btn" onclick={copyGeneralLink}>{generalCopied ? 'Copied!' : 'Copy'}</button>
            {:else}
              <span class="muted" style="font-size:0.8rem">Not available (visit via edit link to restore)</span>
            {/if}
          </div>
        </div>
      {/if}
    </section>

    <section class="card wide">
      <h2>Comments ({comments.length})</h2>
      {#if event.status === 'draft'}
        <p class="draft-lock">Comments are available once the event is published.</p>
      {:else if !commentsLoaded}
        <p class="muted">Loading…</p>
      {:else if comments.length === 0}
        <p class="muted">No comments yet.</p>
      {:else}
        <div class="comment-list">
          {#each comments as comment (comment.id)}
            <div class="comment-row">
              <div class="comment-meta">
                <strong>{comment.displayName}</strong>
                <span class="comment-time">{new Date(comment.createdAt).toLocaleDateString()}</span>
              </div>
              <p class="comment-body">{comment.body}</p>
              <button class="btn-remove" onclick={() => deleteComment(comment.id)}>Delete</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="card wide">
      <h2>Send blast</h2>

      {#if event.status === 'draft'}
        <p class="draft-lock">Publish the event before sending updates to guests.</p>
      {:else}
      <p class="muted">Post a message to the event channel. Optionally deliver it to guests via email or SMS.</p>

      {#if blastError}
        <div class="error-banner">{blastError}</div>
      {/if}
      {#if blastSuccess}
        <div class="success-banner">{blastSuccess}</div>
      {/if}

      <div class="form">
        <label>Subject <input type="text" bind:value={blastSubject} placeholder="Event update" /></label>
        <label>Message <textarea bind:value={blastBody} rows="4" placeholder="Write your update…"></textarea></label>
        <div class="checkboxes">
          <label class="checkbox"><input type="checkbox" bind:checked={blastEmail} /> Send via email (to yes RSVPs with email)</label>
          <label class="checkbox"><input type="checkbox" bind:checked={blastSms} /> Send via SMS (Phase 2 — requires Twilio)</label>
        </div>
        <div class="form-actions">
          <button onclick={sendBlast} disabled={blastLoading} class="btn-primary">
            {blastLoading ? 'Sending…' : 'Send blast'}
          </button>
        </div>
      </div>
      {/if}
    </section>
  </div>
</main>

{#if showInviteModal}
  <div class="modal-backdrop" onclick={() => showInviteModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage invite links">
      <div class="modal-header">
        <h3>Manage invite links</h3>
        <button class="modal-close" onclick={() => showInviteModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="invite-counter">{activeInviteTokens.length} invite{activeInviteTokens.length !== 1 ? 's' : ''} · {claimedInviteCount} claimed · {unclaimedInviteCount} unclaimed</p>

        {#if invitePersonalError}
          <div class="error-banner">{invitePersonalError}</div>
        {/if}

        <div class="generate-row">
          <input type="text" bind:value={newLinkLabel} placeholder="Guest name or label (optional)" class="generate-input" />
          <button class="btn-generate" onclick={generatePersonalInvite} disabled={generatingPersonalInvite}>
            {generatingPersonalInvite ? 'Generating…' : '+ Generate invite link'}
          </button>
        </div>

        {#if inviteTokens.length === 0}
          <p class="muted">No invite links yet.</p>
        {:else}
          <div class="invite-list">
            {#each inviteTokens as token (token.id)}
              {@const gen = newlyGenerated.find(g => g.tokenId === token.id)}
              <div class="invite-row">
                <div class="invite-info">
                  <span class="invite-label">{token.label ?? 'Unnamed'}</span>
                  <span class="invite-status {token.status !== 'active' ? 'revoked' : token.claimedBySessionId ? 'claimed' : 'available'}">
                    {token.status !== 'active' ? 'Revoked' : token.claimedBySessionId ? 'Claimed' : 'Unclaimed'}
                  </span>
                </div>
                {#if gen}
                  <div class="invite-link-row">
                    <code class="invite-url">{inviteUrl(gen.rawToken)}</code>
                    <button class="copy-btn" onclick={() => copyPersonalInviteLink(token.id)}>
                      {copiedInviteTokenId === token.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                {:else if token.status === 'active' && !token.claimedBySessionId}
                  <p class="invite-lost">Link not shown — generated in a previous session</p>
                {/if}
                {#if token.status === 'active' && !token.claimedBySessionId}
                  <div class="invite-actions">
                    <button class="btn-revoke" onclick={() => revokeInviteToken(token.id)}>Revoke</button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .edit-page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  .header { margin-bottom: 1rem; }
  .header a { font-size: 0.875rem; color: #6b6058; text-decoration: none; }
  .header a:hover { color: #b05525; }
  h1 { margin: 0.5rem 0 0; font-size: 1.5rem; color: #1a1510; }
  .copy-btn { flex-shrink: 0; background: #c4962d; color: #fff; border: none; padding: 0.4rem 0.875rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .copy-btn:hover { background: #a87c22; }
  .cover-card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .cover-card h2 { margin: 0 0 0.75rem; font-size: 1.1rem; color: #1a1510; }
  .cover-preview { width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px; display: block; margin-bottom: 0.75rem; }
  .cover-placeholder { background: #e8ddd0; border: 1px dashed #c8bdb0; border-radius: 8px; height: 120px; display: flex; align-items: center; justify-content: center; color: #9a8f86; font-size: 0.875rem; margin-bottom: 0.75rem; }
  .cover-upload-btn { display: inline-block; background: #b05525; color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .cover-upload-btn:hover { background: #924418; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
  @media (min-width: 768px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  .card.wide { grid-column: 1 / -1; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .status-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .status-badge { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.25rem 0.625rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .status-badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .status-badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  .status-actions { display: flex; flex-direction: column; gap: 0.375rem; }
  .publish-error { margin: 0; font-size: 0.8rem; color: #8b3016; }
  .btn-publish { background: #2a5e28; color: #fff; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-publish:hover:not(:disabled) { background: #1f4a1e; }
  .btn-publish:disabled { opacity: 0.6; }
  .btn-cancel-event { background: none; border: 1px solid #f0c8b8; color: #8b3016; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-cancel-event:hover:not(:disabled) { background: #fdf2ee; }
  .status-note { margin: 0; font-size: 0.875rem; color: #6b6058; }
  .draft-lock { margin: 0; font-size: 0.875rem; color: #9a8f86; font-style: italic; }
  .invite-type-rows { display: flex; flex-direction: column; gap: 0.75rem; }
  .invite-type-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; background: #e8ddd0; border: 1px solid #cfc3b0; border-radius: 8px; }
  .invite-type-info { display: flex; flex-direction: column; gap: 0.2rem; }
  .invite-type-label { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .invite-type-desc { font-size: 0.8rem; color: #6b6058; }
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
  .rsvp-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; gap: 0.5rem; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.15rem 0.4rem; border-radius: 4px; margin-left: 0.375rem; background: #ede8e0; color: #4e453e; }
  .badge-yes { background: #e8f4e4; color: #2a5e28; }
  .badge-maybe { background: #fef4e0; color: #7a5a1a; }
  .badge-no { background: #ede8e0; color: #4e453e; }
  .note { margin: 0.25rem 0 0; font-size: 0.8rem; color: #6b6058; }
  .comment-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .comment-row { display: flex; flex-direction: column; padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; gap: 0.25rem; }
  .comment-meta { display: flex; align-items: baseline; gap: 0.5rem; }
  .comment-meta strong { font-size: 0.875rem; color: #1a1510; }
  .comment-time { font-size: 0.75rem; color: #9a8f86; }
  .comment-body { margin: 0; font-size: 0.875rem; color: #3d352e; }
  .btn-remove { background: none; border: none; color: #9a8f86; font-size: 0.75rem; cursor: pointer; padding: 0; align-self: flex-end; margin-top: 0.25rem; }
  .btn-remove:hover { color: #8b3016; }
  .invite-url-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .invite-url { font-size: 0.75rem; color: #3d2c08; background: #fff8e8; padding: 0.3rem 0.5rem; border-radius: 6px; border: 1px solid #e0c870; word-break: break-all; flex: 1; min-width: 0; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  .event-type-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 4px; vertical-align: middle; margin-left: 0.5rem; }
  .event-type-open { background: #e8f4e4; color: #2a5e28; }
  .event-type-invite_only { background: #eee8f8; color: #5a2a8a; }
  .invite-summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .invite-counter { font-size: 0.875rem; color: #6b6058; }
  .btn-manage-invites { background: none; border: 1px solid #cfc3b0; color: #b05525; padding: 0.375rem 0.875rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-manage-invites:hover { border-color: #b05525; background: #fdf2ee; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(26, 21, 16, 0.45); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .modal { background: #f8f2e8; border: 1px solid #cfc3b0; border-radius: 16px; width: 100%; max-width: 560px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #e0d4c4; flex-shrink: 0; }
  .modal-header h3 { margin: 0; font-size: 1.1rem; color: #1a1510; }
  .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #6b6058; cursor: pointer; padding: 0.1rem 0.25rem; }
  .modal-close:hover { color: #1a1510; }
  .modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0; }
  .generate-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .generate-input { flex: 1; min-width: 160px; padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .btn-generate { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-generate:hover:not(:disabled) { background: #924418; }
  .btn-generate:disabled { opacity: 0.6; }
  .invite-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .invite-row { background: #ede8e0; border: 1px solid #cfc3b0; border-radius: 8px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .invite-info { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .invite-label { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .invite-status { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 4px; }
  .invite-status.available { background: #e8f4e4; color: #2a5e28; }
  .invite-status.claimed { background: #dde4dd; color: #4e453e; }
  .invite-status.revoked { background: #f8e8e2; color: #7a2a1a; }
  .invite-link-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .invite-lost { margin: 0; font-size: 0.78rem; color: #9a8f86; font-style: italic; }
  .invite-actions { display: flex; gap: 0.5rem; }
  .btn-revoke { background: none; border: 1px solid #f0c8b8; color: #8b3016; padding: 0.25rem 0.625rem; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
  .btn-revoke:hover { background: #fdf2ee; }
</style>
