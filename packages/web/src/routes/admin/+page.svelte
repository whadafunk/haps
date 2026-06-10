<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'

  let { data, form } = $props<{ data: PageData; form: ActionData }>()
  let loading = $state(false)

  const isAdmin = $derived(data.user?.role === 'admin')
  const stats = $derived({
    total: data.events.length,
    published: data.events.filter((e: { status: string }) => e.status === 'published').length,
    users: data.users.length,
  })
</script>

{#if !data.user}
  <main class="login-page">
    <div class="login-card">
      <h1>Staff login</h1>

      {#if form?.error}
        <div class="error-banner">{form.error}</div>
      {/if}

      <form
        method="POST"
        use:enhance={() => {
          loading = true
          return async ({ update }) => { loading = false; await update() }
        }}
      >
        <label>
          Email
          <input type="email" name="email" required autocomplete="email" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autocomplete="current-password" />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  </main>
{:else}
  <div class="admin-page">
    <h1>Dashboard</h1>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">{stats.total}</div>
        <div class="stat-label">Total Events</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{stats.published}</div>
        <div class="stat-label">Published</div>
      </div>
      {#if isAdmin}
        <div class="stat-card">
          <div class="stat-value">{stats.users}</div>
          <div class="stat-label">Users</div>
        </div>
      {/if}
    </div>

    <section class="section">
      <div class="section-header">
        <h2>Recent Events</h2>
        <a href="/new-event" class="btn-small">+ New</a>
      </div>
      {#if data.events.length === 0}
        <p class="muted">No events yet. <a href="/new-event">Create your first →</a></p>
      {:else}
        <table class="table">
          <thead>
            <tr><th>Title</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {#each data.events.slice(0, 10) as event (event.slug)}
              <tr>
                <td><a href="/event/{event.slug}">{event.title}</a></td>
                <td><span class="badge status-{event.status}">{event.status}</span></td>
                <td>{new Date(event.startsAt).toLocaleDateString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    {#if isAdmin}
      <section class="section">
        <div class="section-header">
          <h2>Users</h2>
          <a href="/admin/users" class="btn-small">Manage</a>
        </div>
        <table class="table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {#each data.users.slice(0, 5) as user (user.id)}
              <tr>
                <td>{user.email}</td>
                <td><span class="badge">{user.role}</span></td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>
{/if}

<style>
  /* Login */
  .login-page {
    min-height: calc(100vh - 56px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }
  .login-card {
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 400px;
  }
  .login-card h1 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1a1510; }
  .error-banner {
    background: #fdf2ee;
    color: #8b3016;
    border: 1px solid #f0c8b8;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  form { display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input {
    padding: 0.5rem 0.75rem;
    border: 1px solid #c8bdb0;
    border-radius: 8px;
    font-size: 1rem;
    background: #fff;
    color: #1a1510;
  }
  input:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  button[type=submit] {
    background: #b05525;
    color: #fff;
    border: none;
    padding: 0.625rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  button[type=submit]:hover:not(:disabled) { background: #924418; }
  button[type=submit]:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Dashboard */
  .admin-page { padding: 0; }
  h1 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1a1510; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .stat-card { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 10px; padding: 1rem; text-align: center; }
  .stat-value { font-size: 2rem; font-weight: 800; color: #b05525; }
  .stat-label { font-size: 0.8rem; color: #6b6058; margin-top: 0.25rem; }
  .section { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  h2 { margin: 0; font-size: 1rem; color: #1a1510; }
  .btn-small {
    background: #b05525;
    color: #fff;
    text-decoration: none;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .btn-small:hover { background: #924418; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  .table th { text-align: left; font-size: 0.75rem; font-weight: 600; color: #6b6058; text-transform: uppercase; padding: 0.5rem 0; border-bottom: 1px solid #cfc3b0; }
  .table td { padding: 0.625rem 0; border-bottom: 1px solid #dfd4c4; color: #1a1510; }
  .table a { text-decoration: none; color: #b05525; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .badge.status-published { background: #e8f4e4; color: #2a5e28; }
  .badge.status-draft { background: #ede8e0; color: #4e453e; }
  .badge.status-cancelled { background: #f8e8e2; color: #7a2a1a; }
  .muted { color: #6b6058; font-size: 0.875rem; }
  .muted a { color: #b05525; }
</style>
