<script lang="ts">
  import { api, ApiError } from '$lib/api'

  let email = $state('')
  let loading = $state(false)
  let sent = $state(false)
  let error = $state('')

  async function submit() {
    error = ''
    if (!email) { error = 'Email is required.'; return }
    loading = true
    try {
      await api.requestMagicLink(email)
      sent = true
    } catch (e: unknown) {
      error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
    } finally {
      loading = false
    }
  }
</script>

<main class="page">
  <div class="container">
    {#if sent}
      <div class="sent-box">
        <h1>Check your email</h1>
        <p>If an account exists for <strong>{email}</strong>, we've sent a sign-in link. It expires in 15 minutes.</p>
        <p class="note">Don't see it? Check your spam folder, or <button class="link-btn" onclick={() => { sent = false }}>try again</button>.</p>
      </div>
    {:else}
      <h1>Sign in with email</h1>
      <p class="subtitle">We'll send a one-time link to your inbox — no password needed.</p>

      {#if error}
        <div class="error-banner">{error}</div>
      {/if}

      <form class="form" onsubmit={(e) => { e.preventDefault(); submit() }}>
        <label>
          Email address
          <input type="email" bind:value={email} autocomplete="email" placeholder="you@example.com" required />
        </label>
        <button type="submit" disabled={loading} class="btn-primary">
          {loading ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>

      <p class="footer-link">Know your password? <a href="/login">Log in</a></p>
    {/if}
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
  .sent-box { background: #f0f8ee; border: 1px solid #9cbb9c; border-radius: 12px; padding: 1.5rem; }
  .sent-box h1 { margin: 0 0 0.75rem; }
  .sent-box p { margin: 0 0 0.75rem; color: #3d352e; font-size: 0.9rem; line-height: 1.5; }
  .sent-box p:last-child { margin-bottom: 0; }
  .note { color: #6b6058 !important; font-size: 0.85rem !important; }
  .link-btn { background: none; border: none; padding: 0; color: #b05525; font-size: inherit; font-family: inherit; font-weight: 500; cursor: pointer; text-decoration: underline; }
</style>
