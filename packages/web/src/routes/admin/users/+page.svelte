<script lang="ts">
  import type { PageData, ActionData } from './$types'
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  let showCreate = $state(false)
  let creating = $state(false)
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>Users</h1>
    <button class="btn" onclick={() => showCreate = !showCreate}>+ New User</button>
  </div>

  {#if form?.error}
    <div class="error-banner">{form.error}</div>
  {/if}

  {#if showCreate}
    <form
      method="POST"
      action="?/createUser"
      class="create-form"
      use:enhance={() => {
        creating = true
        return async ({ result, update }) => {
          creating = false
          if (result.type === 'success') { showCreate = false; await invalidateAll() }
          else update()
        }
      }}
    >
      <h2>Create User</h2>
      <label>Email <input name="email" type="email" required /></label>
      <label>Display name <input name="displayName" type="text" required /></label>
      <label>Password <input name="password" type="password" required /></label>
      <label>
        Role
        <select name="role">
          <option value="organizer">Organizer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
    </form>
  {/if}

  <table class="table">
    <thead>
      <tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr>
    </thead>
    <tbody>
      {#each data.users as user (user.id)}
        <tr class:inactive={!user.active}>
          <td>{user.email}</td>
          <td>{user.displayName}</td>
          <td><span class="badge role-{user.role}">{user.role}</span></td>
          <td><span class="badge status-{user.active ? 'active' : 'inactive'}">{user.active ? 'Active' : 'Inactive'}</span></td>
          <td>{new Date(user.createdAt).toLocaleDateString()}</td>
          <td class="actions">
            {#if user.role !== 'admin'}
              <form method="POST" action="?/toggleActive" use:enhance>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="active" value={String(!user.active)} />
                <button type="submit" class="secondary-btn">{user.active ? 'Deactivate' : 'Reactivate'}</button>
              </form>
            {/if}
            <form method="POST" action="?/deleteUser" use:enhance>
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit" class="danger-btn">Delete</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  h1 { margin: 0; font-size: 1.5rem; color: #1a1510; }
  h2 { margin: 0 0 1rem; font-size: 1rem; color: #1a1510; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
  .btn { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn:hover { background: #924418; }
  .create-form { background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; max-width: 400px; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #3d352e; }
  input, select { padding: 0.5rem 0.75rem; border: 1px solid #c8bdb0; border-radius: 8px; font-size: 1rem; font-family: inherit; background: #fff; color: #1a1510; }
  input:focus, select:focus { outline: 2px solid #b05525; outline-offset: -1px; }
  .create-form button[type=submit] { background: #b05525; color: #fff; border: none; padding: 0.625rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .create-form button[type=submit]:hover:not(:disabled) { background: #924418; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; background: #f0e8da; border: 1px solid #cfc3b0; border-radius: 12px; overflow: hidden; }
  .table th { text-align: left; font-size: 0.75rem; font-weight: 600; color: #6b6058; text-transform: uppercase; padding: 0.75rem 1rem; border-bottom: 1px solid #cfc3b0; }
  .table td { padding: 0.75rem 1rem; border-bottom: 1px solid #dfd4c4; vertical-align: middle; color: #1a1510; }
  .table tr:last-child td { border-bottom: none; }
  .badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 4px; background: #ede8e0; color: #4e453e; }
  .badge.role-admin { background: #fef4e0; color: #7a5a1a; }
  .badge.role-organizer { background: #f0ddd0; color: #9a3f1a; }
  .badge.status-active { background: #e4f0e0; color: #2e6e28; }
  .badge.status-inactive { background: #f0e0e0; color: #8b2020; }
  .actions { display: flex; gap: 0.5rem; align-items: center; }
  .actions form { margin: 0; }
  tr.inactive td { opacity: 0.55; }
  .secondary-btn { background: none; border: 1px solid #cfc3b0; color: #3d352e; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; }
  .secondary-btn:hover { background: #ede8e0; }
  .danger-btn { background: none; border: 1px solid #f0c8b8; color: #8b3016; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; }
  .danger-btn:hover { background: #fdf2ee; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
</style>
