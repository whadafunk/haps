<script lang="ts">
  import { apiFetch } from '$lib/api'
  import { onMount } from 'svelte'

  let state = $state<'idle' | 'subscribed' | 'denied' | 'unsupported' | 'loading'>('idle')

  onMount(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      state = 'unsupported'
      return
    }
    const perm = Notification.permission
    if (perm === 'denied') { state = 'denied'; return }
    if (perm === 'granted') {
      // Check if already subscribed
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager?.getSubscription()
      if (sub) state = 'subscribed'
    }
  })

  async function subscribe() {
    state = 'loading'
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const { publicKey } = await apiFetch<{ publicKey: string }>('/push/vapid-public-key')

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
      })

      await apiFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
            auth:   arrayBufferToBase64(sub.getKey('auth')!),
          },
        }),
      })

      state = 'subscribed'
    } catch (err) {
      if (Notification.permission === 'denied') state = 'denied'
      else state = 'idle'
    }
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
  }
</script>

{#if state === 'idle' || state === 'loading'}
  <div class="push-banner">
    <span class="push-icon">🔔</span>
    <span class="push-text">Get notified about event updates even when you're not on the page.</span>
    <button class="push-btn" onclick={subscribe} disabled={state === 'loading'}>
      {state === 'loading' ? 'Enabling…' : 'Enable notifications'}
    </button>
  </div>
{:else if state === 'subscribed'}
  <div class="push-banner push-banner-success">
    <span class="push-icon">✓</span>
    <span class="push-text">Push notifications enabled.</span>
  </div>
{:else if state === 'denied'}
  <div class="push-banner push-banner-muted">
    <span class="push-icon">🔕</span>
    <span class="push-text">Notifications blocked in browser settings.</span>
  </div>
{/if}

<style>
  .push-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #f0e8da;
    border: 1px solid #cfc3b0;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
  }
  .push-banner-success { background: #eaf5ea; border-color: #9dbf9d; }
  .push-banner-muted   { background: #f5f0eb; border-color: #d0c8be; color: #7a6e64; }
  .push-icon { font-size: 1.1rem; flex-shrink: 0; }
  .push-text { flex: 1; color: #3d352e; }
  .push-btn {
    background: #b05525;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.375rem 0.875rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    font-family: inherit;
  }
  .push-btn:hover:not(:disabled) { background: #924418; }
  .push-btn:disabled { opacity: 0.6; }
</style>
