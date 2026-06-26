<script lang="ts">
  import type { PageData } from './$types'

  let { data } = $props<{ data: PageData }>()

  const cfg = $state({ ...data.config })
  let smtpPass = $state('')
  let showPass = $state(false)
  let showUser = $state(false)
  let saving = $state(false)
  let saveError = $state('')
  let saveSuccess = $state(false)
  let testLoading = $state(false)
  let testResult = $state<{ ok: boolean; message: string } | null>(null)

  async function save() {
    saving = true
    saveError = ''
    saveSuccess = false
    testResult = null
    try {
      const body: Record<string, unknown> = {
        instanceName:              cfg.instanceName,
        smtpHost:                  cfg.smtpHost || null,
        smtpPort:                  cfg.smtpPort,
        smtpUser:                  cfg.smtpUser || null,
        smtpFrom:                  cfg.smtpFrom || null,
        defaultTheme:              cfg.defaultTheme || null,
        requireRsvpBeforeRegister: cfg.requireRsvpBeforeRegister,
      }
      if (smtpPass) body['smtpPass'] = smtpPass

      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        saveError = err?.error?.message ?? 'Save failed.'
        return
      }
      const updated = await res.json()
      cfg.smtpConfigured = updated.config.smtpConfigured
      saveSuccess = true
      smtpPass = ''
      setTimeout(() => { saveSuccess = false }, 2500)
    } finally {
      saving = false
    }
  }

  async function sendTestEmail() {
    testLoading = true
    testResult = null
    try {
      const res = await fetch('/api/admin/config/test-email', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        testResult = { ok: true, message: 'Test email sent — check your admin inbox.' }
      } else {
        const body = await res.json().catch(() => null)
        const msg = body?.error?.message ?? `SMTP error (${res.status})`
        testResult = { ok: false, message: msg }
      }
    } catch (e: any) {
      testResult = { ok: false, message: `Network error: ${e?.message ?? 'unknown'}` }
    } finally {
      testLoading = false
    }
  }
</script>

<div class="config-page">
  <h1>Instance Config</h1>

  {#if saveError}
    <div class="error-banner">{saveError}</div>
  {/if}

  <section class="card">
    <h2>General</h2>
    <div class="form">
      <label>
        Instance name
        <input type="text" bind:value={cfg.instanceName} maxlength="100" />
      </label>
      <label>
        Default event theme
        <select bind:value={cfg.defaultTheme}>
          <option value="">Default (warm)</option>
          <option value="forest">Forest (green)</option>
          <option value="ocean">Ocean (blue)</option>
          <option value="sunset">Sunset (red)</option>
        </select>
      </label>
      <label class="toggle-row">
        <span class="toggle-label">
          Require event RSVP before registration
          <span class="toggle-hint">When enabled, guests must RSVP to at least one event before creating an account.</span>
        </span>
        <input type="checkbox" bind:checked={cfg.requireRsvpBeforeRegister} />
      </label>
    </div>
  </section>

  <section class="card">
    <h2>SMTP (outbound email)</h2>
    <p class="hint">Used for blasts, invitations, magic links, and system notifications. Requires at least host and port. Authentication is optional — leave username and password blank for open relays.</p>
    <div class="form">
      <div class="row">
        <label>
          Host
          <input type="text" bind:value={cfg.smtpHost} placeholder="smtp.example.com" />
        </label>
        <label>
          Port
          <input type="number" bind:value={cfg.smtpPort} min="1" max="65535" style="width:90px" />
        </label>
      </div>
      <label>
        From address
        <input type="text" bind:value={cfg.smtpFrom} placeholder="Haps <no-reply@example.com>" />
      </label>
      <label>
        Username <span class="optional">(optional)</span>
        <div class="input-reveal">
          {#if showUser}
            <input type="text" bind:value={cfg.smtpUser} placeholder="user@example.com" autocomplete="off" />
          {:else}
            <input type="password" bind:value={cfg.smtpUser} placeholder="user@example.com" autocomplete="off" />
          {/if}
          <button type="button" class="reveal-btn" onclick={() => showUser = !showUser}>{showUser ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      <label>
        Password <span class="optional">(optional)</span>
        <div class="input-reveal">
          {#if showPass}
            <input type="text" bind:value={smtpPass} placeholder={cfg.smtpConfigured ? '(leave blank to keep current)' : ''} autocomplete="new-password" />
          {:else}
            <input type="password" bind:value={smtpPass} placeholder={cfg.smtpConfigured ? '(leave blank to keep current)' : ''} autocomplete="new-password" />
          {/if}
          <button type="button" class="reveal-btn" onclick={() => showPass = !showPass}>{showPass ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      <div class="smtp-footer">
        <div class="smtp-status">
          Status:
          {#if cfg.smtpConfigured}
            <span class="badge badge-ok">Configured</span>
          {:else}
            <span class="badge badge-off">Not configured</span>
          {/if}
        </div>
        {#if cfg.smtpConfigured}
          <button type="button" class="btn-test" onclick={sendTestEmail} disabled={testLoading}>
            {testLoading ? 'Sending…' : 'Send test email'}
          </button>
        {/if}
      </div>
      {#if testResult}
        <div class="test-result" class:test-ok={testResult.ok} class:test-err={!testResult.ok}>
          {testResult.message}
        </div>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>Storage</h2>
    <p class="hint">Storage type is set via the <code>STORAGE_TYPE</code> environment variable and cannot be changed here.</p>
    <div class="storage-row">
      <span>Type:</span>
      <span class="badge">{cfg.storageType}</span>
    </div>
  </section>

  <button class="btn-primary" class:btn-saved={saveSuccess} onclick={save} disabled={saving}>
    {saving ? 'Saving…' : saveSuccess ? 'Saved ✓' : 'Save changes'}
  </button>
</div>

<style>
  .config-page { max-width: 600px; }
  h1 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1a1510; }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  h2 { margin: 0 0 0.5rem; font-size: 1rem; color: #1a1510; }
  .hint { margin: 0 0 1rem; font-size: 0.8rem; color: #6b6058; }
  .form { display: flex; flex-direction: column; gap: 0.75rem; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: end; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  .optional { font-weight: 400; font-size: 0.8rem; color: #7a6e64; }
  input, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus, select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .input-reveal { display: flex; gap: 0.5rem; align-items: center; }
  .input-reveal input { flex: 1; min-width: 0; }
  .reveal-btn { background: none; border: 1px solid #c8bdb0; border-radius: 6px; padding: 0.4rem 0.65rem; font-size: 0.8rem; color: #6b6058; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .reveal-btn:hover { background: #ede8e0; }
  .smtp-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .smtp-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #3d352e; }
  .storage-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #3d352e; }
  .badge { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .badge-ok  { background: #e8f4e4; color: #2a5e28; }
  .badge-off { background: #ede8e0; color: #6b6058; }
  .btn-test { background: none; border: 1px solid #b05525; color: #b05525; border-radius: 6px; padding: 0.375rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-test:hover:not(:disabled) { background: #fdf2ee; }
  .btn-test:disabled { opacity: 0.6; }
  .test-result { font-size: 0.825rem; padding: 0.5rem 0.75rem; border-radius: 6px; }
  .test-ok  { background: #e8f4e4; color: #2a5e28; border: 1px solid #9dbf9d; }
  .test-err { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; }
  code { background: #e8ddd0; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.8rem; }
  .toggle-row { flex-direction: row; align-items: center; justify-content: space-between; gap: 1rem; }
  .toggle-label { display: flex; flex-direction: column; gap: 0.2rem; }
  .toggle-hint { font-size: 0.775rem; font-weight: 400; color: #6b6058; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.625rem 1.5rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; }
  .btn-primary.btn-saved { background: #2a5e28; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }
</style>
