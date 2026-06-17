<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form } = $props<{ data: PageData; form: ActionData }>()

  let editingIdentity = $state(false)
  let identityLoading = $state(false)
  let clearConfirm = $state(false)

  $effect(() => {
    if (form?.updated) editingIdentity = false
  })
</script>

<main class="home">
  <div class="hero">
    <h1>Welcome to Haps</h1>
    <p class="tagline">The simple, private way to plan events and collect RSVPs — no account required for your guests.</p>

    {#if data.session}
      <div class="identity-card">
        <div class="identity-header">
          <span class="identity-label">Your session identity</span>
          {#if !editingIdentity}
            <button class="link-btn" onclick={() => (editingIdentity = true)}>Edit</button>
          {/if}
        </div>

        {#if editingIdentity}
          <form
            method="POST"
            action="?/updateIdentity"
            use:enhance={() => {
              identityLoading = true
              return async ({ update }) => { identityLoading = false; await update() }
            }}
          >
            {#if form?.error}
              <p class="form-error">{form.error}</p>
            {/if}
            <div class="field">
              <label for="displayName">Name</label>
              <input id="displayName" name="displayName" type="text" value={data.session.displayName ?? ''} required maxlength="200" />
            </div>
            <div class="field">
              <label for="email">Email <span class="optional">(optional)</span></label>
              <input id="email" name="email" type="email" value={data.session.email ?? ''} maxlength="200" />
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-save" disabled={identityLoading}>
                {identityLoading ? 'Saving…' : 'Save'}
              </button>
              <button type="button" class="link-btn" onclick={() => (editingIdentity = false)}>Cancel</button>
            </div>
          </form>
        {:else}
          <dl class="identity-fields">
            <div class="identity-row">
              <dt>Name</dt>
              <dd>{data.session.displayName ?? '—'}</dd>
            </div>
            <div class="identity-row">
              <dt>Email</dt>
              <dd>{data.session.email ?? '—'}</dd>
            </div>
          </dl>
          <div class="identity-footer">
            {#if clearConfirm}
              <span class="clear-confirm-text">This will erase your session and event history from this browser.</span>
              <a href="/clear-identity" class="btn-clear-confirm" data-sveltekit-reload>Yes, clear it</a>
              <button class="link-btn" onclick={() => (clearConfirm = false)}>Cancel</button>
            {:else}
              <button class="btn-clear" onclick={() => (clearConfirm = true)}>Clear identity</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="actions">
      <a href="/register" class="btn-primary">Create a free account</a>
      <a href="/login" class="btn-secondary">Log in</a>
    </div>

    <ul class="perks">
      <li>Keep your event history across all your devices</li>
      <li>Never lose your invite links</li>
      <li>Get notified about upcoming events</li>
    </ul>
  </div>
</main>

<style>
  .home {
    min-height: calc(100vh - 56px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }
  .hero {
    text-align: center;
    max-width: 480px;
    width: 100%;
  }
  .hero h1 {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 0.5rem;
    color: #1a1510;
  }
  .tagline {
    color: #6b6058;
    margin: 0 0 1.75rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 2rem;
  }
  .btn-primary {
    background: #b05525;
    color: #fff;
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .btn-primary:hover { background: #924418; }
  .btn-secondary {
    background: transparent;
    color: #3d352e;
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    border: 1px solid #cfc3b0;
  }
  .btn-secondary:hover { border-color: #b05525; color: #b05525; }
  .perks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
  }
  .perks li {
    font-size: 0.9rem;
    color: #3d352e;
    padding-left: 1.25rem;
    position: relative;
  }
  .perks li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: #b05525;
    font-weight: 700;
  }

  /* Identity card */
  .identity-card {
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
    text-align: left;
  }
  .identity-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .identity-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b6058;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .identity-fields { margin: 0; }
  .identity-row {
    display: flex;
    gap: 1rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid #dfd4c4;
    font-size: 0.875rem;
  }
  .identity-row:last-child { border-bottom: none; }
  .identity-row dt { width: 4rem; color: #6b6058; flex-shrink: 0; }
  .identity-row dd { margin: 0; color: #1a1510; }
  .identity-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-top: 0.625rem;
    margin-top: 0.625rem;
    border-top: 1px solid #dfd4c4;
    flex-wrap: wrap;
  }
  .clear-confirm-text { font-size: 0.8rem; color: #7a2a1a; flex: 1; min-width: 180px; }

  /* Form inside identity card */
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.625rem; }
  .field label { font-size: 0.8rem; font-weight: 500; color: #6b6058; }
  .optional { font-weight: 400; }
  .field input {
    padding: 0.4rem 0.625rem;
    border: 1px solid #c8bdb0;
    border-radius: 6px;
    font-size: 0.875rem;
    background: #fff;
    color: #1a1510;
  }
  .field input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .form-error { color: #8b3016; font-size: 0.8rem; margin: 0 0 0.5rem; }
  .form-actions { display: flex; align-items: center; gap: 0.75rem; }

  /* Buttons */
  .link-btn { background: none; border: none; font-family: inherit; font-size: 0.8rem; color: #b05525; cursor: pointer; padding: 0; }
  .link-btn:hover { color: #924418; }
  .btn-save {
    background: #b05525;
    color: #fff;
    border: none;
    padding: 0.375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-save:hover:not(:disabled) { background: #924418; }
  .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-clear { background: none; border: none; font-family: inherit; font-size: 0.8rem; color: #8b3016; cursor: pointer; padding: 0; }
  .btn-clear:hover { color: #7a2a1a; text-decoration: underline; }
  .btn-clear-confirm {
    background: #8b3016;
    color: #fff;
    text-decoration: none;
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .btn-clear-confirm:hover { background: #7a2a1a; color: #fff; }
</style>
