<script lang="ts">
  import type { PageData } from './$types'
  import { api, ApiError } from '$lib/api'
  import type { AlbumPhoto } from '@haps/shared'

  let { data } = $props<{ data: PageData }>()

  const event = $derived(data.event)
  let photos = $state<(AlbumPhoto & { isOwn?: boolean })[]>(data.photos)

  let uploadFiles = $state<FileList | null>(null)
  let uploading = $state(false)
  let uploadError = $state('')

  type LightboxPhoto = AlbumPhoto & { isOwn?: boolean }
  let lightboxPhoto = $state<LightboxPhoto | null>(null)

  async function upload() {
    if (!uploadFiles || uploadFiles.length === 0) return
    uploading = true
    uploadError = ''
    try {
      const fd = new FormData()
      for (const file of uploadFiles) fd.append('photos', file)
      const res = await api.uploadToAlbum(event.slug, fd)
      photos = [...photos, ...res.photos]
      uploadFiles = null
    } catch (e: unknown) {
      uploadError = e instanceof ApiError ? e.message : 'Failed to upload.'
    } finally {
      uploading = false
    }
  }

  async function deletePhoto(photoId: string) {
    if (!confirm('Remove this photo?')) return
    try {
      await api.deletePhoto(event.slug, photoId)
      photos = photos.filter(p => p.id !== photoId)
      lightboxPhoto = null
    } catch { /**/ }
  }
</script>

<svelte:head>
  <title>{event.title} — Album</title>
</svelte:head>

<main class="album-page">
  <div class="album-header">
    <a href="/event/{event.slug}" class="back-link">← {event.title}</a>
    <h1>Photo album</h1>
  </div>

  {#if event.status === 'published'}
    <div class="upload-bar">
      {#if uploadError}<div class="error-banner">{uploadError}</div>{/if}
      <label class="upload-btn">
        📷 {uploadFiles && uploadFiles.length > 0 ? `${uploadFiles.length} photo${uploadFiles.length > 1 ? 's' : ''} selected` : 'Upload photos'}
        <input type="file" accept="image/*" multiple onchange={(e) => { uploadFiles = (e.target as HTMLInputElement).files }} style="display:none" />
      </label>
      {#if uploadFiles && uploadFiles.length > 0}
        <button onclick={upload} disabled={uploading} class="upload-confirm-btn">
          {uploading ? 'Uploading…' : `Upload ${uploadFiles.length} photo${uploadFiles.length > 1 ? 's' : ''}`}
        </button>
      {/if}
    </div>
  {/if}

  {#if photos.length === 0}
    <p class="empty">No photos yet.</p>
  {:else}
    <div class="grid">
      {#each photos as photo (photo.id)}
        <button class="cell" onclick={() => lightboxPhoto = photo}>
          <img src={photo.url} alt={photo.caption ?? ''} class="thumb" loading="lazy" />
        </button>
      {/each}
    </div>
  {/if}
</main>

{#if lightboxPhoto}
  <div class="lightbox" onclick={() => lightboxPhoto = null} role="dialog" aria-modal="true">
    <div class="lightbox-inner" onclick={(e) => e.stopPropagation()}>
      <img src={lightboxPhoto.url} alt={lightboxPhoto.caption ?? ''} class="lightbox-img" />
      {#if lightboxPhoto.caption}
        <p class="lightbox-caption">{lightboxPhoto.caption}</p>
      {/if}
      <p class="lightbox-uploader">{lightboxPhoto.uploaderName}</p>
      <div class="lightbox-actions">
        {#if lightboxPhoto.isOwn || data.isEditor}
          <button onclick={() => { if (lightboxPhoto) deletePhoto(lightboxPhoto.id) }} class="lightbox-delete">Remove photo</button>
        {/if}
        <button onclick={() => lightboxPhoto = null} class="lightbox-close">Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .album-page { max-width: 900px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }

  .album-header { margin-bottom: 1.25rem; }
  .back-link { font-size: 0.875rem; color: #b05525; text-decoration: none; display: inline-block; margin-bottom: 0.5rem; }
  .back-link:hover { text-decoration: underline; }
  h1 { margin: 0; font-size: 1.5rem; color: #1a1510; }

  .upload-bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .upload-btn { display: inline-block; background: #f0e8da; color: #4e453e; border: 1px solid #cfc3b0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
  .upload-btn:hover { background: #e8ddd0; }
  .upload-confirm-btn { background: #b05525; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .upload-confirm-btn:hover:not(:disabled) { background: #924418; }
  .upload-confirm-btn:disabled { opacity: 0.6; }
  .error-banner { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 8px; padding: 0.625rem 0.875rem; font-size: 0.875rem; width: 100%; }

  .empty { color: #6b6058; font-size: 0.9rem; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 4px; }
  .cell { padding: 0; border: none; background: none; cursor: pointer; aspect-ratio: 1; overflow: hidden; border-radius: 4px; }
  .cell:hover .thumb { transform: scale(1.03); }
  .thumb { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.15s ease; }

  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.88); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
  .lightbox-inner { background: #fff; border-radius: 12px; overflow: hidden; max-width: 640px; width: 100%; }
  .lightbox-img { width: 100%; max-height: 75vh; object-fit: contain; display: block; background: #111; }
  .lightbox-caption { margin: 0.75rem 1rem 0.25rem; font-size: 0.9rem; color: #1a1510; }
  .lightbox-uploader { margin: 0.25rem 1rem 0.75rem; font-size: 0.8rem; color: #6b6058; }
  .lightbox-actions { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid #e8e0d8; }
  .lightbox-close { margin-left: auto; background: #e8ddd0; border: 1px solid #cfc3b0; border-radius: 6px; padding: 0.375rem 0.875rem; font-size: 0.875rem; cursor: pointer; }
  .lightbox-delete { background: #fdf2ee; color: #8b3016; border: 1px solid #f0c8b8; border-radius: 6px; padding: 0.375rem 0.875rem; font-size: 0.875rem; cursor: pointer; }
</style>
