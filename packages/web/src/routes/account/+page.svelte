<script lang="ts">
  import type { PageData } from './$types'
  let { data } = $props<{ data: PageData }>()
</script>

<main class="page">
  <div class="container">
    <h1>My account</h1>

    <section class="card">
      <h2>Profile</h2>
      <dl class="profile-fields">
        <dt>Name</dt>
        <dd>{data.user?.displayName ?? '—'}</dd>
        <dt>Email</dt>
        <dd>{data.user?.email ?? '—'}</dd>
        <dt>Role</dt>
        <dd class="role">{data.user?.role ?? '—'}</dd>
      </dl>
      <p class="coming-soon">Editing profile details is coming soon.</p>
    </section>

    <section class="card">
      <h2>Password</h2>
      <p class="coming-soon">Password change is coming soon.</p>
    </section>

    <section class="card danger-zone">
      <h2>Danger zone</h2>
      <p class="coming-soon">Account deletion is coming soon.</p>
    </section>
  </div>
</main>

<style>
  .page { padding: 2rem 1rem 4rem; }
  .container { max-width: 560px; margin: 0 auto; }
  h1 { margin: 0 0 1.5rem; color: #1a1510; }
  .card {
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  h2 { margin: 0 0 1rem; font-size: 1rem; color: #1a1510; }
  .profile-fields {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.5rem 1rem;
    margin: 0 0 1rem;
  }
  dt { font-size: 0.85rem; color: #6b6058; font-weight: 500; padding: 0.125rem 0; }
  dd { margin: 0; font-size: 0.9rem; color: #1a1510; padding: 0.125rem 0; }
  .role { text-transform: capitalize; }
  .coming-soon { margin: 0; font-size: 0.85rem; color: #6b6058; font-style: italic; }
  .danger-zone { border-color: #e8b4a0; }
  .danger-zone h2 { color: #7a2a1a; }
</style>
