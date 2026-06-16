<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import { goto } from '$app/navigation'

  let { data } = $props<{ data: PageData }>()

  const hasSessionHistory = $derived(!!data.session?.displayName)

  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function submit(skipMerge: boolean) {
    error = ''
    if (!email || !password) { error = 'Email and password are required.'; return }
    loading = true
    try {
      const { user } = await api.login(email, password, skipMerge)
      goto(user.type === 'guest' ? '/my-events' : '/dashboard', { invalidateAll: true })
    } catch (e: unknown) {
      error = e instanceof ApiError ? e.message : 'Login failed. Please try again.'
    } finally {
      loading = false
    }
  }
</script>

<main class="page">
  <div class="container">
    <h1>Log in</h1>
    <p class="subtitle">Welcome back.</p>

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    {#if hasSessionHistory}
      <div class="merge-notice">
        This browser has event history under <strong>{data.session!.displayName}</strong>.
        You can merge it into your account or start fresh.
      </div>
    {/if}

    <form class="form" onsubmit={(e) => e.preventDefault()}>
      <label>
        Email
        <input type="email" bind:value={email} autocomplete="email" required />
      </label>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      {#if hasSessionHistory}
        <div class="btn-row">
          <button type="button" onclick={() => submit(false)} disabled={loading} class="btn-primary">
            {loading ? 'Logging in…' : 'Log in and merge'}
          </button>
          <button type="button" onclick={() => submit(true)} disabled={loading} class="btn-secondary">
            Log in without merging
          </button>
        </div>
      {:else}
        <button type="submit" onclick={() => submit(false)} disabled={loading} class="btn-primary">
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      {/if}
    </form>

    <p class="footer-link">No account yet? <a href="/register">Create one</a></p>
    <p class="footer-link">Forgot your password? <a href="/magic-link">Sign in with email link</a></p>
  </div>
</main>

<style>
  .page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .container { max-width: 400px; width: 100%; }
  h1 { margin: 0 0 0.25rem; color: #1a1510; font-size: 1.5rem; }
  .subtitle { margin: 0 0 1.5rem; color: #6b6058; font-size: 0.9rem; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }
  .merge-notice { background: #fef4e0; color: #7a5a1a; border: 1px solid #e0c870; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.875rem; line-height: 1.5; }
  .form { display: flex; flex-direction: column; gap: 0.875rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input { padding: 0.625rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .btn-row { display: flex; flex-direction: column; gap: 0.5rem; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.75rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.25rem; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary { background: transparent; color: #6b6058; border: 1px solid #c8bdb0; padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; }
  .btn-secondary:hover:not(:disabled) { border-color: #9a8f86; color: #3d352e; }
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .footer-link { margin: 1.25rem 0 0; text-align: center; font-size: 0.875rem; color: #6b6058; }
  .footer-link a { color: #b05525; text-decoration: none; font-weight: 500; }
  .footer-link a:hover { text-decoration: underline; }
</style>
