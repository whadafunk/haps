<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { goto, invalidateAll } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  const isGuest = $derived(data.user?.type === 'guest')

  // Profile form (operators only — display name separate from RSVP identity)
  let displayName = $state(data.user?.displayName ?? '')
  let profileSaving = $state(false)
  let profileError = $state('')
  let profileSuccess = $state(false)

  // Guest identity form — for operators this is separate; for guests it IS the profile
  let guestName = $state(data.contact?.name ?? data.user?.displayName ?? '')
  // For guests, email is their login email and can't be changed here independently
  let guestEmail = $state(data.contact?.email ?? data.user?.email ?? '')
  let guestPhone = $state(data.contact?.phone ?? '')
  let guestInstagram = $state(data.contact?.instagramHandle ?? '')
  let guestBio = $state(data.contact?.bio ?? '')
  let guestVibe = $state(data.contact?.vibe ?? '')
  let guestAvatarUrl = $state(data.contact?.avatarUrl ?? '')
  let guestSaving = $state(false)
  let guestError = $state('')
  let guestSuccess = $state(false)

  // Avatar upload
  let avatarUploading = $state(false)
  let avatarError = $state('')

  async function uploadAvatar(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    avatarUploading = true
    avatarError = ''
    try {
      const { avatarUrl } = await api.uploadAvatar(file)
      guestAvatarUrl = avatarUrl
    } catch (err: unknown) {
      avatarError = err instanceof ApiError ? err.message : 'Upload failed.'
    } finally {
      avatarUploading = false
    }
  }

  // Password form
  let currentPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  let passwordSaving = $state(false)
  let passwordError = $state('')
  let passwordSuccess = $state(false)

  // Delete account
  let deleteConfirm = $state('')
  let deleting = $state(false)
  let deleteError = $state('')

  async function saveProfile() {
    if (!displayName.trim()) { profileError = 'Display name is required.'; return }
    profileSaving = true
    profileError = ''
    profileSuccess = false
    try {
      await api.updateProfile({ displayName: displayName.trim() })
      profileSuccess = true
      setTimeout(() => { profileSuccess = false }, 2000)
      await invalidateAll()
    } catch (e: unknown) {
      profileError = e instanceof ApiError ? e.message : 'Failed to update profile.'
    } finally {
      profileSaving = false
    }
  }

  async function saveGuestIdentity() {
    if (!guestName.trim()) { guestError = 'Name is required.'; return }
    if (!guestEmail.trim()) { guestError = 'Email is required.'; return }
    guestSaving = true
    guestError = ''
    guestSuccess = false
    try {
      await api.setupGuestIdentity({
        displayName: guestName.trim(),
        email: guestEmail.trim(),
        phone: guestPhone.trim() || undefined,
        instagramHandle: guestInstagram.trim() || undefined,
        bio: guestBio.trim() || undefined,
        vibe: guestVibe.trim() || undefined,
      })
      guestSuccess = true
      setTimeout(() => { guestSuccess = false }, 2000)
      await invalidateAll()
    } catch (e: unknown) {
      guestError = e instanceof ApiError ? e.message : 'Failed to save guest identity.'
    } finally {
      guestSaving = false
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) { passwordError = 'All fields are required.'; return }
    if (newPassword !== confirmPassword) { passwordError = 'New passwords do not match.'; return }
    if (newPassword.length < 8) { passwordError = 'New password must be at least 8 characters.'; return }
    passwordSaving = true
    passwordError = ''
    passwordSuccess = false
    try {
      await api.changePassword({ currentPassword, newPassword })
      passwordSuccess = true
      setTimeout(() => { passwordSuccess = false }, 2000)
      currentPassword = ''
      newPassword = ''
      confirmPassword = ''
    } catch (e: unknown) {
      passwordError = e instanceof ApiError ? e.message : 'Failed to change password.'
    } finally {
      passwordSaving = false
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== data.user?.email) {
      deleteError = 'Please type your email address to confirm.'
      return
    }
    deleting = true
    deleteError = ''
    try {
      await api.deleteAccount()
      goto('/')
    } catch (e: unknown) {
      deleteError = e instanceof ApiError ? e.message : 'Failed to delete account.'
      deleting = false
    }
  }
</script>

<main class="page">
  <div class="container">
    <h1>My account</h1>

    {#if isGuest}
      <!-- Guests: single profile card — login identity and RSVP identity are the same thing -->
      <section class="card">
        <h2>Profile</h2>

        <dl class="profile-fields">
          <dt>Email</dt>
          <dd>{data.user?.email ?? '—'}</dd>
        </dl>

        <!-- Avatar -->
        <div class="avatar-row">
          <div class="avatar-preview">
            {#if guestAvatarUrl}
              <img src={guestAvatarUrl} alt="Profile picture" class="avatar-img" />
            {:else}
              <div class="avatar-placeholder">{(data.contact?.name ?? data.user?.displayName ?? '?')[0].toUpperCase()}</div>
            {/if}
          </div>
          <div class="avatar-actions">
            <label class="btn-secondary avatar-btn" class:disabled={avatarUploading}>
              {avatarUploading ? 'Uploading…' : 'Change photo'}
              <input type="file" accept="image/*" onchange={uploadAvatar} style="display:none" disabled={avatarUploading} />
            </label>
            {#if avatarError}
              <span class="avatar-error">{avatarError}</span>
            {/if}
          </div>
        </div>

        {#if guestError}
          <div class="error-banner">{guestError}</div>
        {/if}
        <div class="form">
          <label>
            Name
            <input type="text" bind:value={guestName} maxlength="200" placeholder="Your name" />
          </label>
          <label>
            Vibe <span class="char-count">{guestVibe.length}/80</span>
            <input type="text" bind:value={guestVibe} maxlength="80" placeholder="e.g. ready to party" />
          </label>
          <label>
            About me <span class="char-count">{guestBio.length}/200</span>
            <textarea bind:value={guestBio} maxlength="200" rows="3" placeholder="A few words about you…"></textarea>
          </label>
          <label>
            Phone (optional)
            <input type="tel" bind:value={guestPhone} placeholder="+1 555 000 0000" />
          </label>
          <label>
            Instagram (optional)
            <input type="text" bind:value={guestInstagram} placeholder="@handle" />
          </label>
          <div class="form-actions">
            <button onclick={saveGuestIdentity} disabled={guestSaving} class="btn-primary" class:btn-saved={guestSuccess}>
              {guestSaving ? 'Saving…' : guestSuccess ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    {:else}
      <!-- Operators: login profile separate from RSVP guest identity -->
      <section class="card">
        <h2>Profile</h2>
        <dl class="profile-fields">
          <dt>Email</dt>
          <dd>{data.user?.email ?? '—'}</dd>
          <dt>Role</dt>
          <dd class="role">{data.user?.role ?? '—'}</dd>
        </dl>

        {#if profileError}
          <div class="error-banner">{profileError}</div>
        {/if}
        <div class="form">
          <label>
            Display name
            <input type="text" bind:value={displayName} maxlength="200" />
          </label>
          <div class="form-actions">
            <button onclick={saveProfile} disabled={profileSaving} class="btn-primary" class:btn-saved={profileSuccess}>
              {profileSaving ? 'Saving…' : profileSuccess ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Guest identity</h2>
        <p class="section-hint">This is the name and email that appears on your RSVPs and in the guest list. It can be different from your login email.</p>

        {#if !data.contact}
          <div class="warn-banner">You haven't set up a guest identity yet. You won't be able to RSVP to events until you do.</div>
        {/if}

        <!-- Avatar -->
        <div class="avatar-row">
          <div class="avatar-preview">
            {#if guestAvatarUrl}
              <img src={guestAvatarUrl} alt="Profile picture" class="avatar-img" />
            {:else}
              <div class="avatar-placeholder">{(data.contact?.name ?? data.user?.displayName ?? '?')[0].toUpperCase()}</div>
            {/if}
          </div>
          <div class="avatar-actions">
            <label class="btn-secondary avatar-btn" class:disabled={avatarUploading}>
              {avatarUploading ? 'Uploading…' : 'Change photo'}
              <input type="file" accept="image/*" onchange={uploadAvatar} style="display:none" disabled={avatarUploading} />
            </label>
            {#if avatarError}
              <span class="avatar-error">{avatarError}</span>
            {/if}
          </div>
        </div>

        {#if guestError}
          <div class="error-banner">{guestError}</div>
        {/if}
        <div class="form">
          <label>
            Name
            <input type="text" bind:value={guestName} maxlength="200" placeholder="Your name" />
          </label>
          <label>
            Email
            <input type="email" bind:value={guestEmail} placeholder="you@example.com" />
          </label>
          <label>
            Vibe <span class="char-count">{guestVibe.length}/80</span>
            <input type="text" bind:value={guestVibe} maxlength="80" placeholder="e.g. ready to party" />
          </label>
          <label>
            About me <span class="char-count">{guestBio.length}/200</span>
            <textarea bind:value={guestBio} maxlength="200" rows="3" placeholder="A few words about you…"></textarea>
          </label>
          <label>
            Phone (optional)
            <input type="tel" bind:value={guestPhone} placeholder="+1 555 000 0000" />
          </label>
          <label>
            Instagram (optional)
            <input type="text" bind:value={guestInstagram} placeholder="@handle" />
          </label>
          <div class="form-actions">
            <button onclick={saveGuestIdentity} disabled={guestSaving} class="btn-primary" class:btn-saved={guestSuccess}>
              {guestSaving ? 'Saving…' : guestSuccess ? 'Saved ✓' : 'Save identity'}
            </button>
          </div>
        </div>
      </section>
    {/if}

    <section class="card">
      <h2>Change password</h2>

      {#if passwordError}
        <div class="error-banner">{passwordError}</div>
      {/if}
      <div class="form">
        <label>
          Current password
          <input type="password" bind:value={currentPassword} autocomplete="current-password" />
        </label>
        <label>
          New password
          <input type="password" bind:value={newPassword} autocomplete="new-password" />
          <span class="hint">Minimum 8 characters.</span>
        </label>
        <label>
          Confirm new password
          <input type="password" bind:value={confirmPassword} autocomplete="new-password" />
        </label>
        <div class="form-actions">
          <button onclick={changePassword} disabled={passwordSaving} class="btn-primary" class:btn-saved={passwordSuccess}>
            {passwordSaving ? 'Saving…' : passwordSuccess ? 'Saved ✓' : 'Change password'}
          </button>
        </div>
      </div>
    </section>

    <section class="card danger-zone">
      <h2>Danger zone</h2>
      <p class="danger-text">Deleting your account is permanent. All your data will be removed.</p>

      {#if deleteError}
        <div class="error-banner">{deleteError}</div>
      {/if}

      <div class="form">
        <label>
          Type <strong>{data.user?.email}</strong> to confirm
          <input type="text" bind:value={deleteConfirm} autocomplete="off" />
        </label>
        <div class="form-actions">
          <button onclick={deleteAccount} disabled={deleting || deleteConfirm !== data.user?.email} class="btn-danger">
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </section>
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 560px; margin: 0 auto; }
  h1 { margin: 0 0 1.5rem; color: #1a1510; }
  .card {
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  h2 { margin: 0 0 1rem; font-size: 1rem; color: #1a1510; }
  .profile-fields {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.5rem 1rem;
    margin: 0 0 1rem;
  }
  dt { font-size: 0.85rem; color: #6b6058; font-weight: 500; padding: 0.125rem 0; }
  dd { margin: 0; font-size: 0.9rem; color: #1a1510; padding: 0.125rem 0; }
  .role { text-transform: capitalize; }
  .form { display: flex; flex-direction: column; gap: 0.75rem; }
  label { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  label > input, label > textarea { flex: 1 1 100%; margin-top: 0; }
  .hint { font-size: 0.775rem; font-weight: 400; color: #6b6058; }
  input { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .form-actions { display: flex; gap: 0.75rem; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.5rem 1.125rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary.btn-saved { background: #2a5e28; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.625rem 0.875rem; margin-bottom: 0.75rem; font-size: 0.875rem; }
  .section-hint { margin: 0 0 1rem; font-size: 0.85rem; color: #6b6058; line-height: 1.4; }
  .warn-banner { background: #fef4e0; color: #7a5a1a; border: 1px solid #e0c870; border-radius: 8px; padding: 0.625rem 0.875rem; margin-bottom: 0.75rem; font-size: 0.875rem; }
  .danger-zone { border-color: #e8b4a0; }
  .danger-zone h2 { color: #7a2a1a; }
  .danger-text { margin: 0 0 1rem; font-size: 0.875rem; color: #6b6058; }
  .btn-danger { background: #8b3016; color: #fff; border: none; padding: 0.5rem 1.125rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #6e2010; }
  .btn-danger:disabled { opacity: 0.45; cursor: not-allowed; }
  textarea { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; resize: vertical; }
  textarea:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .char-count { font-size: 0.75rem; font-weight: 400; color: #9a8e84; margin-left: auto; }
  .avatar-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .avatar-preview { flex-shrink: 0; }
  .avatar-img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #cfc3b0; }
  .avatar-placeholder { width: 64px; height: 64px; border-radius: 50%; background: #d4c4b0; border: 2px solid #cfc3b0; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #6b5a48; }
  .avatar-actions { display: flex; flex-direction: column; gap: 0.375rem; }
  .btn-secondary { display: inline-block; background: #e8ddd2; color: #3d352e; border: 1px solid #c8bdb0; padding: 0.375rem 0.875rem; border-radius: 8px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
  .btn-secondary:hover:not(.disabled) { background: #ddd0c3; }
  .btn-secondary.disabled { opacity: 0.6; cursor: not-allowed; }
  .avatar-btn { line-height: 1.4; }
  .avatar-error { font-size: 0.8rem; color: #8b3016; }
</style>
