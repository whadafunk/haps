<script lang="ts">
  import type { LayoutData } from './$types'
  let { data, children } = $props<{ data: LayoutData; children: any }>()
</script>

{#if data.user}
  <div class="staff-layout">
    <aside class="sidebar">
      <nav class="sidebar-nav">
        <a href="/admin">Dashboard</a>
        <a href="/admin/events">Events</a>
        <a href="/admin/guests">Guests</a>
        {#if data.user.role === 'admin'}
          <div class="sidebar-divider"></div>
          <a href="/admin/users">Users</a>
          <a href="/admin/config">Config</a>
        {/if}
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-name">{data.user.displayName}</span>
        <span class="sidebar-role">{data.user.role}</span>
      </div>
    </aside>
    <main class="staff-main">
      {@render children()}
    </main>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .staff-layout { display: flex; min-height: calc(100vh - 56px); flex-direction: column; }
  .sidebar {
    background: #1a1510;
    color: #e8ddd0;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sidebar-nav { display: flex; flex-wrap: wrap; gap: 0.125rem; }
  .sidebar-nav a {
    color: #c5b8ae;
    text-decoration: none;
    font-size: 0.875rem;
    padding: 0.375rem 0.625rem;
    border-radius: 6px;
    white-space: nowrap;
  }
  .sidebar-nav a:hover { background: rgba(255,255,255,0.07); color: #e8ddd0; }
  .sidebar-nav a[aria-current="page"] { background: rgba(255,255,255,0.1); color: #e8ddd0; }
.sidebar-divider { width: 100%; height: 1px; background: #2e2820; margin: 0.25rem 0; }
  .sidebar-footer {
    margin-top: auto;
    padding-top: 0.75rem;
    border-top: 1px solid #2e2820;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .sidebar-name { font-size: 0.8rem; color: #c5b8ae; }
  .sidebar-role { font-size: 0.7rem; color: #4e453e; text-transform: capitalize; }
  .staff-main { flex: 1; padding: 1.5rem 1rem; background: #e8ddd0; }

  @media (min-width: 640px) {
    .staff-layout { flex-direction: row; }
    .sidebar { width: 180px; padding: 1.5rem 1rem; flex-shrink: 0; }
    .sidebar-nav { flex-direction: column; }
    .staff-main { padding: 2rem 1.5rem; overflow-y: auto; }
  }
</style>
