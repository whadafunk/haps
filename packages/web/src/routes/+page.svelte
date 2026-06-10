<script lang="ts">
  import type { PageData } from './$types'
  let { data } = $props<{ data: PageData }>()
</script>

<main class="home">
  <div class="hero">
    <h1>Welcome to Haps</h1>
    <p>The simple, private way to plan events and collect RSVPs — no account required for your guests.</p>

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
  }
  .hero h1 {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 0.5rem;
    color: #1a1510;
  }
  .hero > p {
    color: #6b6058;
    margin: 0 0 2rem;
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
</style>
