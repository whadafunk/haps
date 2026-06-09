<script lang="ts">
  import type { PageData } from './$types'
  let { data } = $props<{ data: PageData }>()
</script>

<main class="home">
  <div class="hero">
    <h1>Welcome to Haps</h1>
    <p>The simple way to plan events and collect RSVPs.</p>
    <div class="actions">
      <a href="/my-events" class="btn-primary">My Events</a>
    </div>
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
  .hero p {
    color: #6b6058;
    margin: 0 0 2rem;
  }
  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
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
</style>
