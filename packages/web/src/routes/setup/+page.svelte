<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form } = $props<{ data: PageData; form: ActionData }>()
  let loading = $state(false)
</script>

<main class="page">
  <div class="card">
    <h1>Set up Haps</h1>
    <p class="subtitle">Create your admin account to get started.</p>

    {#if form?.error}
      <div class="error-banner">{form.error}</div>
    {/if}

    <form method="POST" use:enhance={() => { loading = true; return async ({ update }) => { loading = false; await update() } }}>
      <label>
        Display name
        <input type="text" name="displayName" required autocomplete="name" />
      </label>
      <label>
        Email
        <input type="email" name="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input type="password" name="password" required minlength="8" autocomplete="new-password" />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? 'Setting up…' : 'Create admin account'}
      </button>
    </form>
  </div>
</main>

<style>
  .page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 2rem; width: 100%; max-width: 400px; }
  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; color: #1a1510; }
  .subtitle { color: #6b6058; margin: 0 0 1.5rem; font-size: 0.9rem; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  form { display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; background: #fff; color: #1a1510; }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  button { background: #b05525; color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; }
  button:hover:not(:disabled) { background: #924418; }
  button:disabled { opacity: 0.6; }
</style>
