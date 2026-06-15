<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import QRCode from 'qrcode'

  let { data } = $props<{ data: PageData }>()

  const event = $state({ ...data.event })
  const originalStartsAt = data.event.startsAt
  let saving = $state(false)
  let saveError = $state('')
  let saveSuccess = $state(false)
  let deleting = $state(false)
  let showDeleteModal = $state(false)
  let showCancelModal = $state(false)

  let activeTab = $state('details')

  let editLink = $state('')
  let linkCopied = $state(false)

  let rsvps = $state([...data.rsvps])
  const yesCount = $derived(rsvps.filter(r => r.status === 'yes').length)
  const maybeCount = $derived(rsvps.filter(r => r.status === 'maybe').length)
  let showGuestModal = $state(false)

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
  let showRevokeModal = $state(false)
  let revokeTargetTokenId = $state<string | null>(null)
  let revokeError = $state('')
  let revoking = $state(false)
  const activeInviteTokens = $derived(inviteTokens.filter((t: TokenRow) => t.status === 'active'))
  const claimedInviteCount = $derived(activeInviteTokens.filter((t: TokenRow) => t.claimedBySessionId !== null).length)
  const unclaimedInviteCount = $derived(activeInviteTokens.filter((t: TokenRow) => t.claimedBySessionId === null).length)

  type BlastRow = { id: string; subject: string | null; body: string; createdAt: string }
  let blasts = $state<BlastRow[]>([])
  let blastsLoaded = $state(false)
  let showBlastModal = $state(false)
  let viewingBlast = $state<BlastRow | null>(null)

  let blastSubject = $state('')
  let blastBody = $state('')
  let blastEmail = $state(true)
  let blastSms = $state(false)
  let blastLoading = $state(false)
  let blastError = $state('')

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
    const params = new URLSearchParams(window.location.search)
    const url = window.location.href.replace(/\?.*$/, '')
    editLink = url
    try {
      localStorage.setItem(`haps:editLink:${event.slug}`, url)
    } catch { /* storage disabled */ }

    // Load general token raw value from localStorage (stored at event creation)
    const initialIt = data.initialInviteToken
    if (initialIt && generalTokenId) {
      try {
        localStorage.setItem(`haps:inviteToken:${event.slug}:${generalTokenId}`, initialIt)
      } catch { /* storage disabled */ }
      params.delete('it')
      history.replaceState(null, '', url + (params.toString() ? '?' + params.toString() : ''))
    }
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

    api.listMessages(event.slug).then(res => {
      blasts = res.messages.filter((m: { type: string }) => m.type === 'blast')
      blastsLoaded = true
    }).catch(() => { blastsLoaded = true })
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

  let qrDataUrl = $state<string | null>(null)
  let qrCopied = $state(false)

  $effect(() => {
    if (generalTokenRaw) {
      QRCode.toDataURL(inviteUrl(generalTokenRaw), { width: 240, margin: 2, color: { dark: '#1a1510', light: '#f8f2e8' } })
        .then(url => { qrDataUrl = url })
        .catch(() => {})
    } else {
      qrDataUrl = null
    }
  })

  async function copyQrCode() {
    if (!qrDataUrl) return
    try {
      const res = await fetch(qrDataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      qrCopied = true
      setTimeout(() => { qrCopied = false }, 2000)
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
      try { localStorage.setItem(`haps:inviteLink:${event.slug}:${res.token.id}`, inviteUrl(res.rawToken)) } catch { /* storage unavailable */ }
      inviteTokens = [...inviteTokens, { id: res.token.id, type: 'attendee', label: res.token.label, status: 'active', singleUse: true, claimedBySessionId: null, createdAt: new Date().toISOString() }]
      newlyGenerated = [...newlyGenerated, { tokenId: res.token.id, rawToken: res.rawToken }]
      newLinkLabel = ''
    } catch (e: unknown) {
      invitePersonalError = e instanceof ApiError ? e.message : 'Failed to generate invite.'
    } finally {
      generatingPersonalInvite = false
    }
  }

  function openRevokeModal(tokenId: string) {
    revokeTargetTokenId = tokenId
    revokeError = ''
    showRevokeModal = true
  }

  async function confirmRevoke() {
    const tokenId = revokeTargetTokenId
    if (!tokenId) return
    revoking = true
    revokeError = ''
    try {
      await api.deleteToken(event.slug, tokenId, data.editToken)
      inviteTokens = inviteTokens.map(t => t.id === tokenId ? { ...t, status: 'blacklisted' } : t)
      newlyGenerated = newlyGenerated.filter(g => g.tokenId !== tokenId)
      directoryLoaded = false
      showRevokeModal = false
      revokeTargetTokenId = null
    } catch (e: unknown) {
      revokeError = e instanceof ApiError ? e.message : 'Failed to revoke invite.'
    } finally {
      revoking = false
    }
  }

  async function copyPersonalInviteLink(tokenId: string) {
    const link = getInviteLink(tokenId)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      copiedInviteTokenId = tokenId
      setTimeout(() => { copiedInviteTokenId = null }, 2000)
    } catch { /**/ }
  }

  // Directory invite
  type DirectoryContact = { id: string; name: string; email: string | null; phone: string | null; instagramHandle: string | null }
  type InvitedLink = { contactId: string; contactName: string; tokenId: string; inviteLink: string; emailSent: boolean; whatsappUrl: string | null }
  let showDirectoryModal = $state(false)
  let directoryGuests = $state<DirectoryContact[]>([])
  let directoryLoaded = $state(false)
  let directorySearch = $state('')
  let selectedGuestIds = $state(new Set<string>())
  let inviting = $state(false)
  let directoryError = $state('')
  let invitedLinks = $state<InvitedLink[]>([])
  let copiedInviteLinkContactId = $state<string | null>(null)

  let sendEmail = $state(false)
  let sendWhatsapp = $state(false)
  let noChannelWarning = $state(false)

  const selectedEmailCount = $derived(
    [...selectedGuestIds].filter(id => directoryGuests.find(g => g.id === id)?.email).length
  )
  const selectedPhoneCount = $derived(
    [...selectedGuestIds].filter(id => directoryGuests.find(g => g.id === id)?.phone).length
  )

  function getInviteLink(tokenId: string): string | null {
    const gen = newlyGenerated.find(g => g.tokenId === tokenId)
    if (gen) return inviteUrl(gen.rawToken)
    try { return localStorage.getItem(`haps:inviteLink:${event.slug}:${tokenId}`) ?? null } catch { return null }
  }

  const filteredGuests = $derived(
    directoryGuests.filter(g => {
      const q = directorySearch.toLowerCase()
      return !q || g.name.toLowerCase().includes(q) || (g.email?.toLowerCase().includes(q) ?? false)
    })
  )
  const allFilteredSelected = $derived(filteredGuests.length > 0 && filteredGuests.every(g => selectedGuestIds.has(g.id)))

  async function openDirectoryModal() {
    showDirectoryModal = true
    selectedGuestIds = new Set()
    directorySearch = ''
    directoryError = ''
    invitedLinks = []
    noChannelWarning = false
    if (!directoryLoaded) {
      try {
        const res = await api.listDirectory(event.slug, data.editToken)
        directoryGuests = res.contacts
        directoryLoaded = true
      } catch (e: unknown) {
        directoryError = e instanceof ApiError ? e.message : 'Failed to load directory.'
      }
    }
  }

  function toggleGuest(id: string) {
    const next = new Set(selectedGuestIds)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    selectedGuestIds = next
  }

  function toggleAllFiltered() {
    const next = new Set(selectedGuestIds)
    if (allFilteredSelected) filteredGuests.forEach(g => next.delete(g.id))
    else filteredGuests.forEach(g => next.add(g.id))
    selectedGuestIds = next
  }

  async function refreshTokens() {
    try {
      const res = await api.listTokens(event.slug, data.editToken)
      inviteTokens = res.tokens.filter(t => t.type === 'attendee')
    } catch { /* non-critical */ }
  }

  async function copyInviteLink(contactId: string, link: string) {
    try {
      await navigator.clipboard.writeText(link)
      copiedInviteLinkContactId = contactId
      setTimeout(() => { copiedInviteLinkContactId = null }, 2000)
    } catch { /**/ }
  }

  async function sendDirectoryInvites() {
    if (selectedGuestIds.size === 0) return
    noChannelWarning = !sendEmail && !sendWhatsapp
    inviting = true
    directoryError = ''
    try {
      const channels: string[] = []
      if (sendEmail) channels.push('email')
      if (sendWhatsapp) channels.push('whatsapp')
      const res = await api.bulkInvite(event.slug, [...selectedGuestIds], channels, data.editToken)
      for (const inv of res.invitations) {
        try { localStorage.setItem(`haps:inviteLink:${event.slug}:${inv.tokenId}`, inv.inviteLink) } catch { /* */ }
      }
      invitedLinks = res.invitations
      directoryGuests = directoryGuests.filter(g => !selectedGuestIds.has(g.id))
      selectedGuestIds = new Set()
      await refreshTokens()
    } catch (e: unknown) {
      directoryError = e instanceof ApiError ? e.message : 'Failed to send invitations.'
    } finally {
      inviting = false
    }
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
    if (event.startsAt !== originalStartsAt && new Date(event.startsAt) <= new Date()) {
      saveError = 'Event start date must be in the future.'
      saving = false
      return
    }
    try {
      await api.updateEvent(event.slug, {
        title: event.title,
        description: event.description,
        location: event.location,
        coordinates: event.coordinates,
        dressCode: event.dressCode,
        allowPlusOnes: event.allowPlusOnes,
        maxPlusOnes: event.allowPlusOnes ? (event.maxPlusOnes ?? 1) : null,
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? undefined,
        theme: event.theme ?? undefined,
        showGuests: event.showGuests,
        allowComments: event.allowComments,
      }, data.editToken)
      saveSuccess = true
      setTimeout(() => { saveSuccess = false }, 2000)
    } catch (e: unknown) {
      saveError = e instanceof ApiError ? e.message : 'Failed to save.'
    } finally {
      saving = false
    }
  }

  async function deleteEvent() {
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
      rsvps = rsvps.filter(r => r.id !== rsvpId)
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
    try {
      await api.sendBlast(event.slug, { subject: blastSubject, body: blastBody, channels }, data.editToken)
      blasts = [{ id: String(Date.now()), subject: blastSubject || null, body: blastBody, createdAt: new Date().toISOString() }, ...blasts]
      showBlastModal = false
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
  <div class="page-header">
    <div class="header-title">
      <h1>{event.title}</h1>
      {#if event.status !== 'draft'}
        <span class="status-badge status-{event.status}">{event.status}</span>
      {/if}
    </div>
    <a href="/event/{event.slug}" target="_blank" rel="noopener" class="preview-link">Preview →</a>
  </div>

  <div class="tabs">
    <button class="tab-btn" class:active={activeTab === 'details'} onclick={() => activeTab = 'details'}>Details</button>
    <button class="tab-btn" class:active={activeTab === 'activity'} onclick={() => activeTab = 'activity'}>Activity</button>
  </div>

  {#if activeTab === 'details'}
    <div class="cards">
      <section class="card">
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
      </section>

      <section class="card">
        <h2>Edit link</h2>
        <p class="muted">Bookmark this page or share the link below with anyone who needs to co-manage this event.</p>
        <div class="invite-url-row">
          <code class="invite-url">{editLink}</code>
          <button class="copy-btn" onclick={copyLink}>{linkCopied ? 'Copied!' : 'Copy'}</button>
        </div>
      </section>

      <section class="card">
        <h2>Event details</h2>
        {#if saveError}
          <div class="error-banner">{saveError}</div>
        {/if}
        <div class="form">
          <label>Title <input type="text" bind:value={event.title} /></label>
          <label>Description <textarea bind:value={event.description} rows="4"></textarea></label>
          <label>Location <textarea bind:value={event.location} rows="3" placeholder="Address, venue, parking info, transport options…"></textarea></label>
          <label>Coordinates / map link <input type="text" bind:value={event.coordinates} placeholder="Google Maps, Waze link, or lat,lng…" /></label>
          <label>Dress code <input type="text" bind:value={event.dressCode} placeholder="Smart casual, black tie…" /></label>
          <div class="plus-ones-section">
            <label class="checkbox">
              <input type="checkbox" bind:checked={event.allowPlusOnes}
                onchange={() => { if (event.allowPlusOnes && !event.maxPlusOnes) event.maxPlusOnes = 1 }} />
              Allow plus ones
            </label>
            {#if event.allowPlusOnes}
              <label>Max plus ones per guest
                <select bind:value={event.maxPlusOnes}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            {/if}
          </div>
          <label>Starts at <input type="datetime-local" value={event.startsAt?.slice(0, 16)} min={new Date().toISOString().slice(0, 16)} oninput={(e) => { event.startsAt = (e.target as HTMLInputElement).value + ':00Z' }} /></label>
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
          {#if publishError}
            <p class="publish-error">{publishError}</p>
          {/if}
          <div class="form-actions">
            <button onclick={saveEvent} disabled={saving} class="btn-primary" class:btn-saved={saveSuccess}>
              {saving ? 'Saving…' : saveSuccess ? 'Saved ✓' : 'Save changes'}
            </button>
            <button onclick={() => showDeleteModal = true} disabled={deleting} class="btn-danger">Delete</button>
            <button class="btn-publish" onclick={() => updateStatus('published')} disabled={saving || event.status !== 'draft'}>Publish</button>
            {#if event.status === 'published'}
              <button class="btn-cancel-event" onclick={() => showCancelModal = true} disabled={saving}>Cancel event</button>
            {/if}
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Invitations <span class="event-type-badge event-type-{event.eventType}">{event.eventType === 'invite_only' ? 'Invite-only' : 'Open'}</span></h2>
        {#if inviteError}<div class="error-banner">{inviteError}</div>{/if}
        {#if event.eventType === 'invite_only'}
          {#if event.status === 'draft'}
            <p class="draft-lock">Event is in draft — guests will see it after you publish.</p>
          {/if}
          <p class="invite-summary">{activeInviteTokens.length} active · {claimedInviteCount} claimed · {inviteTokens.filter(t => t.status !== 'active').length} revoked</p>
          <div class="invite-btn-group">
            <button class="btn-primary-sm" onclick={openDirectoryModal}>Invite people</button>
            <button class="btn-secondary-sm" onclick={() => showInviteModal = true}>Links →</button>
          </div>
        {:else}
          {#if event.status === 'draft'}
            <p class="draft-lock">Publish the event to share the invite link.</p>
          {:else}
            <div class="open-invite-row">
              <p class="open-invite-desc">Open event — anyone with the link can RSVP.</p>
              {#if generalTokenRaw}
                <button class="copy-btn-sm" onclick={copyGeneralLink}>{generalCopied ? 'Copied!' : 'Copy link'}</button>
              {:else}
                <span class="channel-unavailable">Link unavailable — visit via edit link</span>
              {/if}
            </div>
            {#if qrDataUrl}
              <div class="qr-row">
                <img src={qrDataUrl} alt="QR code for invite link" class="qr-img" />
                <button class="btn-secondary-sm" onclick={copyQrCode}>{qrCopied ? 'Copied!' : 'Copy QR code'}</button>
              </div>
            {/if}
            <div class="open-invite-footer">
              <button class="btn-secondary-sm" onclick={openDirectoryModal}>Invite people</button>
            </div>
          {/if}
        {/if}
      </section>
    </div>
  {/if}

  {#if activeTab === 'activity'}
    <div class="cards">
      <section class="card">
        <div class="card-header">
          <h2>Guests</h2>
          <button class="btn-manage-invites" onclick={() => showGuestModal = true}>Manage →</button>
        </div>
        <p class="invite-counter">
          {#if rsvps.length === 0}
            No RSVPs yet
          {:else}
            {rsvps.length} RSVP{rsvps.length !== 1 ? 's' : ''} · {yesCount} going{maybeCount > 0 ? ` · ${maybeCount} maybe` : ''}
          {/if}
        </p>
      </section>

      <section class="card">
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

      <section class="card">
        <div class="blast-card-header">
          <h2>Updates</h2>
          {#if event.status !== 'draft'}
            <button class="btn-manage-invites" onclick={() => { blastError = ''; showBlastModal = true }}>Send update →</button>
          {/if}
        </div>
        {#if event.status === 'draft'}
          <p class="draft-lock">Publish the event before sending updates to guests.</p>
        {:else if !blastsLoaded}
          <p class="muted">Loading…</p>
        {:else if blasts.length === 0}
          <p class="muted">No updates sent yet.</p>
        {:else}
          <div class="blast-list">
            {#each blasts as blast (blast.id)}
              <button class="blast-row" onclick={() => viewingBlast = blast}>
                <span class="blast-subject">{blast.subject ?? blast.body.slice(0, 80)}</span>
                <span class="blast-date">{new Date(blast.createdAt).toLocaleDateString()}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</main>

{#if showGuestModal}
  <div class="modal-backdrop" onclick={() => showGuestModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage guests">
      <div class="modal-header">
        <h3>Guests ({rsvps.length})</h3>
        <button class="modal-close" onclick={() => showGuestModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if rsvps.length === 0}
          <p class="muted">No RSVPs yet.</p>
        {:else}
          <div class="rsvp-list">
            {#each rsvps as rsvp (rsvp.id)}
              <div class="rsvp-row">
                <div class="rsvp-info">
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
      </div>
    </div>
  </div>
{/if}

{#if showInviteModal}
  <div class="modal-backdrop" onclick={() => showInviteModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage invite links">
      <div class="modal-header">
        <h3>Manage invite links</h3>
        <button class="modal-close" onclick={() => showInviteModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="invite-counter">{activeInviteTokens.length} invited · {claimedInviteCount} visited · {unclaimedInviteCount} pending</p>

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
              {@const inviteLink = getInviteLink(token.id)}
              <div class="invite-row">
                <div class="invite-info">
                  <span class="invite-label">{token.label ?? 'Unnamed'}</span>
                  <span class="invite-status {token.status !== 'active' ? 'revoked' : token.claimedBySessionId ? 'visited' : 'pending'}">
                    {token.status !== 'active' ? 'Revoked' : token.claimedBySessionId ? 'Visited' : 'Pending'}
                  </span>
                </div>
                {#if token.status === 'active' && !token.claimedBySessionId}
                  {#if inviteLink}
                    <div class="invite-link-row">
                      <code class="invite-url">{inviteLink}</code>
                      <button class="copy-btn" onclick={() => copyPersonalInviteLink(token.id)}>
                      {copiedInviteTokenId === token.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {:else}
                    <p class="invite-lost">Link unavailable — re-invite via "Invite people"</p>
                  {/if}
                {/if}
                {#if token.status === 'active' && !token.claimedBySessionId}
                  <div class="invite-actions">
                    <button class="btn-revoke" onclick={() => openRevokeModal(token.id)}>Revoke</button>
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

{#if viewingBlast}
  <div class="modal-backdrop" onclick={() => viewingBlast = null} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="View update">
      <div class="modal-header">
        <h3>{viewingBlast.subject ?? 'Update'}</h3>
        <button class="modal-close" onclick={() => viewingBlast = null} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="blast-full-body">{viewingBlast.body}</p>
        <p class="blast-full-meta">{new Date(viewingBlast.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
    </div>
  </div>
{/if}

{#if showBlastModal}
  <div class="modal-backdrop" onclick={() => showBlastModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send update">
      <div class="modal-header">
        <h3>Send update</h3>
        <button class="modal-close" onclick={() => showBlastModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="muted" style="margin-bottom:1rem">Post a message to the event channel. Optionally deliver it to guests via email or SMS.</p>
        {#if blastError}
          <div class="error-banner">{blastError}</div>
        {/if}
        <div class="form">
          <label>Subject <input type="text" bind:value={blastSubject} placeholder="Event update" /></label>
          <label>Message <textarea bind:value={blastBody} rows="5" placeholder="Write your update…"></textarea></label>
          <div class="checkboxes">
            <label class="checkbox"><input type="checkbox" bind:checked={blastEmail} /> Send via email (to yes RSVPs with email)</label>
            <label class="checkbox"><input type="checkbox" bind:checked={blastSms} /> Send via SMS (Phase 2 — requires Twilio)</label>
          </div>
          <div class="form-actions">
            <button onclick={sendBlast} disabled={blastLoading} class="btn-primary">
              {blastLoading ? 'Sending…' : 'Send'}
            </button>
            <button onclick={() => showBlastModal = false} class="btn-danger">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showDeleteModal}
  <div class="modal-backdrop" onclick={() => showDeleteModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete event">
      <div class="modal-header">
        <h3>Delete event</h3>
        <button class="modal-close" onclick={() => showDeleteModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if event.status === 'published' && rsvps.length > 0}
          <p class="modal-warning">This event is published and has {rsvps.length} RSVP{rsvps.length !== 1 ? 's' : ''}. Consider cancelling it first so guests are notified.</p>
        {:else}
          <p class="modal-text">This cannot be undone.</p>
        {/if}
        <div class="modal-actions">
          <button onclick={() => { showDeleteModal = false; deleteEvent() }} disabled={deleting} class="btn-danger-solid">
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
          <button onclick={() => showDeleteModal = false} class="btn-ghost">Keep event</button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showDirectoryModal}
  <div class="modal-backdrop" onclick={() => showDirectoryModal = false} role="presentation">
    <div class="modal modal-wide" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Invite people">
      <div class="modal-header">
        <h3>Invite people</h3>
        <button class="modal-close" onclick={() => showDirectoryModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body dir-modal-body">
        {#if directoryError}
          <div class="error-banner">{directoryError}</div>
        {/if}
        {#if invitedLinks.length > 0}
          {#if noChannelWarning}
            <div class="info-banner">{invitedLinks.length} link{invitedLinks.length !== 1 ? 's' : ''} generated. No delivery channel selected — copy links below.</div>
          {:else}
            <div class="success-banner">{invitedLinks.length} invitation{invitedLinks.length !== 1 ? 's' : ''} sent.</div>
          {/if}
          <div class="invited-links-list">
            {#each invitedLinks as inv (inv.contactId)}
              <div class="invited-link-row">
                <div class="invited-link-header">
                  <span class="dir-name">{inv.contactName}</span>
                  {#if inv.emailSent}<span class="delivery-badge">Email sent</span>{/if}
                </div>
                <div class="invite-link-row">
                  <code class="invite-url">{inv.inviteLink}</code>
                  <button class="copy-btn" onclick={() => copyInviteLink(inv.contactId, inv.inviteLink)}>
                    {copiedInviteLinkContactId === inv.contactId ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {#if inv.whatsappUrl}
                  <a href={inv.whatsappUrl} target="_blank" rel="noopener noreferrer" class="btn-whatsapp">Open WhatsApp</a>
                {/if}
              </div>
            {/each}
          </div>
          <div class="dir-footer">
            <button class="btn-ghost" onclick={() => { invitedLinks = []; showDirectoryModal = false }}>Done</button>
          </div>
        {:else if !directoryLoaded}
          <p class="muted">Loading…</p>
        {:else if directoryGuests.length === 0}
          <p class="muted">No contacts available — either the directory is empty, or everyone has already been invited.</p>
        {:else}
          <div class="dir-search-row">
            <input type="text" bind:value={directorySearch} placeholder="Search by name or email…" class="dir-search" />
            {#if filteredGuests.length > 0}
              <label class="checkbox dir-select-all">
                <input type="checkbox" checked={allFilteredSelected} onchange={toggleAllFiltered} />
                {allFilteredSelected ? 'Deselect all' : 'Select all'}
              </label>
            {/if}
          </div>
          {#if filteredGuests.length === 0}
            <p class="muted">No contacts match your search.</p>
          {:else}
            <div class="dir-list">
              {#each filteredGuests as guest (guest.id)}
                <label class="dir-row">
                  <input type="checkbox" checked={selectedGuestIds.has(guest.id)} onchange={() => toggleGuest(guest.id)} />
                  <div class="dir-info">
                    <span class="dir-name">{guest.name}</span>
                    {#if guest.email}<span class="dir-meta">{guest.email}</span>{/if}
                  </div>
                </label>
              {/each}
            </div>
          {/if}
          <div class="channel-section">
            <p class="channel-section-label">Delivery channels</p>
            <label class="checkbox">
              <input type="checkbox" bind:checked={sendEmail} />
              Email
              {#if selectedGuestIds.size > 0}
                <span class="channel-count">({selectedEmailCount} of {selectedGuestIds.size} have email)</span>
              {/if}
            </label>
            <label class="checkbox">
              <input type="checkbox" bind:checked={sendWhatsapp} />
              WhatsApp
              {#if selectedGuestIds.size > 0}
                <span class="channel-count">({selectedPhoneCount} of {selectedGuestIds.size} have phone)</span>
              {/if}
            </label>
            <label class="checkbox checkbox-disabled">
              <input type="checkbox" disabled />
              In-app <span class="phase-badge-sm">Phase 2</span>
            </label>
          </div>
          <div class="dir-footer">
            <button class="btn-primary" onclick={sendDirectoryInvites} disabled={selectedGuestIds.size === 0 || inviting}>
              {inviting ? 'Sending…' : selectedGuestIds.size > 0 ? `Invite ${selectedGuestIds.size}` : 'Select contacts'}
            </button>
            <button class="btn-ghost" onclick={() => showDirectoryModal = false}>Cancel</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showCancelModal}
  <div class="modal-backdrop" onclick={() => showCancelModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Cancel event">
      <div class="modal-header">
        <h3>Cancel event</h3>
        <button class="modal-close" onclick={() => showCancelModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-text">Guests will see a cancellation notice on the event page.</p>
        <div class="modal-actions">
          <button onclick={() => { showCancelModal = false; updateStatus('cancelled') }} disabled={saving} class="btn-cancel-confirm">
            Yes, cancel event
          </button>
          <button onclick={() => showCancelModal = false} class="btn-ghost">Keep published</button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showRevokeModal}
  {@const revokeTargetLabel = inviteTokens.find(t => t.id === revokeTargetTokenId)?.label ?? null}
  <div class="modal-backdrop" onclick={() => showRevokeModal = false} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Revoke invite link">
      <div class="modal-header">
        <h3>Revoke invite link</h3>
        <button class="modal-close" onclick={() => showRevokeModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if revokeError}
          <div class="error-banner">{revokeError}</div>
        {/if}
        <p class="modal-text">The invite link{revokeTargetLabel ? ` for "${revokeTargetLabel}"` : ''} will no longer work. This cannot be undone.</p>
        <div class="modal-actions">
          <button onclick={confirmRevoke} disabled={revoking} class="btn-danger-solid">
            {revoking ? 'Revoking…' : 'Revoke link'}
          </button>
          <button onclick={() => showRevokeModal = false} class="btn-ghost">Keep active</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .edit-page { max-width: 800px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }

  .page-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
  .header-title { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 1.5rem; color: #1a1510; }
  .preview-link { font-size: 0.875rem; color: #b05525; text-decoration: none; white-space: nowrap; }
  .preview-link:hover { text-decoration: underline; }

  .tabs { display: flex; border-bottom: 2px solid #cfc3b0; margin-bottom: 1.25rem; }
  .tab-btn { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; padding: 0.625rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: #6b6058; cursor: pointer; font-family: inherit; }
  .tab-btn:hover { color: #1a1510; }
  .tab-btn.active { color: #b05525; border-bottom-color: #b05525; }

  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
  .card-header h2 { margin: 0; }

  h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }

  .cover-preview { width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px; display: block; margin-bottom: 0.75rem; }
  .cover-placeholder { background: #e8ddd0; border: 1px dashed #c8bdb0; border-radius: 8px; height: 120px; display: flex; align-items: center; justify-content: center; color: #9a8f86; font-size: 0.875rem; margin-bottom: 0.75rem; }
  .cover-upload-btn { display: inline-block; background: #b05525; color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .cover-upload-btn:hover { background: #924418; }

  .copy-btn { flex-shrink: 0; background: #c4962d; color: #fff; border: none; padding: 0.4rem 0.875rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .copy-btn:hover { background: #a87c22; }

  .status-badge { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.25rem 0.625rem; border-radius: 4px; background: #ede8e0; color: #4e453e; align-self: center; }
  .status-badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .status-badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  .publish-error { margin: 0; font-size: 0.8rem; color: #8b3016; }
  .modal-warning { margin: 0 0 0.75rem; font-size: 0.875rem; color: #8b3016; background: #fdf2ee; border: 1px solid #f0c8b8; border-radius: 6px; padding: 0.625rem 0.875rem; }
  .modal-text { margin: 0 0 0.75rem; font-size: 0.875rem; color: #3d352e; }
  .modal-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }
  .btn-danger-solid { background: #8b3016; color: #fff; border: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-danger-solid:hover:not(:disabled) { background: #6e2510; }
  .btn-danger-solid:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-cancel-confirm { background: none; border: 1px solid #f0c8b8; color: #8b3016; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-cancel-confirm:hover:not(:disabled) { background: #fdf2ee; }
  .btn-cancel-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-ghost { background: none; border: none; color: #6b6058; font-size: 0.9rem; font-weight: 500; cursor: pointer; padding: 0.625rem 0.75rem; }
  .btn-ghost:hover { color: #1a1510; }
  .btn-publish { background: #2a5e28; color: #fff; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-publish:hover:not(:disabled) { background: #1f4a1e; }
  .btn-publish:disabled { opacity: 0.6; }
  .btn-cancel-event { background: none; border: 1px solid #f0c8b8; color: #8b3016; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-cancel-event:hover:not(:disabled) { background: #fdf2ee; }
  .draft-lock { margin: 0; font-size: 0.875rem; color: #9a8f86; font-style: italic; }
  .invite-summary { margin: 0 0 0.75rem; font-size: 0.875rem; color: #6b6058; }
  .btn-primary-sm { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-primary-sm:hover { background: #924418; }
  .btn-secondary-sm { background: none; border: 1px solid #c8bdb0; color: #4e453e; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-secondary-sm:hover { background: #e8ddd0; }
  .channel-section { border-top: 1px solid #e8ddd0; margin-top: 1rem; padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .channel-section-label { margin: 0 0 0.25rem; font-size: 0.8rem; font-weight: 600; color: #6b6058; text-transform: uppercase; letter-spacing: 0.04em; }
  .channel-count { font-size: 0.8rem; color: #9a8f86; margin-left: 0.25rem; }
  .checkbox-disabled { opacity: 0.5; cursor: not-allowed; }
  .phase-badge-sm { font-size: 0.7rem; font-weight: 700; background: #e8ddd0; color: #9a8f86; padding: 0.1rem 0.4rem; border-radius: 3px; margin-left: 0.25rem; }
  .info-banner { background: #f0e8da; border: 1px solid #c8bdb0; border-radius: 6px; padding: 0.625rem 0.875rem; font-size: 0.875rem; color: #4e453e; margin-bottom: 0.75rem; }
  .invited-link-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
  .delivery-badge { font-size: 0.75rem; font-weight: 600; background: #e8f4e4; color: #2a5e28; padding: 0.15rem 0.5rem; border-radius: 4px; }
  .btn-whatsapp { display: inline-block; background: #25d366; color: #fff; text-decoration: none; font-size: 0.8rem; font-weight: 600; padding: 0.35rem 0.75rem; border-radius: 6px; margin-top: 0.25rem; }
  .btn-whatsapp:hover { background: #1dae53; }

  .channel-list { display: flex; flex-direction: column; }
  .channel-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #e8ddd0; flex-wrap: wrap; }
  .channel-row:first-child { padding-top: 0; }
  .channel-row:last-child { border-bottom: none; padding-bottom: 0; }
  .channel-row-soon { opacity: 0.55; }
  .channel-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .channel-name { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .channel-desc { font-size: 0.8rem; color: #6b6058; }
  .channel-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
  .channel-unavailable { font-size: 0.78rem; color: #9a8f86; font-style: italic; }
  .open-invite-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
  .open-invite-desc { margin: 0; font-size: 0.875rem; color: #4e453e; }
  .copy-btn-sm { flex-shrink: 0; background: #c4962d; color: #fff; border: none; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .copy-btn-sm:hover { background: #a87c22; }
  .qr-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-top: 0.875rem; }
  .qr-img { width: 120px; height: 120px; border-radius: 8px; border: 1px solid #e0d4c4; flex-shrink: 0; }
  .open-invite-footer { margin-top: 0.875rem; display: flex; justify-content: flex-end; }
  .invite-counter-sm { font-size: 0.78rem; color: #6b6058; }
  .phase-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #9a8f86; border: 1px solid #d8d0c8; white-space: nowrap; }

  .form { display: flex; flex-direction: column; gap: 0.75rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  label.checkbox { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
  .checkboxes { display: flex; flex-direction: column; gap: 0.5rem; }
  .plus-ones-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .invite-btn-group { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .modal-wide { max-width: 640px; }
  .dir-modal-body { gap: 0; }
  .success-banner { background: #e8f4e4; color: #2a5e28; border: 1px solid #9cbb9c; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .dir-search-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .dir-search { flex: 1; min-width: 160px; padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #fff; color: #1a1510; }
  .dir-search:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .dir-select-all { flex-direction: row; align-items: center; gap: 0.375rem; font-size: 0.8rem; font-weight: 400; white-space: nowrap; color: #3d352e; }
  .dir-list { display: flex; flex-direction: column; gap: 0.375rem; max-height: 340px; overflow-y: auto; margin-bottom: 1rem; }
  .dir-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; background: #ede8e0; border: 1px solid #cfc3b0; border-radius: 8px; cursor: pointer; font-weight: normal; }
  .dir-row:has(input:checked) { background: #e4f0e0; border-color: #9cbb9c; }
  .dir-row input[type="checkbox"] { flex-shrink: 0; }
  .dir-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .dir-name { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .dir-meta { font-size: 0.775rem; color: #6b6058; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dir-count { font-size: 0.75rem; color: #9a8f86; white-space: nowrap; flex-shrink: 0; }
  .dir-footer { display: flex; gap: 0.75rem; align-items: center; border-top: 1px solid #e0d4c4; padding-top: 1rem; margin-top: 0.25rem; }
  input, textarea, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus, select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; }
  .btn-primary.btn-saved { background: #2a5e28; }
  .btn-danger { background: #f0e8da; color: #8b3016; border: 1px solid #f0c8b8; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #fdf2ee; }
  .btn-danger:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }

  .invite-summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .invite-counter { font-size: 0.875rem; color: #6b6058; margin: 0; }
  .btn-manage-invites { background: none; border: 1px solid #cfc3b0; color: #b05525; padding: 0.375rem 0.875rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-manage-invites:hover { border-color: #b05525; background: #fdf2ee; }

  .rsvp-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .rsvp-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.75rem; background: #e8ddd0; border-radius: 8px; border: 1px solid #cfc3b0; gap: 0.5rem; }
  .rsvp-info { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
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

  .blast-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .blast-card-header h2 { margin: 0; }
  .blast-list { display: flex; flex-direction: column; gap: 0.375rem; }
  .blast-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 0.625rem 0.75rem; background: #e8ddd0; border: 1px solid #cfc3b0; border-radius: 8px; cursor: pointer; text-align: left; font-family: inherit; width: 100%; }
  .blast-row:hover { background: #dfd4c4; }
  .blast-subject { font-size: 0.875rem; font-weight: 500; color: #1a1510; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .blast-date { font-size: 0.75rem; color: #9a8f86; flex-shrink: 0; }
  .blast-full-body { white-space: pre-wrap; font-size: 0.9rem; color: #3d352e; line-height: 1.6; margin: 0 0 1rem; }
  .blast-full-meta { font-size: 0.8rem; color: #9a8f86; margin: 0; }

  .invite-url-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .invite-url { font-size: 0.75rem; color: #3d2c08; background: #fff8e8; padding: 0.3rem 0.5rem; border-radius: 6px; border: 1px solid #e0c870; word-break: break-all; flex: 1; min-width: 0; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  .event-type-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 4px; vertical-align: middle; margin-left: 0.5rem; }
  .event-type-open { background: #e8f4e4; color: #2a5e28; }
  .event-type-invite_only { background: #eee8f8; color: #5a2a8a; }

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

  .invited-links-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
  .invited-link-row { background: #ede8e0; border: 1px solid #cfc3b0; border-radius: 8px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
</style>
