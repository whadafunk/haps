<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { goto } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  let email = $state(data.session?.email ?? '')
  let password = $state('')
  let confirmPassword = $state('')
  let displayName = $state(data.session?.displayName ?? '')
  let loading = $state(false)
  let error = $state('')
  let noHistory = $state(false)

  async function submit() {
    error = ''
    noHistory = false
    if (!email || !password || !displayName) { error = 'All fields are required.'; return }
    if (password !== confirmPassword) { error = 'Passwords do not match.'; return }
    if (password.length < 8) { error = 'Password must be at least 8 characters.'; return }
    loading = true
    try {
      await api.register({ email, password, displayName })
      goto('/my-events', { invalidateAll: true })
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'NO_EVENT_HISTORY') { noHistory = true; return }
      error = e instanceof ApiError ? e.message : 'Registration failed. Please try again.'
    } finally {
      loading = false
    }
  }
</script>

<main class="page">
  <div class="container">
    <h1>Create account</h1>
    <p class="subtitle">Keep your event history across devices.</p>

    {#if noHistory}
      <div class="no-history-banner">
        <strong>No event history yet.</strong>
        <p>RSVP to at least one event first — then come back here to lock in your account.</p>
      </div>
    {:else if error}
      <div class="error-banner">{error}</div>
    {/if}

    <form class="form" onsubmit={(e) => { e.preventDefault(); submit() }}>
      <label>
        Display name
        <input type="text" bind:value={displayName} autocomplete="name" maxlength="200" required />
      </label>
      <label>
        Email
        <input type="email" bind:value={email} autocomplete="email" required />
      </label>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="new-password" minlength="8" required />
        <span class="hint">Minimum 8 characters.</span>
      </label>
      <label>
        Confirm password
        <input type="password" bind:value={confirmPassword} autocomplete="new-password" required />
      </label>
      <button type="submit" disabled={loading} class="btn-primary">
        {loading ? 'Creating account…' : 'Create account'}
      </button>
    </form>

    <p class="footer-link">Already have an account? <a href="/login">Log in</a></p>
  </div>
</main>

<style>
  .page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .container { max-width: 400px; width: 100%; }
  h1 { margin: 0 0 0.25rem; color: #1a1510; font-size: 1.5rem; }
  .subtitle { margin: 0 0 1.5rem; color: #6b6058; font-size: 0.9rem; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }
  .no-history-banner { background: #fef4e0; color: #7a5a1a; border: 1px solid #e0c870; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.875rem; line-height: 1.5; }
  .no-history-banner strong { display: block; margin-bottom: 0.25rem; }
  .no-history-banner p { margin: 0; }
  .form { display: flex; flex-direction: column; gap: 0.875rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .hint { font-size: 0.775rem; font-weight: 400; color: #6b6058; }
  input { padding: 0.625rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.75rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.25rem; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .footer-link { margin: 1.25rem 0 0; text-align: center; font-size: 0.875rem; color: #6b6058; }
  .footer-link a { color: #b05525; text-decoration: none; font-weight: 500; }
  .footer-link a:hover { text-decoration: underline; }
</style>
