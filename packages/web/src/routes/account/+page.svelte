<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { goto, invalidateAll } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  // Profile form
  let displayName = $state(data.user?.displayName ?? '')
  let profileSaving = $state(false)
  let profileError = $state('')
  let profileSuccess = $state(false)

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
      await invalidateAll()
    } catch (e: unknown) {
      profileError = e instanceof ApiError ? e.message : 'Failed to update profile.'
    } finally {
      profileSaving = false
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
      {#if profileSuccess}
        <div class="success-banner">Profile updated.</div>
      {/if}

      <div class="form">
        <label>
          Display name
          <input type="text" bind:value={displayName} maxlength="200" />
        </label>
        <div class="form-actions">
          <button onclick={saveProfile} disabled={profileSaving} class="btn-primary">
            {profileSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Change password</h2>

      {#if passwordError}
        <div class="error-banner">{passwordError}</div>
      {/if}
      {#if passwordSuccess}
        <div class="success-banner">Password changed successfully.</div>
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
          <button onclick={changePassword} disabled={passwordSaving} class="btn-primary">
            {passwordSaving ? 'Saving…' : 'Change password'}
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
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .hint { font-size: 0.775rem; font-weight: 400; color: #6b6058; }
  input { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .form-actions { display: flex; gap: 0.75rem; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.5rem 1.125rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.625rem 0.875rem; margin-bottom: 0.75rem; font-size: 0.875rem; }
  .success-banner { background: #edf4ec; color: #2d5a2a; border: 1px solid #b8d9b4; border-radius: 8px; padding: 0.625rem 0.875rem; margin-bottom: 0.75rem; font-size: 0.875rem; }
  .danger-zone { border-color: #e8b4a0; }
  .danger-zone h2 { color: #7a2a1a; }
  .danger-text { margin: 0 0 1rem; font-size: 0.875rem; color: #6b6058; }
  .btn-danger { background: #8b3016; color: #fff; border: none; padding: 0.5rem 1.125rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #6e2010; }
  .btn-danger:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
