<script lang="ts">
  import type { LayoutData } from './$types'
  let { data, children } = $props<{ data: LayoutData; children: any }>()
</script>

<div class="admin-layout">
  <aside class="sidebar">
    <div class="sidebar-brand">Admin</div>
    <nav class="sidebar-nav">
      <a href="/admin">Dashboard</a>
      <a href="/admin/events">Events</a>
      <a href="/admin/users">Users</a>
      <a href="/admin/config">Config</a>
      <a href="/dashboard">→ Organizer view</a>
      <a href="/logout" class="logout-link">Sign out</a>
    </nav>
    <div class="sidebar-user">{data.user.email}</div>
  </aside>
  <main class="admin-main">
    {@render children()}
  </main>
</div>

<style>
  .admin-layout { display: flex; min-height: calc(100vh - 56px); flex-direction: column; }
  .sidebar { background: #1a1510; color: #e8ddd0; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .sidebar-brand { font-weight: 800; font-size: 0.8rem; color: #e8a07a; letter-spacing: 0.08em; text-transform: uppercase; }
  .sidebar-nav { display: flex; flex-wrap: wrap; gap: 0.125rem; }
  .sidebar-nav a { color: #c5b8ae; text-decoration: none; font-size: 0.875rem; padding: 0.375rem 0.5rem; border-radius: 6px; white-space: nowrap; }
  .sidebar-nav a:hover { background: rgba(255,255,255,0.07); color: #e8ddd0; }
  .sidebar-user { font-size: 0.75rem; color: #4e453e; word-break: break-all; }
  .logout-link { color: #e08070 !important; }
  .logout-link:hover { color: #e8ddd0 !important; }
  .admin-main { flex: 1; padding: 1.5rem 1rem; overflow-y: auto; background: #e8ddd0; }

  @media (min-width: 640px) {
    .admin-layout { flex-direction: row; }
    .sidebar { width: 200px; padding: 1.5rem 1rem; flex-shrink: 0; }
    .sidebar-nav { flex-direction: column; }
    .sidebar-user { border-top: 1px solid #3d3430; padding-top: 0.75rem; }
    .admin-main { padding: 2rem 1.5rem; }
  }
</style>
