<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form } = $props<{ data: PageData; form: ActionData }>()
  let loading = $state(false)
</script>

<main class="page">
  <div class="container">
    <a href="/dashboard" class="back">← Back to dashboard</a>
    <h1>New Event</h1>

    {#if form?.error}
      <div class="error-banner">{form.error}</div>
    {/if}

    <form class="card" method="POST" use:enhance={() => { loading = true; return async ({ update }) => { loading = false; await update() } }}>
      <label>
        Event title *
        <input type="text" name="title" required maxlength="200" placeholder="Birthday party, company off-site…" />
      </label>
      <label>
        Description
        <textarea name="description" rows="4" placeholder="Details about the event…"></textarea>
      </label>
      <label>
        Location
        <input type="text" name="location" maxlength="500" placeholder="Address or venue name" />
      </label>
      <div class="row">
        <label>
          Start *
          <input type="datetime-local" name="startsAt" required />
        </label>
        <label>
          End
          <input type="datetime-local" name="endsAt" />
        </label>
      </div>
      <label>
        Timezone
        <select name="timezone">
          <option value="UTC">UTC</option>
          <option value="America/New_York">Eastern (ET)</option>
          <option value="America/Chicago">Central (CT)</option>
          <option value="America/Denver">Mountain (MT)</option>
          <option value="America/Los_Angeles">Pacific (PT)</option>
          <option value="Europe/London">London (GMT)</option>
          <option value="Europe/Paris">Paris (CET)</option>
          <option value="Europe/Bucharest">Bucharest (EET)</option>
          <option value="Asia/Tokyo">Tokyo (JST)</option>
          <option value="Australia/Sydney">Sydney (AEST)</option>
        </select>
      </label>
      <label>
        Theme
        <select name="theme">
          <option value="">Default (warm)</option>
          <option value="forest">Forest (green)</option>
          <option value="ocean">Ocean (blue)</option>
          <option value="sunset">Sunset (red)</option>
        </select>
      </label>
      <button type="submit" class="btn-primary" disabled={loading}>
        {loading ? 'Creating…' : 'Create event'}
      </button>
    </form>
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 560px; margin: 0 auto; }
  .back { font-size: 0.875rem; color: #6b6058; text-decoration: none; display: block; margin-bottom: 1rem; }
  .back:hover { color: #b05525; }
  h1 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1a1510; }
  .card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input, textarea, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus, select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .btn-primary { background: #b05525; color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; }
  .btn-primary:hover:not(:disabled) { background: #924418; }
  .btn-primary:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
</style>
