<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll, goto } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  let editingRsvp = $state(!data.myRsvp)
  let rsvpStatus = $state(data.myRsvp?.status ?? '')
  let rsvpName = $state(data.lockedIdentity?.displayName ?? data.myRsvp?.displayName ?? '')
  let rsvpEmail = $state(data.lockedIdentity?.email ?? '')
  let rsvpNote = $state(data.myRsvp?.note ?? '')
  let rsvpHeadCount = $state(
    data.event.allowPlusOnes
      ? Math.min(data.myRsvp?.headCount ?? 1, (data.event.maxPlusOnes ?? 1) + 1)
      : 1
  )
  let rsvpLoading = $state(false)
  let rsvpError = $state('')

  // Profile gate — shown lazily when RSVP returns 428 PROFILE_REQUIRED
  let profileName = $state('')
  let profileEmail = $state('')
  let profilePhone = $state('')
  let profileInstagram = $state('')
  let profileLoading = $state(false)
  let profileError = $state('')
  let profileRequired = $state(false)

  type PendingRsvp = { displayName: string; status: string; headCount: number; note: string; email: string }
  let pendingRsvp = $state<PendingRsvp | null>(null)

  async function submitProfile() {
    if (!profileName || !profileEmail) { profileError = 'Name and email are required.'; return }
    profileLoading = true
    profileError = ''
    try {
      await api.submitProfile({
        displayName: profileName,
        email: profileEmail,
        phone: profilePhone || undefined,
        instagramHandle: profileInstagram || undefined,
      })
      profileRequired = false
      if (pendingRsvp) {
        const p = pendingRsvp
        pendingRsvp = null
        rsvpName = p.displayName
        rsvpStatus = p.status
        rsvpHeadCount = p.headCount
        rsvpNote = p.note
        rsvpEmail = p.email
        await submitRsvp()
      } else {
        await invalidateAll()
      }
    } catch (e: unknown) {
      profileError = e instanceof ApiError ? e.message : 'Failed to save profile.'
    } finally {
      profileLoading = false
    }
  }

  import type { Post } from '@haps/shared'

  // Wall
  let posts = $state<Post[]>([])
  let postsLoaded = $state(false)
  let postBody = $state('')
  let postFiles = $state<FileList | null>(null)
  let postLoading = $state(false)
  let postError = $state('')

  type LightboxPhoto = { id: string; url: string; caption?: string | null; uploaderName: string; isOwn?: boolean }
  let lightboxPhoto = $state<LightboxPhoto | null>(null)

  type GuestProfile = { avatarUrl: string | null; bio: string | null; vibe: string | null }
  type GuestRow = { id: string; displayName: string; status: string; headCount: number; isHost?: boolean; guestId?: string | null; profile: GuestProfile | null }
  let guestList = $state<GuestRow[]>([])
  let guestListLoaded = $state(false)
  let guestListExpanded = $state(false)

  // Profile modal
  let profileModal = $state<{ name: string; guestId: string; profile: GuestProfile | null } | null>(null)

  // Signal state (per open modal)
  let signalSent = $state<'wink' | 'crush' | null>(null)
  let signalLoading = $state(false)
  let signalError = $state('')
  let signalMutual = $state(false)

  // DM state (per open modal)
  type DmMessage = { id: string; fromMe: boolean; body: string; createdAt: string }
  let dmOpen = $state(false)
  let dmMessages = $state<DmMessage[]>([])
  let dmInput = $state('')
  let dmLoading = $state(false)
  let dmSending = $state(false)
  let dmError = $state('')
  let dmBlocked = $state(false)

  // Current viewer's guestId (for sending signals)
  const currentGuestId = $derived(
    data.user?.type === 'guest' ? data.user.id :
    data.session?.guestId ?? null
  )

  const event = $derived(data.event)
  const rsvpDeadlinePassed = $derived(!!event.rsvpDeadline && new Date() > new Date(event.rsvpDeadline))
  const hasQualifyingRsvp = $derived(data.myRsvp?.status === 'yes' || data.myRsvp?.status === 'maybe')

  function formatDeadline(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const THEMES: Record<string, Record<string, string>> = {
    forest: {
      '--accent': '#2d6e30', '--accent-hover': '#1f5022',
      '--card-bg': '#e4efe0', '--border': '#9cbb9c', '--card-inner': '#d4e8d4',
      '--page-bg': '#f2f7f0',
    },
    ocean: {
      '--accent': '#1a5fa8', '--accent-hover': '#124480',
      '--card-bg': '#dce8f6', '--border': '#9cb8d8', '--card-inner': '#ccdaf0',
      '--page-bg': '#f0f4fa',
    },
    sunset: {
      '--accent': '#c03828', '--accent-hover': '#9e2820',
      '--card-bg': '#f4ddd8', '--border': '#d8a898', '--card-inner': '#ecd0c8',
      '--page-bg': '#faf0ed',
    },
  }

  function themeStyle(theme: string | null | undefined): string {
    const vars = THEMES[theme ?? ''] ?? {}
    return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ')
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  async function submitRsvp() {
    if (!rsvpStatus) { rsvpError = 'RSVP status is required.'; return }
    // For anonymous users, name and email are required
    if (!data.user && (!rsvpName || !rsvpEmail)) { rsvpError = 'Name and email are required.'; return }
    rsvpLoading = true
    rsvpError = ''
    try {
      // Logged-in users don't need to send displayName/email (derived from their contact)
      const rsvpPayload = data.user
        ? { status: rsvpStatus, headCount: rsvpHeadCount, note: rsvpNote || undefined }
        : { displayName: rsvpName, status: rsvpStatus, headCount: rsvpHeadCount, note: rsvpNote || undefined, email: rsvpEmail }
      await api.submitRsvp(event.slug, rsvpPayload)
      goto('/my-events')
    } catch (e: unknown) {
      if (e instanceof ApiError && e.statusCode === 428) {
        if (rsvpName && rsvpEmail) {
          // Name and email already provided — save profile silently and retry.
          try {
            await api.submitProfile({ displayName: rsvpName, email: rsvpEmail })
            await api.submitRsvp(event.slug, {
              displayName: rsvpName,
              status: rsvpStatus,
              headCount: rsvpHeadCount,
              note: rsvpNote || undefined,
              email: rsvpEmail,
            })
            goto('/my-events')
          } catch (e2: unknown) {
            rsvpError = e2 instanceof ApiError ? e2.message : 'Failed to submit RSVP.'
          }
          return
        }
        // Email not provided — show profile gate so they can enter it.
        pendingRsvp = { displayName: rsvpName, status: rsvpStatus, headCount: rsvpHeadCount, note: rsvpNote, email: rsvpEmail }
        profileName = rsvpName
        profileEmail = rsvpEmail
        profileRequired = true
        rsvpError = ''
        return
      }
      rsvpError = e instanceof ApiError ? e.message : 'Failed to submit RSVP.'
    } finally {
      rsvpLoading = false
    }
  }

  async function loadPosts() {
    if (postsLoaded) return
    try {
      const res = await api.listPosts(event.slug)
      posts = res.posts
      postsLoaded = true
    } catch { /**/ }
  }

  async function submitPost() {
    if (!postBody.trim() && (!postFiles || postFiles.length === 0)) {
      postError = 'Add some text or at least one photo.'
      return
    }
    postLoading = true
    postError = ''
    try {
      const fd = new FormData()
      if (postBody.trim()) fd.append('body', postBody.trim())
      if (postFiles) {
        for (const file of postFiles) fd.append('photos', file)
      }
      const res = await api.createPost(event.slug, fd)
      posts = [...posts, res.post]
      postBody = ''
      postFiles = null
    } catch (e: unknown) {
      postError = e instanceof ApiError ? e.message : 'Failed to post.'
    } finally {
      postLoading = false
    }
  }

  async function deletePost(postId: string) {
    if (!confirm('Delete this post?')) return
    try {
      await api.deletePost(event.slug, postId)
      posts = posts.filter((p) => p.id !== postId)
    } catch { /**/ }
  }

  async function deletePhoto(photoId: string) {
    if (!confirm('Remove this photo?')) return
    try {
      await api.deletePhoto(event.slug, photoId)
      posts = posts.map(p => ({ ...p, photos: p.photos.filter(ph => ph.id !== photoId) }))
      lightboxPhoto = null
    } catch { /**/ }
  }

  async function sendSignal(type: 'wink' | 'crush') {
    if (!profileModal?.guestId) return
    signalLoading = true
    signalError = ''
    try {
      const res = await api.sendSignal(event.slug, { toGuestId: profileModal.guestId, type })
      signalSent = type
      signalMutual = res.signal.mutualReveal
    } catch (e: unknown) {
      signalError = e instanceof ApiError ? e.message : 'Failed to send.'
    } finally {
      signalLoading = false
    }
  }

  function openProfileModal(guest: GuestRow) {
    if (!guest.guestId) return
    profileModal = { name: guest.displayName, guestId: guest.guestId, profile: guest.profile }
    signalSent = null
    signalError = ''
    signalMutual = false
    dmOpen = false
    dmMessages = []
    dmInput = ''
    dmError = ''
    dmBlocked = false
  }

  async function openDmThread() {
    if (!profileModal?.guestId) return
    dmOpen = true
    dmLoading = true
    dmError = ''
    try {
      const res = await api.getDmThread(event.slug, profileModal.guestId)
      dmMessages = res.messages
      dmBlocked = res.blocked
    } catch (e: unknown) {
      dmError = e instanceof ApiError ? e.message : 'Failed to load messages.'
    } finally {
      dmLoading = false
    }
  }

  async function sendDm() {
    if (!profileModal?.guestId || !dmInput.trim()) return
    dmSending = true
    dmError = ''
    const text = dmInput.trim()
    dmInput = ''
    try {
      const res = await api.sendDm(event.slug, { toGuestId: profileModal.guestId, body: text })
      dmMessages = [...dmMessages, { id: res.message.id, fromMe: true, body: res.message.body, createdAt: res.message.createdAt }]
    } catch (e: unknown) {
      dmError = e instanceof ApiError ? e.message : 'Failed to send.'
      dmInput = text
    } finally {
      dmSending = false
    }
  }

  async function blockGuest() {
    if (!profileModal?.guestId) return
    try {
      await api.blockGuest(event.slug, profileModal.guestId)
      dmBlocked = true
    } catch { /* non-critical */ }
  }

  $effect(() => {
    if (event.showAlbum && (!event.wallRequiresRsvp || hasQualifyingRsvp)) { loadPosts() }
    if (event.showGuests && (!event.guestsRequireRsvp || hasQualifyingRsvp) && !guestListLoaded) {
      api.listRsvps(event.slug).then(res => {
        guestList = res.rsvps
        guestListLoaded = true
      }).catch(() => { guestListLoaded = true })
    }
  })
</script>

<svelte:head>
  <title>{data.meta.title} — Haps</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta.title} />
  <meta property="og:description" content={data.meta.description} />
  <meta property="og:image" content={data.meta.image} />
  <meta property="og:url" content={data.meta.url} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="event-page" data-theme={event.theme ?? 'default'} style={themeStyle(event.theme)}>
  {#if data.user?.type === 'guest' || data.lockedIdentity}
    <div class="back-nav">
      <a href="/my-events" class="back-link">← My events</a>
    </div>
  {/if}

  {#if event.coverImageUrl}
    <div class="cover" style="background-image: url({event.coverImageUrl})"></div>
  {/if}

  <div class="content">
    <div class="event-header">
      {#if event.eventType === 'invite_only'}
        <div class="header-badges">
          <span class="type-badge type-invite_only">Invite-Only</span>
        </div>
      {/if}
      <h1>{event.title}</h1>
      {#if event.organizerName}
        <p class="organizer-name">Hosted by {event.organizerName}</p>
      {/if}

      <div class="event-meta">
        <div class="meta-item">
          📅 {formatDate(event.startsAt)} at {formatTime(event.startsAt)}
          {#if event.endsAt} – {formatTime(event.endsAt)}{/if}
        </div>
        {#if event.location}
          <div class="meta-item">📍 {event.location}</div>
        {/if}
        {#if event.showGuests || data.isEditor}
          <div class="meta-item">
            {event.yesCount} going · {event.maybeCount} maybe{event.waitlistCount > 0 ? ` · ${event.waitlistCount} waitlisted` : ''}
            {#if event.maxCapacity} · {event.maxCapacity} capacity{/if}
          </div>
        {/if}
      </div>

      <div class="cal-links">
        <a href="/api/events/{event.slug}/ics" class="cal-link">📆 Download .ics</a>
        <a
          href="https://calendar.google.com/calendar/render?action=TEMPLATE&text={encodeURIComponent(event.title)}&dates={new Date(event.startsAt).toISOString().replace(/[-:]/g,'').replace('.000','')}/{new Date(event.endsAt ?? event.startsAt).toISOString().replace(/[-:]/g,'').replace('.000','')}&details={encodeURIComponent(event.description ?? '')}&location={encodeURIComponent(event.location ?? '')}"
          target="_blank"
          rel="noopener"
          class="cal-link"
        >🗓 Add to Google Calendar</a>
        {#if event.showAlbum}
          <a href="/event/{event.slug}/album" class="cal-link">📷 Photo album</a>
        {/if}
      </div>
    </div>

    {#if event.description}
      <div class="description">
        <p>{event.description}</p>
      </div>
    {/if}

    {#if event.status === 'cancelled'}
      <div class="cancelled-banner">
        This event has been cancelled.
      </div>
    {/if}

    {#if data.isEditor}
      <div class="editor-banner">
        You are the host. <a href="/event/{event.slug}/edit">Manage event →</a>
      </div>
    {/if}

    <!-- RSVP section -->
    {#if event.status === 'published'}
      {#if data.myRsvp && !editingRsvp}
        {#if data.myRsvp.status === 'waitlist'}
          <div class="waitlist-banner">
            <strong>You're on the waitlist.</strong>
            <p>We'll notify you if a spot opens up.</p>
          </div>
        {/if}
        <div class="rsvp-confirmed">
          <span class="rsvp-confirmed-status rsvp-chip-{data.myRsvp.status}">
            {data.myRsvp.status === 'yes' ? 'Going' : data.myRsvp.status === 'maybe' ? 'Maybe' : data.myRsvp.status === 'waitlist' ? 'Waitlisted' : "Can't go"}{#if data.myRsvp.headCount > 1} · +{data.myRsvp.headCount - 1}{/if}
          </span>
          <span class="rsvp-confirmed-sep">·</span>
          <span class="rsvp-confirmed-name">{data.myRsvp.displayName}</span>
          {#if !rsvpDeadlinePassed}
            <button class="rsvp-confirmed-change" onclick={() => { editingRsvp = true; rsvpError = '' }}>
              {data.myRsvp.status === 'waitlist' ? 'Cancel / change' : 'Change RSVP'}
            </button>
          {/if}
        </div>
      {:else}
        <section class="section">
          <h2>RSVP</h2>

          {#if event.rsvpDeadline && !rsvpDeadlinePassed}
            <p class="deadline-notice">RSVP closes {formatDeadline(event.rsvpDeadline)}</p>
          {/if}

          {#if rsvpDeadlinePassed}
            <div class="deadline-closed">
              <strong>RSVP is closed.</strong>
              <p>The deadline was {formatDeadline(event.rsvpDeadline!)}.</p>
            </div>
          {:else if data.inviteAlreadyUsed}
            <div class="invite-used-banner">
              <strong>This invite link has already been used.</strong>
              <p>Contact the host for a new invite link.</p>
            </div>
          {:else if data.sessionBlocked}
            <div class="blocked-banner">
              <strong>You have been blocked from RSVPing.</strong>
              {#if data.sessionBlockReason}
                <p>{data.sessionBlockReason}</p>
              {/if}
            </div>
          {:else if profileRequired}
            <p class="profile-intro">Please introduce yourself before RSVPing.</p>
            {#if profileError}
              <div class="error-banner">{profileError}</div>
            {/if}
            <div class="rsvp-form">
              <label>
                Full name <span class="req">*</span>
                <input type="text" bind:value={profileName} placeholder="Your name" />
              </label>
              <label>
                Email <span class="req">*</span>
                <input type="email" bind:value={profileEmail} placeholder="you@example.com" />
              </label>
              <label>
                Phone (optional)
                <input type="tel" bind:value={profilePhone} placeholder="+1 555 000 0000" />
              </label>
              <label>
                Instagram (optional)
                <input type="text" bind:value={profileInstagram} placeholder="@handle" />
              </label>
              <button class="submit-btn" onclick={submitProfile} disabled={profileLoading}>
                {profileLoading ? 'Saving…' : 'Continue to RSVP'}
              </button>
            </div>
          {:else}
            {#if rsvpError}
              <div class="error-banner">{rsvpError}</div>
            {/if}

            {#if data.user && !data.lockedIdentity?.displayName}
              <div class="no-identity-banner">
                You need to set up a guest identity before RSVPing.
                <a href="/account">Go to account settings →</a>
              </div>
            {:else}
              <div class="rsvp-form">
                {#if data.user}
                  <div class="locked-field">
                    <span class="locked-label">Your name</span>
                    <span class="locked-value">{data.lockedIdentity?.displayName}</span>
                  </div>
                {:else if data.lockedIdentity?.displayName}
                  <div class="locked-field">
                    <span class="locked-label">Your name</span>
                    <span class="locked-value">{data.lockedIdentity.displayName}</span>
                  </div>
                {:else}
                  <label>
                    Your name <span class="req">*</span>
                    <input type="text" bind:value={rsvpName} placeholder="Name" required />
                  </label>
                {/if}
                <div class="rsvp-buttons">
                  {#each ['yes', 'maybe', 'no'] as status}
                    <button
                      class="rsvp-btn rsvp-{status}"
                      class:active={rsvpStatus === status}
                      onclick={() => rsvpStatus = status}
                    >
                      {status === 'yes' ? '✓ Going' : status === 'maybe' ? '? Maybe' : '✗ Can\'t go'}
                    </button>
                  {/each}
                </div>
                {#if event.allowPlusOnes}
                  <label>
                    Plus ones
                    <select bind:value={rsvpHeadCount}>
                      {#each Array.from({ length: (event.maxPlusOnes ?? 1) + 1 }, (_, i) => i) as n}
                        <option value={n + 1}>{n === 0 ? 'None' : n === 1 ? '1 plus one' : `${n} plus ones`}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
                <label>
                  Note (optional)
                  <input type="text" bind:value={rsvpNote} placeholder="Any notes…" />
                </label>
                {#if data.user}
                  <div class="locked-field">
                    <span class="locked-label">Email</span>
                    <span class="locked-value">{data.lockedIdentity?.email}</span>
                  </div>
                {:else if data.lockedIdentity?.email}
                  <div class="locked-field">
                    <span class="locked-label">Email</span>
                    <span class="locked-value">{data.lockedIdentity.email}</span>
                  </div>
                {:else}
                  <label>
                    Email <span class="req">*</span>
                    <input type="email" bind:value={rsvpEmail} placeholder="you@example.com" required />
                  </label>
                {/if}
                <div class="rsvp-actions">
                  <button class="submit-btn" onclick={submitRsvp} disabled={rsvpLoading || (data.user && !data.lockedIdentity?.displayName)}>
                    {rsvpLoading ? 'Saving…' : data.myRsvp ? 'Update RSVP' : 'Submit RSVP'}
                  </button>
                  {#if data.myRsvp}
                    <button class="cancel-btn" onclick={() => { editingRsvp = false; rsvpError = '' }}>
                      Cancel
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    {/if}

    <!-- Guest list -->
    {#if event.showGuests}
      {#if event.guestsRequireRsvp && !hasQualifyingRsvp && !data.isEditor}
        <div class="rsvp-gate-notice">
          RSVP to see who's coming and other event details.
        </div>
      {:else}
      <section class="section">
        <div class="guest-list-header">
          <h2>
            Guests — {event.yesCount} going
            {#if event.maxCapacity && event.maxCapacity > event.yesCount}
              ({event.maxCapacity - event.yesCount} spots left)
            {/if}
          </h2>
          {#if event.yesCount > 0}
            <button class="expand-toggle" onclick={() => guestListExpanded = !guestListExpanded}>
              {guestListExpanded ? 'Hide' : 'Show'}
            </button>
          {/if}
        </div>
        {#if guestListExpanded}
          {#if guestListLoaded && guestList.filter(r => r.status === 'yes').length > 0}
            <div class="guest-list">
              {#each guestList.filter(r => r.status === 'yes') as guest (guest.id)}
                <div
                  class="guest-row"
                  class:guest-row-clickable={!!guest.guestId}
                  role={guest.guestId ? 'button' : undefined}
                  tabindex={guest.guestId ? 0 : undefined}
                  onclick={() => guest.guestId && openProfileModal(guest)}
                  onkeydown={(e) => e.key === 'Enter' && guest.guestId && openProfileModal(guest)}
                >
                  {#if guest.profile?.avatarUrl}
                    <img src={guest.profile.avatarUrl} alt="" class="guest-avatar" />
                  {:else if guest.guestId}
                    <div class="guest-avatar-placeholder">{(guest.displayName[0] ?? '?').toUpperCase()}</div>
                  {/if}
                  <span class="guest-name">{guest.displayName}</span>
                  {#if guest.headCount > 1}
                    <span class="guest-count">+{guest.headCount - 1}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if guestListLoaded}
            <p class="muted">No confirmed guests yet.</p>
          {:else}
            <p class="muted">Loading…</p>
          {/if}
        {/if}
        {#if event.yesCount === 0 && event.maybeCount > 0}
          <p class="muted">{event.maybeCount} tentative.</p>
        {/if}
      </section>
      {/if}
    {/if}

    <!-- Wall -->
    {#if event.showAlbum}
      {#if event.wallRequiresRsvp && !hasQualifyingRsvp && !data.isEditor}
        <!-- gate notice already shown by the guest list block above; skip duplicate -->
      {:else}
      <section class="section">
        <h2>Wall</h2>

        {#if event.status === 'published'}
          <div class="post-composer">
            {#if postError}
              <div class="error-banner">{postError}</div>
            {/if}
            <textarea bind:value={postBody} rows="2" placeholder="Share something…" class="post-textarea"></textarea>
            <div class="post-composer-actions">
              <label class="photo-pick-btn">
                📷 {postFiles && postFiles.length > 0 ? `${postFiles.length} photo${postFiles.length > 1 ? 's' : ''} selected` : 'Add photos'}
                <input type="file" accept="image/*" multiple onchange={(e) => { postFiles = (e.target as HTMLInputElement).files }} style="display:none" />
              </label>
              <button onclick={submitPost} disabled={postLoading} class="post-btn">
                {postLoading ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        {/if}

        {#if postsLoaded}
          {#if posts.length === 0}
            <p class="muted">No posts yet. Be the first to share!</p>
          {:else}
            <div class="post-feed">
              {#each posts as post (post.id)}
                <div class="post-card">
                  <div class="post-header">
                    {#if post.guestId}
                      <button class="post-author post-author-btn" onclick={() => openProfileModal({ id: post.id, displayName: post.authorName, status: 'yes', headCount: 1, guestId: post.guestId ?? null, profile: null })}>
                        {post.authorName}
                      </button>
                    {:else}
                      <strong class="post-author">{post.authorName}</strong>
                    {/if}
                    <span class="post-time">{new Date(post.createdAt).toLocaleDateString()}</span>
                    {#if post.isOwn || data.isEditor}
                      <button class="post-delete-btn" onclick={() => deletePost(post.id)} title="Delete post">✕</button>
                    {/if}
                  </div>
                  {#if post.body}
                    <p class="post-body">{post.body}</p>
                  {/if}
                  {#if post.photos.length > 0}
                    <div class="post-photos" class:single={post.photos.length === 1}>
                      {#each post.photos as photo (photo.id)}
                        <button class="photo-thumb-btn" onclick={() => lightboxPhoto = { ...photo, uploaderName: post.authorName, isOwn: post.isOwn }}>
                          <img src={photo.url} alt={photo.caption ?? ''} class="photo-thumb" loading="lazy" />
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <p class="muted">Loading…</p>
        {/if}
      </section>
      {/if}
    {/if}

    <!-- Lightbox -->
    {#if lightboxPhoto}
      <div class="lightbox" onclick={() => lightboxPhoto = null} role="dialog" aria-modal="true">
        <div class="lightbox-inner" onclick={(e) => e.stopPropagation()}>
          <img src={lightboxPhoto.url} alt={lightboxPhoto.caption ?? ''} class="lightbox-img" />
          {#if lightboxPhoto.caption}
            <p class="lightbox-caption">{lightboxPhoto.caption}</p>
          {/if}
          <p class="lightbox-uploader">{lightboxPhoto.uploaderName}</p>
          <div class="lightbox-actions">
            {#if lightboxPhoto.isOwn || data.isEditor}
              <button onclick={() => { if (lightboxPhoto) deletePhoto(lightboxPhoto.id); lightboxPhoto = null }} class="lightbox-delete">Remove photo</button>
            {/if}
            <button onclick={() => lightboxPhoto = null} class="lightbox-close">Close</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</main>

<!-- Guest profile modal -->
{#if profileModal}
  <div class="modal-backdrop" onclick={() => profileModal = null} role="presentation">
    <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Guest profile">
      <button class="modal-close" onclick={() => profileModal = null} aria-label="Close">✕</button>
      <div class="modal-avatar-wrap">
        {#if profileModal.profile?.avatarUrl}
          <img src={profileModal.profile.avatarUrl} alt="" class="modal-avatar" />
        {:else}
          <div class="modal-avatar-placeholder">{(profileModal.name[0] ?? '?').toUpperCase()}</div>
        {/if}
      </div>
      <h3 class="modal-name">{profileModal.name}</h3>
      {#if profileModal.profile?.vibe}
        <p class="modal-vibe">"{profileModal.profile.vibe}"</p>
      {/if}
      {#if profileModal.profile?.bio}
        <p class="modal-bio">{profileModal.profile.bio}</p>
      {/if}

      {#if currentGuestId && profileModal.guestId !== currentGuestId}
        {#if !dmOpen}
          <div class="signal-row">
            {#if signalMutual}
              <p class="signal-mutual">💞 Mutual crush! You two should talk.</p>
            {:else if signalSent === 'crush'}
              <p class="signal-sent">💌 Crush sent!</p>
            {:else if signalSent === 'wink'}
              <p class="signal-sent">👋 Wink sent!</p>
            {:else}
              {#if signalError}
                <p class="signal-error">{signalError}</p>
              {/if}
              <button class="signal-btn signal-wink" onclick={() => sendSignal('wink')} disabled={signalLoading}>
                👋 Wink
              </button>
              <button class="signal-btn signal-crush" onclick={() => sendSignal('crush')} disabled={signalLoading}>
                💌 Crush
              </button>
            {/if}
            <button class="signal-btn signal-msg" onclick={openDmThread}>
              💬 Message
            </button>
          </div>
        {:else}
          <!-- DM thread -->
          <div class="dm-thread">
            <div class="dm-header">
              <button class="dm-back" onclick={() => dmOpen = false}>← Back</button>
              {#if !dmBlocked}
                <button class="dm-block-btn" onclick={blockGuest}>Block</button>
              {/if}
            </div>
            {#if dmLoading}
              <p class="dm-loading">Loading…</p>
            {:else if dmError}
              <p class="signal-error">{dmError}</p>
            {:else}
              <div class="dm-messages">
                {#if dmMessages.length === 0}
                  <p class="dm-empty">No messages yet. Say hello!</p>
                {:else}
                  {#each dmMessages as msg (msg.id)}
                    <div class="dm-msg" class:dm-msg-mine={msg.fromMe} class:dm-msg-theirs={!msg.fromMe}>
                      <span class="dm-bubble">{msg.body}</span>
                    </div>
                  {/each}
                {/if}
              </div>
              {#if dmBlocked}
                <p class="dm-blocked-notice">You have blocked this person.</p>
              {:else}
                <div class="dm-compose">
                  <textarea
                    class="dm-input"
                    rows="2"
                    maxlength="2000"
                    placeholder="Write a message…"
                    bind:value={dmInput}
                    onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm() } }}
                  ></textarea>
                  <button class="dm-send-btn" onclick={sendDm} disabled={dmSending || !dmInput.trim()}>
                    {dmSending ? '…' : 'Send'}
                  </button>
                </div>
                {#if dmError}
                  <p class="signal-error">{dmError}</p>
                {/if}
              {/if}
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .event-page {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 1rem 4rem;
    background-color: var(--page-bg, transparent);
    min-height: 100vh;
  }
  .back-nav { padding: 0.75rem 0 0; }
  .back-link { font-size: 0.85rem; color: #6b6058; text-decoration: none; font-weight: 500; }
  .back-link:hover { color: var(--accent, #b05525); }
  .cover { height: 240px; background-size: cover; background-position: center; border-radius: 0 0 12px 12px; margin-bottom: 1.5rem; }
  .event-header { margin-bottom: 1.5rem; }
  .header-badges { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .type-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.2rem 0.5rem; border-radius: 4px; }
  .type-badge.type-invite_only { background: #fef4e0; color: #7a5a1a; }
  h1 { font-size: 1.75rem; font-weight: 800; margin: 0.5rem 0 0.25rem; color: #1a1510; }
  .rsvp-chip-yes { color: #2a5e28; }
  .rsvp-chip-maybe { color: #7a5a1a; }
  .rsvp-chip-no { color: #6b6058; }
  .rsvp-chip-waitlist { color: #1a4070; }
  .rsvp-confirmed { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .rsvp-confirmed-status { font-size: 0.95rem; font-weight: 700; }
  .rsvp-confirmed-sep { color: #9a8f86; font-size: 0.9rem; }
  .rsvp-confirmed-name { font-size: 0.9rem; color: #3d352e; }
  .rsvp-confirmed-change { background: none; border: none; padding: 0; font-size: 0.85rem; color: var(--accent, #b05525); cursor: pointer; text-decoration: underline; font-family: inherit; margin-left: auto; }
  .rsvp-confirmed-change:hover { color: var(--accent-hover, #924418); }
  .organizer-name { margin: 0 0 1rem; font-size: 0.875rem; color: #6b6058; }
  .event-meta { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
  .meta-item { font-size: 0.9rem; color: #3d352e; }
  .cal-links { display: flex; gap: 1rem; flex-wrap: wrap; }
  .cal-link { font-size: 0.8rem; color: #924418; text-decoration: none; }
  .cal-link:hover { color: #6d3210; }
  .description { margin-bottom: 1.5rem; white-space: pre-wrap; color: #3d352e; line-height: 1.6; }
  .cancelled-banner { background: #f8e8e2; color: #7a2a1a; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 600; }
  .editor-banner { background: var(--card-bg, #f0e8da); color: #7a3010; border: 1px solid var(--border, #cfc3b0); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.875rem; }
  .editor-banner a { color: var(--accent, #b05525); text-decoration: none; font-weight: 600; }
  .section { background: var(--card-bg, #f0e8da); border: 1px solid var(--border, #cfc3b0); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .section h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .section > h2:only-child, .section > h2 { margin-bottom: 0.75rem; }
  .deadline-notice { margin: 0 0 0.875rem; font-size: 0.85rem; color: #7a5a1a; background: #fef4e0; border: 1px solid #e0c870; border-radius: 6px; padding: 0.375rem 0.75rem; display: inline-block; }
  .deadline-closed { background: #ede8e0; border: 1px solid #c8bdb0; border-radius: 8px; padding: 0.875rem 1rem; margin-bottom: 1rem; }
  .deadline-closed strong { display: block; color: #1a1510; margin-bottom: 0.25rem; }
  .deadline-closed p { margin: 0; font-size: 0.875rem; color: #6b6058; }
  .invite-used-banner { background: #fef4e0; color: #7a5a1a; border: 1px solid #e0c870; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .invite-used-banner strong { display: block; margin-bottom: 0.25rem; }
  .invite-used-banner p { margin: 0; font-size: 0.875rem; }
  .rsvp-summary { background: var(--card-inner, #e8ddd0); border: 1px solid var(--border, #cfc3b0); border-radius: 10px; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.375rem; }
  .rsvp-summary-status { font-size: 1rem; font-weight: 700; color: #1a1510; }
  .rsvp-summary-yes { color: #2a5e28; }
  .rsvp-summary-maybe { color: #7a5a1a; }
  .rsvp-summary-no { color: #4e453e; }
  .rsvp-summary-name { font-size: 0.875rem; color: #3d352e; }
  .rsvp-summary-note { font-size: 0.875rem; color: #6b6058; font-style: italic; }
  .change-rsvp-btn { align-self: flex-start; margin-top: 0.5rem; background: none; border: 1px solid var(--border, #cfc3b0); border-radius: 6px; padding: 0.375rem 0.75rem; font-size: 0.8rem; font-weight: 500; color: #3d352e; cursor: pointer; }
  .change-rsvp-btn:hover { border-color: var(--accent, #b05525); color: var(--accent, #b05525); }
  .rsvp-actions { display: flex; gap: 0.75rem; align-items: center; }
  .cancel-btn { background: none; border: 1px solid var(--border, #cfc3b0); border-radius: 8px; padding: 0.625rem 1rem; font-size: 0.9rem; color: #3d352e; cursor: pointer; }
  .cancel-btn:hover { border-color: #9a8f86; }
  .profile-intro { font-size: 0.875rem; color: #3d352e; margin-bottom: 1rem; }
  .req { color: #c03828; }
  .blocked-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.9rem; }
  .blocked-banner strong { display: block; margin-bottom: 0.25rem; }
  .blocked-banner p { margin: 0; font-size: 0.875rem; }
  .waitlist-banner { background: #edf3fb; color: #1a4070; border: 1px solid #b0cce8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .waitlist-banner strong { display: block; margin-bottom: 0.25rem; }
  .waitlist-banner p { margin: 0; font-size: 0.875rem; }
  .rsvp-summary-waitlist { background: #edf3fb; color: #1a4070; border-color: #b0cce8; }
  .locked-field { display: flex; flex-direction: column; gap: 0.25rem; }
  .locked-label { font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .locked-value { font-size: 1rem; color: #1a1510; background: var(--card-inner, #e8ddd0); border: 1px solid var(--border, #cfc3b0); border-radius: 8px; padding: 0.5rem 0.75rem; }
  .rsvp-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .rsvp-buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .rsvp-btn { padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid var(--border, #cfc3b0); background: var(--card-bg, #f0e8da); font-size: 0.875rem; font-weight: 500; color: #3d352e; cursor: pointer; }
  .rsvp-btn.active.rsvp-yes { border-color: #5a8c55; background: #e8f4e4; color: #2a5e28; }
  .rsvp-btn.active.rsvp-maybe { border-color: #c4962d; background: #fef4e0; color: #7a5a1a; }
  .rsvp-btn.active.rsvp-no { border-color: #c46450; background: #f8e8e2; color: #7a2a1a; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input, textarea { padding: 0.5rem 0.75rem; border: 1px solid var(--border, #c8bdb0); border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid var(--accent, #b05525); outline-offset: -1px; }
  .submit-btn { background: var(--accent, #b05525); color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .submit-btn:hover:not(:disabled) { background: var(--accent-hover, #924418); }
  .submit-btn:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .guest-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
  .guest-list-header h2 { margin: 0; }
  .expand-toggle { background: none; border: 1px solid var(--border, #cfc3b0); border-radius: 6px; padding: 0.25rem 0.625rem; font-size: 0.8rem; font-weight: 500; color: #3d352e; cursor: pointer; flex-shrink: 0; }
  .expand-toggle:hover { border-color: var(--accent, #b05525); color: var(--accent, #b05525); }
  .guest-list { display: flex; flex-direction: column; gap: 0.375rem; }
  .guest-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--card-inner, #e8ddd0); border-radius: 8px; }
  .guest-row-clickable { cursor: pointer; }
  .guest-row-clickable:hover { background: var(--border, #cfc3b0); }
  .guest-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .guest-avatar-placeholder { width: 28px; height: 28px; border-radius: 50%; background: #c8bdb0; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #6b5a48; flex-shrink: 0; }
  .guest-name { font-size: 0.9rem; color: #1a1510; font-weight: 500; }
  .guest-count { font-size: 0.8rem; color: #6b6058; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
  .modal-card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 16px; padding: 2rem 1.5rem 1.5rem; width: 100%; max-width: 320px; position: relative; text-align: center; }
  .modal-close { position: absolute; top: 0.75rem; right: 0.875rem; background: none; border: none; font-size: 1rem; color: #6b6058; cursor: pointer; padding: 0.25rem; }
  .modal-close:hover { color: #1a1510; }
  .modal-avatar-wrap { margin: 0 auto 0.875rem; width: 80px; height: 80px; }
  .modal-avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #cfc3b0; }
  .modal-avatar-placeholder { width: 80px; height: 80px; border-radius: 50%; background: #d4c4b0; border: 3px solid #cfc3b0; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: #6b5a48; }
  .modal-name { margin: 0 0 0.375rem; font-size: 1.1rem; color: #1a1510; }
  .modal-vibe { margin: 0 0 0.75rem; font-size: 0.9rem; color: #b05525; font-style: italic; }
  .modal-bio { margin: 0; font-size: 0.875rem; color: #3d352e; line-height: 1.5; }
  .signal-row { display: flex; gap: 0.625rem; justify-content: center; margin-top: 1rem; flex-wrap: wrap; }
  .signal-btn { border: none; border-radius: 20px; padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .signal-btn:disabled { opacity: 0.5; cursor: default; }
  .signal-wink { background: #f0e8da; color: #3d352e; border: 1px solid #cfc3b0; }
  .signal-wink:hover:not(:disabled) { background: #e8ddd0; }
  .signal-crush { background: #fde8e8; color: #8b1616; border: 1px solid #f0b8b8; }
  .signal-crush:hover:not(:disabled) { background: #f5d0d0; }
  .signal-sent { margin: 0.75rem 0 0; font-size: 0.875rem; color: #3d352e; text-align: center; width: 100%; }
  .signal-mutual { margin: 0.75rem 0 0; font-size: 0.9rem; font-weight: 600; color: #b03050; text-align: center; width: 100%; }
  .signal-error { margin: 0; font-size: 0.8rem; color: #c03828; text-align: center; width: 100%; }
  .signal-msg { background: #e8f0fc; color: #1a3a70; border: 1px solid #b0c8e8; }
  .signal-msg:hover:not(:disabled) { background: #d4e4f8; }
  .dm-thread { margin-top: 1rem; text-align: left; }
  .dm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
  .dm-back { background: none; border: none; font-size: 0.85rem; color: #6b6058; cursor: pointer; padding: 0; font-family: inherit; }
  .dm-back:hover { color: #1a1510; }
  .dm-block-btn { background: none; border: 1px solid #f0c8b8; border-radius: 6px; font-size: 0.75rem; color: #8b3016; cursor: pointer; padding: 0.25rem 0.625rem; font-family: inherit; }
  .dm-block-btn:hover { background: #fdf2ee; }
  .dm-loading { font-size: 0.85rem; color: #6b6058; text-align: center; margin: 1rem 0; }
  .dm-messages { display: flex; flex-direction: column; gap: 0.5rem; max-height: 220px; overflow-y: auto; margin-bottom: 0.75rem; padding-right: 2px; }
  .dm-empty { font-size: 0.85rem; color: #9a8f86; text-align: center; margin: 0.75rem 0; }
  .dm-msg { display: flex; }
  .dm-msg-mine { justify-content: flex-end; }
  .dm-msg-theirs { justify-content: flex-start; }
  .dm-bubble { display: inline-block; max-width: 82%; padding: 0.4rem 0.75rem; border-radius: 14px; font-size: 0.875rem; line-height: 1.45; word-break: break-word; }
  .dm-msg-mine .dm-bubble { background: var(--accent, #b05525); color: #fff; border-bottom-right-radius: 4px; }
  .dm-msg-theirs .dm-bubble { background: var(--card-inner, #e8ddd0); color: #1a1510; border-bottom-left-radius: 4px; }
  .dm-compose { display: flex; gap: 0.5rem; align-items: flex-end; }
  .dm-input { flex: 1; padding: 0.4rem 0.625rem; border: 1px solid var(--border, #c8bdb0); border-radius: 10px; font-size: 0.875rem; font-family: inherit; background: #fff; color: #1a1510; resize: none; }
  .dm-input:focus { outline: 2px solid var(--accent, #b05525); outline-offset: -1px; }
  .dm-send-btn { background: var(--accent, #b05525); color: #fff; border: none; border-radius: 10px; padding: 0.4rem 0.875rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; flex-shrink: 0; }
  .dm-send-btn:disabled { opacity: 0.5; cursor: default; }
  .dm-send-btn:hover:not(:disabled) { background: var(--accent-hover, #924418); }
  .dm-blocked-notice { font-size: 0.8rem; color: #8b3016; text-align: center; margin: 0.5rem 0 0; }
  .no-identity-banner { background: #fef4e0; color: #7a5a1a; border: 1px solid #e0c870; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.9rem; }
  .no-identity-banner a { color: #b05525; font-weight: 600; text-decoration: none; }
  .no-identity-banner a:hover { text-decoration: underline; }
  .post-composer { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border, #cfc3b0); }
  .post-textarea { padding: 0.5rem 0.75rem; border: 1px solid var(--border, #c8bdb0); border-radius: 8px; font-size: 0.95rem; font-family: inherit; background: #fff; color: #1a1510; resize: none; }
  .post-composer-actions { display: flex; gap: 0.5rem; align-items: center; }
  .photo-pick-btn { font-size: 0.8rem; color: #3d352e; background: var(--card-inner, #e8ddd0); border: 1px solid var(--border, #cfc3b0); border-radius: 6px; padding: 0.375rem 0.75rem; cursor: pointer; }
  .post-btn { background: var(--accent, #b05525); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; margin-left: auto; }
  .post-btn:hover:not(:disabled) { background: var(--accent-hover, #924418); }
  .post-btn:disabled { opacity: 0.6; }
  .post-feed { display: flex; flex-direction: column; gap: 0.75rem; }
  .post-card { background: var(--card-inner, #e8ddd0); border-radius: 8px; padding: 0.75rem; border: 1px solid var(--border, #cfc3b0); }
  .post-header { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.375rem; }
  .post-author { font-size: 0.875rem; color: #1a1510; font-weight: 600; }
  .post-author-btn { background: none; border: none; padding: 0; font-family: inherit; cursor: pointer; }
  .post-author-btn:hover { text-decoration: underline; color: var(--accent, #b05525); }
  .post-time { font-size: 0.75rem; color: #6b6058; }
  .post-delete-btn { margin-left: auto; background: none; border: none; font-size: 0.8rem; color: #9a8f86; cursor: pointer; padding: 0; line-height: 1; }
  .post-delete-btn:hover { color: #c03828; }
  .post-body { margin: 0 0 0.5rem; font-size: 0.9rem; color: #3d352e; white-space: pre-wrap; }
  .post-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; border-radius: 6px; overflow: hidden; }
  .post-photos.single { grid-template-columns: 1fr; max-width: 320px; }
  .photo-thumb-btn { padding: 0; border: none; background: none; cursor: pointer; aspect-ratio: 1; overflow: hidden; }
  .photo-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
  .lightbox-inner { background: #fff; border-radius: 12px; overflow: hidden; max-width: 560px; width: 100%; }
  .lightbox-img { width: 100%; max-height: 70vh; object-fit: contain; display: block; background: #111; }
  .lightbox-caption { margin: 0.75rem 1rem 0.25rem; font-size: 0.9rem; color: #1a1510; }
  .lightbox-uploader { margin: 0.25rem 1rem 0.75rem; font-size: 0.8rem; color: #6b6058; }
  .lightbox-actions { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid #e8e0d8; }
  .lightbox-close { margin-left: auto; background: var(--card-inner, #e8ddd0); border: 1px solid var(--border, #cfc3b0); border-radius: 6px; padding: 0.375rem 0.875rem; font-size: 0.875rem; cursor: pointer; }
  .lightbox-delete { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 6px; padding: 0.375rem 0.875rem; font-size: 0.875rem; cursor: pointer; }
  .message { border-radius: 8px; padding: 0.75rem; border: 1px solid var(--accent, #b05525); background: var(--card-bg, #f0e8da); }
  .message-subject { font-weight: 700; font-size: 0.9rem; color: #1a1510; margin-bottom: 0.25rem; }
  .message-body { margin: 0 0 0.375rem; font-size: 0.9rem; color: #3d352e; white-space: pre-wrap; }
  .message-meta { display: flex; gap: 0.5rem; }
  .message-time { font-size: 0.75rem; color: #9a8f86; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  .rsvp-gate-notice { font-size: 0.875rem; color: #6b6058; font-style: italic; margin-bottom: 0.5rem; }
  button { cursor: pointer; }
</style>
