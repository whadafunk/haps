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
  .admin-layout { display: flex; min-height: calc(100vh - 56px); }
  .sidebar { width: 200px; background: #1a1510; color: #e8ddd0; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1rem; flex-shrink: 0; }
  .sidebar-brand { font-weight: 800; font-size: 0.8rem; color: #e8a07a; letter-spacing: 0.08em; text-transform: uppercase; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 0.125rem; flex: 1; }
  .sidebar-nav a { color: #c5b8ae; text-decoration: none; font-size: 0.875rem; padding: 0.375rem 0.5rem; border-radius: 6px; }
  .sidebar-nav a:hover { background: rgba(255,255,255,0.07); color: #e8ddd0; }
  .sidebar-user { font-size: 0.75rem; color: #4e453e; word-break: break-all; border-top: 1px solid #3d3430; padding-top: 0.75rem; }
  .logout-link { color: #e08070 !important; }
  .logout-link:hover { color: #e8ddd0 !important; }
  .admin-main { flex: 1; padding: 2rem 1.5rem; overflow-y: auto; background: #e8ddd0; }
</style>
