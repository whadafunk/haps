<script lang="ts">
  import { api, ApiError } from '$lib/api'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'

  let status = $state<'loading' | 'error'>('loading')
  let error = $state('')

  onMount(async () => {
    const token = $page.url.searchParams.get('token')
    if (!token) {
      status = 'error'
      error = 'No token found in the link.'
      return
    }
    try {
      await api.verifyMagicLink(token)
      goto('/my-events', { invalidateAll: true })
    } catch (e: unknown) {
      status = 'error'
      error = e instanceof ApiError ? e.message : 'This link is invalid or has expired.'
    }
  })
</script>

<main class="page">
  <div class="container">
    {#if status === 'loading'}
      <p class="verifying">Verifying your link…</p>
    {:else}
      <div class="error-box">
        <h1>Link expired</h1>
        <p>{error}</p>
        <a href="/magic-link" class="btn-primary">Request a new link</a>
      </div>
    {/if}
  </div>
</main>

<style>
  .page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .container { max-width: 400px; width: 100%; text-align: center; }
  .verifying { color: #6b6058; font-size: 1rem; }
  .error-box { background: #fdf2ee; border: 1px solid #f0c8b8; border-radius: 12px; padding: 1.5rem; }
  .error-box h1 { margin: 0 0 0.75rem; color: #8b3016; font-size: 1.25rem; }
  .error-box p { margin: 0 0 1.25rem; color: #3d352e; font-size: 0.9rem; }
  .btn-primary { display: inline-block; background: #b05525; color: #fff; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; }
  .btn-primary:hover { background: #924418; }
</style>
