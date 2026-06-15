<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  let editingRsvp = $state(!data.myRsvp)
  let rsvpStatus = $state(data.myRsvp?.status ?? '')
  let rsvpName = $state(data.lockedIdentity?.displayName ?? data.myRsvp?.displayName ?? '')
  let rsvpEmail = $state(data.lockedIdentity?.email ?? '')
  let rsvpNote = $state(data.myRsvp?.note ?? '')
  let rsvpHeadCount = $state(data.myRsvp?.headCount ?? 1)
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

  let commentBody = $state('')
  let commentName = $state('')
  let commentLoading = $state(false)
  let commentError = $state('')

  type EventMessage = { id: string; displayName: string; subject: string | null; body: string; type: string; createdAt: string }
  let messages = $state<EventMessage[]>([])
  let messagesLoaded = $state(false)
  let comments = $state<Array<{ id: string; displayName: string; body: string; createdAt: string }>>([])
  let commentsLoaded = $state(false)

  let guestList = $state<Array<{ id: string; displayName: string; status: string; headCount: number }>>([])
  let guestListLoaded = $state(false)

  const event = $derived(data.event)
  const rsvpDeadlinePassed = $derived(!!event.rsvpDeadline && new Date() > new Date(event.rsvpDeadline))

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
    if (!rsvpStatus || !rsvpName) { rsvpError = 'Name and RSVP status are required.'; return }
    if (!rsvpEmail) { rsvpError = 'Email is required.'; return }
    rsvpLoading = true
    rsvpError = ''
    try {
      await api.submitRsvp(event.slug, {
        displayName: rsvpName,
        status: rsvpStatus,
        headCount: rsvpHeadCount,
        note: rsvpNote || undefined,
        email: rsvpEmail,
      })
      await invalidateAll()
      editingRsvp = false
      // Reload guest list after RSVP
      if (event.showGuests) {
        const res = await api.listRsvps(event.slug)
        guestList = res.rsvps
      }
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
            await invalidateAll()
            editingRsvp = false
            if (event.showGuests) {
              const res = await api.listRsvps(event.slug)
              guestList = res.rsvps
            }
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

  async function loadComments() {
    if (commentsLoaded) return
    try {
      const res = await api.listComments(event.slug)
      comments = res.comments
      commentsLoaded = true
    } catch { /**/ }
  }

  async function submitComment() {
    if (!commentBody || !commentName) { commentError = 'Name and message are required.'; return }
    commentLoading = true
    commentError = ''
    try {
      const res = await api.postComment(event.slug, { displayName: commentName, body: commentBody })
      comments = [...comments, res.comment]
      commentBody = ''
    } catch (e: unknown) {
      commentError = e instanceof ApiError ? e.message : 'Failed to post comment.'
    } finally {
      commentLoading = false
    }
  }

  async function loadMessages() {
    if (messagesLoaded) return
    try {
      const res = await api.listMessages(event.slug)
      messages = res.messages
      messagesLoaded = true
    } catch { /**/ }
  }

  $effect(() => {
    loadComments()
    loadMessages()
    if (event.showGuests && !guestListLoaded) {
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
  {#if event.coverImageUrl}
    <div class="cover" style="background-image: url({event.coverImageUrl})"></div>
  {/if}

  <div class="content">
    <div class="event-header">
      <div class="header-badges">
        <span class="status-badge status-{event.status}">{event.status}</span>
        <span class="type-badge type-{event.eventType}">{event.eventType === 'invite_only' ? 'Invite-Only' : 'Open'}</span>
      </div>
      <h1>{event.title}</h1>

      <div class="event-meta">
        <div class="meta-item">
          📅 {formatDate(event.startsAt)} at {formatTime(event.startsAt)}
          {#if event.endsAt} – {formatTime(event.endsAt)}{/if}
        </div>
        {#if event.location}
          <div class="meta-item">📍 {event.location}</div>
        {/if}
        <div class="meta-item">
          {event.yesCount} going · {event.maybeCount} maybe{event.waitlistCount > 0 ? ` · ${event.waitlistCount} waitlisted` : ''}
          {#if event.maxCapacity} · {event.maxCapacity} capacity{/if}
        </div>
      </div>

      <div class="cal-links">
        <a href="/api/events/{event.slug}/ics" class="cal-link">📆 Download .ics</a>
        <a
          href="https://calendar.google.com/calendar/render?action=TEMPLATE&text={encodeURIComponent(event.title)}&dates={new Date(event.startsAt).toISOString().replace(/[-:]/g,'').replace('.000','')}/{new Date(event.endsAt ?? event.startsAt).toISOString().replace(/[-:]/g,'').replace('.000','')}&details={encodeURIComponent(event.description ?? '')}&location={encodeURIComponent(event.location ?? '')}"
          target="_blank"
          rel="noopener"
          class="cal-link"
        >🗓 Add to Google Calendar</a>
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
          {#if data.myRsvp}
            <div class="rsvp-summary">
              <div class="rsvp-summary-status rsvp-summary-{data.myRsvp.status}">
                {data.myRsvp.status === 'yes' ? 'Going' : data.myRsvp.status === 'maybe' ? 'Maybe' : data.myRsvp.status === 'waitlist' ? 'Waitlisted' : 'Not going'}
                {#if data.myRsvp.headCount > 1} · party of {data.myRsvp.headCount}{/if}
              </div>
              <div class="rsvp-summary-name">{data.myRsvp.displayName}</div>
            </div>
          {/if}
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
        {:else if data.myRsvp && !editingRsvp}
          <!-- Read-only RSVP summary -->
          {#if data.myRsvp.status === 'waitlist'}
            <div class="waitlist-banner">
              <strong>You're on the waitlist.</strong>
              <p>We'll notify you if a spot opens up.</p>
            </div>
          {/if}
          <div class="rsvp-summary">
            <div class="rsvp-summary-status rsvp-summary-{data.myRsvp.status}">
              {data.myRsvp.status === 'yes' ? 'Going' : data.myRsvp.status === 'maybe' ? 'Maybe' : data.myRsvp.status === 'waitlist' ? 'Waitlisted' : 'Not going'}
              {#if data.myRsvp.headCount > 1} · party of {data.myRsvp.headCount}{/if}
            </div>
            <div class="rsvp-summary-name">{data.myRsvp.displayName}</div>
            {#if data.myRsvp.note}
              <div class="rsvp-summary-note">"{data.myRsvp.note}"</div>
            {/if}
            <button class="change-rsvp-btn" onclick={() => { editingRsvp = true; rsvpError = '' }}>
              Change RSVP
            </button>
          </div>
        {:else}
          {#if rsvpError}
            <div class="error-banner">{rsvpError}</div>
          {/if}

          <div class="rsvp-form">
            {#if data.lockedIdentity?.displayName}
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
            <label>
              Party size
              <input type="number" min="1" max="20" bind:value={rsvpHeadCount} />
            </label>
            <label>
              Note (optional)
              <input type="text" bind:value={rsvpNote} placeholder="Any notes…" />
            </label>
            {#if data.lockedIdentity?.email}
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
              <button class="submit-btn" onclick={submitRsvp} disabled={rsvpLoading}>
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
      </section>
    {/if}

    <!-- Guest list -->
    {#if event.showGuests}
      <section class="section">
        <h2>Guests ({event.yesCount} going)</h2>
        {#if guestListLoaded && guestList.filter(r => r.status === 'yes').length > 0}
          <div class="guest-list">
            {#each guestList.filter(r => r.status === 'yes') as guest (guest.id)}
              <div class="guest-row">
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
        {#if event.yesCount === 0 && event.maybeCount > 0}
          <p class="muted">{event.maybeCount} tentative.</p>
        {/if}
      </section>
    {/if}

    <!-- Updates (host-only blasts) -->
    {#if messages.length > 0 || !messagesLoaded}
      <section class="section">
        <h2>Updates</h2>
        {#if messagesLoaded}
          <div class="messages">
            {#each messages as msg (msg.id)}
              <div class="message">
                {#if msg.subject}
                  <div class="message-subject">{msg.subject}</div>
                {/if}
                <p class="message-body">{msg.body}</p>
                <div class="message-meta">
                  <span class="message-time">{new Date(msg.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted">Loading…</p>
        {/if}
      </section>
    {/if}

    <!-- Comments -->
    {#if event.allowComments}
      <section class="section">
        <h2>Comments</h2>

        {#if commentError}
          <div class="error-banner">{commentError}</div>
        {/if}

        {#if commentsLoaded}
          {#if comments.length === 0}
            <p class="muted">No comments yet.</p>
          {:else}
            <div class="comments">
              {#each comments as comment (comment.id)}
                <div class="comment">
                  <strong>{comment.displayName}</strong>
                  <span class="comment-time">{new Date(comment.createdAt).toLocaleDateString()}</span>
                  <p>{comment.body}</p>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        {#if event.status === 'published'}
          <div class="comment-form">
            <label>
              Your name
              <input type="text" bind:value={commentName} placeholder="Name" />
            </label>
            <label>
              Message
              <textarea bind:value={commentBody} rows="3" placeholder="Write a comment…"></textarea>
            </label>
            <button onclick={submitComment} disabled={commentLoading}>
              {commentLoading ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>

<style>
  .event-page {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 1rem 4rem;
    background-color: var(--page-bg, transparent);
    min-height: 100vh;
  }
  .cover { height: 240px; background-size: cover; background-position: center; border-radius: 0 0 12px 12px; margin-bottom: 1.5rem; }
  .event-header { margin-bottom: 1.5rem; }
  .header-badges { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .status-badge, .type-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.2rem 0.5rem; border-radius: 4px; }
  .status-badge { background: #ede8e0; color: #4e453e; }
  .status-badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .status-badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  .type-badge.type-open { background: #e8f4e4; color: #2a5e28; }
  .type-badge.type-invite_only { background: #fef4e0; color: #7a5a1a; }
  h1 { font-size: 1.75rem; font-weight: 800; margin: 0.5rem 0 1rem; color: #1a1510; }
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
  .guest-list { display: flex; flex-direction: column; gap: 0.375rem; }
  .guest-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--card-inner, #e8ddd0); border-radius: 8px; }
  .guest-name { font-size: 0.9rem; color: #1a1510; font-weight: 500; }
  .guest-count { font-size: 0.8rem; color: #6b6058; }
  .comments { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .comment { background: var(--card-inner, #e8ddd0); border-radius: 8px; padding: 0.75rem; border: 1px solid var(--border, #cfc3b0); }
  .comment strong { font-size: 0.875rem; color: #1a1510; }
  .comment-time { font-size: 0.75rem; color: #6b6058; margin-left: 0.5rem; }
  .comment p { margin: 0.25rem 0 0; font-size: 0.9rem; color: #3d352e; }
  .comment-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .comment-form button { background: var(--accent, #b05525); color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .comment-form button:hover:not(:disabled) { background: var(--accent-hover, #924418); }
  .comment-form button:disabled { opacity: 0.6; }
  .messages { display: flex; flex-direction: column; gap: 0.5rem; }
  .message { border-radius: 8px; padding: 0.75rem; border: 1px solid var(--accent, #b05525); background: var(--card-bg, #f0e8da); }
  .message-subject { font-weight: 700; font-size: 0.9rem; color: #1a1510; margin-bottom: 0.25rem; }
  .message-body { margin: 0 0 0.375rem; font-size: 0.9rem; color: #3d352e; white-space: pre-wrap; }
  .message-meta { display: flex; gap: 0.5rem; }
  .message-time { font-size: 0.75rem; color: #9a8f86; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  button { cursor: pointer; }
</style>
