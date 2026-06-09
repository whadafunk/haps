<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { invalidateAll } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  let rsvpStatus = $state(data.myRsvp?.status ?? '')
  let rsvpName = $state('')
  let rsvpEmail = $state('')
  let rsvpNote = $state('')
  let rsvpHeadCount = $state(1)
  let rsvpLoading = $state(false)
  let rsvpError = $state('')

  let commentBody = $state('')
  let commentName = $state('')
  let commentLoading = $state(false)
  let commentError = $state('')

  let comments = $state<Array<{ id: string; displayName: string; body: string; createdAt: string }>>([])
  let commentsLoaded = $state(false)

  // Use $derived so event updates reactively when data changes after invalidateAll()
  const event = $derived(data.event)

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
    rsvpLoading = true
    rsvpError = ''
    try {
      await api.submitRsvp(event.slug, {
        displayName: rsvpName,
        status: rsvpStatus,
        headCount: rsvpHeadCount,
        note: rsvpNote || undefined,
        email: rsvpEmail || undefined,
      })
      await invalidateAll()
    } catch (e: unknown) {
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

  // Load comments on mount
  $effect(() => { loadComments() })
</script>

<main class="event-page" data-theme={event.theme ?? 'default'}>
  {#if event.coverImageUrl}
    <div class="cover" style="background-image: url({event.coverImageUrl})"></div>
  {/if}

  <div class="content">
    <div class="event-header">
      <span class="status-badge status-{event.status}">{event.status}</span>
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
          {event.yesCount} going · {event.maybeCount} maybe
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

    {#if data.isEditor}
      <div class="editor-banner">
        You are the host. <a href="/event/{event.slug}/edit">Manage event →</a>
      </div>
    {/if}

    <!-- RSVP section -->
    {#if event.status === 'published'}
      <section class="section">
        <h2>RSVP</h2>
        {#if data.myRsvp}
          <p class="my-rsvp">Your RSVP: <strong>{data.myRsvp.status}</strong> (party of {data.myRsvp.headCount})</p>
        {/if}

        {#if rsvpError}
          <div class="error-banner">{rsvpError}</div>
        {/if}

        <div class="rsvp-form">
          <label>
            Your name
            <input type="text" bind:value={rsvpName} placeholder="Name" />
          </label>
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
          <label>
            Email (optional, for reminders)
            <input type="email" bind:value={rsvpEmail} placeholder="you@example.com" />
          </label>
          <button class="submit-btn" onclick={submitRsvp} disabled={rsvpLoading}>
            {rsvpLoading ? 'Saving…' : data.myRsvp ? 'Update RSVP' : 'Submit RSVP'}
          </button>
        </div>
      </section>
    {/if}

    <!-- Guest list -->
    {#if event.showGuests && event.guestCount > 0}
      <section class="section">
        <h2>Guests ({event.yesCount} going)</h2>
        <p class="muted">View the full guest list after RSVPing.</p>
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
  .event-page { max-width: 680px; margin: 0 auto; padding: 0 1rem 4rem; }
  .cover { height: 240px; background-size: cover; background-position: center; border-radius: 0 0 12px 12px; margin-bottom: 1.5rem; }
  .content { }
  .event-header { margin-bottom: 1.5rem; }
  .status-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .status-badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .status-badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  h1 { font-size: 1.75rem; font-weight: 800; margin: 0.5rem 0 1rem; color: #1a1510; }
  .event-meta { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
  .meta-item { font-size: 0.9rem; color: #3d352e; }
  .cal-links { display: flex; gap: 1rem; flex-wrap: wrap; }
  .cal-link { font-size: 0.8rem; color: #b05525; text-decoration: none; }
  .cal-link:hover { color: #924418; }
  .description { margin-bottom: 1.5rem; white-space: pre-wrap; color: #3d352e; line-height: 1.6; }
  .editor-banner { background: #f0ddd0; color: #7a3010; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.875rem; }
  .section { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .section h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #1a1510; }
  .my-rsvp { font-size: 0.9rem; color: #3d352e; margin-bottom: 1rem; }
  .rsvp-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .rsvp-buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .rsvp-btn { padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid #cfc3b0; background: #f0e8da; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .rsvp-btn:hover { border-color: #c8bdb0; }
  .rsvp-btn.active.rsvp-yes { border-color: #5a8c55; background: #e8f4e4; color: #2a5e28; }
  .rsvp-btn.active.rsvp-maybe { border-color: #c4962d; background: #fef4e0; color: #7a5a1a; }
  .rsvp-btn.active.rsvp-no { border-color: #c46450; background: #f8e8e2; color: #7a2a1a; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input, textarea { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .submit-btn { background: #b05525; color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; }
  .submit-btn:hover:not(:disabled) { background: #924418; }
  .submit-btn:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .comments { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .comment { background: #e8ddd0; border-radius: 8px; padding: 0.75rem; border: 1px solid #cfc3b0; }
  .comment strong { font-size: 0.875rem; color: #1a1510; }
  .comment-time { font-size: 0.75rem; color: #9a8f86; margin-left: 0.5rem; }
  .comment p { margin: 0.25rem 0 0; font-size: 0.9rem; color: #3d352e; }
  .comment-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .comment-form button { background: #b05525; color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; }
  .comment-form button:hover:not(:disabled) { background: #924418; }
  .comment-form button:disabled { opacity: 0.6; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  button { cursor: pointer; }
</style>
