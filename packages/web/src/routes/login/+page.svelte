<script lang="ts">
  import { api, ApiError } from '$lib/api'
  import { goto } from '$app/navigation'

  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function submit() {
    error = ''
    if (!email || !password) { error = 'Email and password are required.'; return }
    loading = true
    try {
      const { user } = await api.login(email, password)
      goto(user.role === 'member' ? '/my-events' : '/dashboard')
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

    <form class="form" onsubmit={(e) => { e.preventDefault(); submit() }}>
      <label>
        Email
        <input type="email" bind:value={email} autocomplete="email" required />
      </label>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button type="submit" disabled={loading} class="btn-primary">
        {loading ? 'Logging in…' : 'Log in'}
      </button>
    </form>

    <p class="footer-link">No account yet? <a href="/register">Create one</a></p>
  </div>
</main>

<style>
  .page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .container { max-width: 400px; width: 100%; }
  h1 { margin: 0 0 0.25rem; color: #1a1510; font-size: 1.5rem; }
  .subtitle { margin: 0 0 1.5rem; color: #6b6058; font-size: 0.9rem; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }
  .form { display: flex; flex-direction: column; gap: 0.875rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input { padding: 0.625rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.75rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.25rem; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .footer-link { margin: 1.25rem 0 0; text-align: center; font-size: 0.875rem; color: #6b6058; }
  .footer-link a { color: #b05525; text-decoration: none; font-weight: 500; }
  .footer-link a:hover { text-decoration: underline; }
</style>
