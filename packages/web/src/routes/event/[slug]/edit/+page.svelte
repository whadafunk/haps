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

  let comments = $state<Array<{ id: string; displayName: string; body: string; createdAt: string }>>([])
  let commentsLoaded = $state(false)

  let blastSubject = $state('')
  let blastBody = $state('')
  let blastEmail = $state(true)
  let blastSms = $state(false)
  let blastLoading = $state(false)
  let blastError = $state('')
  let blastSuccess = $state('')
  let blastHistory = $state<Array<{ id: string; subject: string | null; body: string; createdAt: string }>>([])
  let blastHistoryLoaded = $state(false)

  let editLink = $state('')

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
      const res = await api.uploadCover(event.slug, file)
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
    try {
      const stored = localStorage.getItem(`haps:editLink:${event.slug}`)
      if (stored) editLink = stored
    } catch { /* storage disabled */ }

    api.listComments(event.slug).then(res => {
      comments = res.comments
      commentsLoaded = true
    }).catch(() => { commentsLoaded = true })

    api.listMessages(event.slug).then(res => {
      blastHistory = res.messages.filter(m => m.type === 'blast').reverse()
      blastHistoryLoaded = true
    }).catch(() => { blastHistoryLoaded = true })
  })

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
        theme: event.theme ?? undefined,
        showGuests: event.showGuests,
        allowComments: event.allowComments,
      })
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
      await api.deleteEvent(event.slug)
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

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    try {
      await api.deleteComment(event.slug, commentId)
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
      const res = await api.sendBlast(event.slug, { subject: blastSubject, body: blastBody, channels })
      blastSuccess = channels.length > 0
        ? `Blast posted. ${res.queued} delivery job${res.queued !== 1 ? 's' : ''} queued.`
        : 'Blast posted to event channel.'
      // refresh history
      api.listMessages(event.slug).then(r => {
        blastHistory = r.messages.filter(m => m.type === 'blast').reverse()
      }).catch(() => {})
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
    <h1>Edit: {event.title}</h1>
  </div>

  {#if editLink}
    <div class="edit-link-hint">
      Edit link: <code>{editLink}</code>
    </div>
  {/if}

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

    <section class="card wide">
      <h2>Comments ({comments.length})</h2>
      {#if !commentsLoaded}
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

      {#if blastHistoryLoaded && blastHistory.length > 0}
        <div class="blast-history">
          <h3>Previous blasts</h3>
          {#each blastHistory as blast (blast.id)}
            <div class="blast-row">
              <div class="blast-header">
                <span class="blast-subject">{blast.subject ?? '(no subject)'}</span>
                <span class="blast-time">{new Date(blast.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p class="blast-body">{blast.body}</p>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</main>

<style>
  .edit-page { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  .header { margin-bottom: 1rem; }
  .header a { font-size: 0.875rem; color: #6b6058; text-decoration: none; }
  .header a:hover { color: #b05525; }
  h1 { margin: 0.5rem 0 0; font-size: 1.5rem; color: #1a1510; }
  .edit-link-hint { font-size: 0.8rem; color: #6b6058; margin-bottom: 1.25rem; background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 8px; padding: 0.625rem 0.875rem; word-break: break-all; }
  .edit-link-hint code { color: #3d352e; }
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
  .muted { color: #6b6058; font-size: 0.875rem; }
  .blast-history { margin-top: 1.25rem; border-top: 1px solid #cfc3b0; padding-top: 1rem; }
  .blast-history h3 { margin: 0 0 0.75rem; font-size: 0.875rem; font-weight: 600; color: #6b6058; text-transform: uppercase; letter-spacing: 0.04em; }
  .blast-row { background: #e8ddd0; border: 1px solid #cfc3b0; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; }
  .blast-header { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.375rem; }
  .blast-subject { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .blast-time { font-size: 0.75rem; color: #9a8f86; white-space: nowrap; }
  .blast-body { margin: 0; font-size: 0.8rem; color: #3d352e; white-space: pre-wrap; }
</style>
