<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form } = $props<{ data: PageData; form: ActionData }>()
  let loading = $state(false)
  let selectedTheme = $state('')
  let selectedType = $state<'open' | 'invite_only'>('open')
  let allowPlusOnes = $state(false)
  let hasDeadline = $state(false)
  let dateError = $state('')

  const THEMES: Record<string, Record<string, string>> = {
    forest: {
      '--accent': '#2d6e30', '--accent-hover': '#1f5022',
      '--card-bg': '#e4efe0', '--border': '#9cbb9c',
    },
    ocean: {
      '--accent': '#1a5fa8', '--accent-hover': '#124480',
      '--card-bg': '#dce8f6', '--border': '#9cb8d8',
    },
    sunset: {
      '--accent': '#c03828', '--accent-hover': '#9e2820',
      '--card-bg': '#f4ddd8', '--border': '#d8a898',
    },
  }

  function themeStyle(theme: string): string {
    const vars = THEMES[theme] ?? {}
    return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ')
  }
</script>

<main class="page">
  <div class="container">
    <a href="/dashboard" class="back">← Back to dashboard</a>
    <h1>New Event</h1>

    {#if form?.error || dateError}
      <div class="error-banner">{dateError || form?.error}</div>
    {/if}

    <form class="card" method="POST" style={themeStyle(selectedTheme)} use:enhance={({ cancel, formData }) => {
      const d = formData.get('eventDate')?.toString() ?? ''
      const t = formData.get('eventTime')?.toString() ?? ''
      if (d && t && new Date(`${d}T${t}`) <= new Date()) {
        dateError = 'Event start date must be in the future.'
        cancel()
        return
      }
      dateError = ''
      loading = true
      return async ({ update }) => { loading = false; await update() }
    }}>
      <fieldset class="type-fieldset">
        <legend>Event type *</legend>
        <label class="type-option">
          <input type="radio" name="eventType" value="open" checked={selectedType === 'open'} onchange={() => selectedType = 'open'} />
          <div class="type-option-body">
            <span class="type-name">Open</span>
            <span class="type-desc">Anyone with the invite link can RSVP</span>
          </div>
        </label>
        <label class="type-option">
          <input type="radio" name="eventType" value="invite_only" checked={selectedType === 'invite_only'} onchange={() => selectedType = 'invite_only'} />
          <div class="type-option-body">
            <span class="type-name">Invite-only</span>
            <span class="type-desc">Generate personal invite links for each guest</span>
          </div>
        </label>
      </fieldset>

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
        <textarea name="location" rows="3" maxlength="2000" placeholder="Address, venue, parking info, transport options…"></textarea>
      </label>
      <label>
        Coordinates / map link
        <input type="text" name="coordinates" maxlength="500" placeholder="Google Maps, Waze link, or lat,lng…" />
      </label>
      <label>
        Dress code
        <input type="text" name="dressCode" maxlength="200" placeholder="Smart casual, black tie…" />
      </label>
      <label>
        Date *
        <input type="date" name="eventDate" required min={new Date().toISOString().split('T')[0]} />
      </label>
      <label>
        Time *
        <input type="time" name="eventTime" required />
      </label>
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
        Max capacity
        <input type="number" name="maxCapacity" min="1" placeholder="Unlimited" />
        <span class="field-hint">Leave blank for no limit</span>
      </label>
      <div class="deadline-section">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={hasDeadline} />
          Set RSVP deadline
        </label>
        {#if hasDeadline}
          <label>
            RSVP closes on
            <input type="date" name="rsvpDeadline" />
          </label>
        {/if}
      </div>
      <div class="plus-ones-section">
        <label class="checkbox-label">
          <input type="checkbox" name="allowPlusOnes" bind:checked={allowPlusOnes} />
          Allow plus ones
        </label>
        {#if allowPlusOnes}
          <label>
            Max plus ones per guest
            <select name="maxPlusOnes">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
        {/if}
      </div>
      <label>
        Theme
        <select name="theme" bind:value={selectedTheme}>
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
  .card { background: var(--card-bg, #f0e8da); border: 1px solid var(--border, #cfc3b0); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; transition: background 0.2s, border-color 0.2s; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input, textarea, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  textarea { resize: vertical; }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent, #b05525); outline-offset: -1px; }
  .btn-primary { background: var(--accent, #b05525); color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; transition: background 0.2s; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover, #924418); }
  .btn-primary:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
  .deadline-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .plus-ones-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .checkbox-label { display: flex; flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
  .type-fieldset { border: 1px solid #c8bdb0; border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .type-fieldset legend { font-size: 0.875rem; font-weight: 500; color: #3d352e; padding: 0 0.25rem; }
  .type-option { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.5rem 0.625rem; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-weight: normal; }
  .type-option:has(input:checked) { border-color: var(--accent, #b05525); background: rgba(176, 85, 37, 0.05); }
  .type-option input { margin-top: 0.2rem; flex-shrink: 0; }
  .type-option-body { display: flex; flex-direction: column; gap: 0.15rem; }
  .type-name { font-size: 0.875rem; font-weight: 600; color: #1a1510; }
  .type-desc { font-size: 0.8rem; color: #6b6058; }
</style>
