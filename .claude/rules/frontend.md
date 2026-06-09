# Frontend Conventions (SvelteKit + TypeScript)

## File Structure

```
packages/web/src/
  routes/
    +layout.svelte          Root layout (nav, session store init)
    +layout.server.ts       Load session data server-side on every route
    event/[slug]/
      +page.svelte          Public event page
      +page.server.ts       SSR load + OG tags (REQUIRED)
    event/[slug]/edit/[token]/
      +page.svelte          Host edit view
      +page.server.ts
    my-events/
      +page.svelte
      +page.server.ts
    setup/
      +page.svelte          First-run admin setup
    admin/
      +layout.svelte        Admin shell (auth guard)
      ...
  lib/
    components/             Reusable Svelte components
    api.ts                  Typed fetch wrapper for /api/*
    stores/                 Svelte stores (session, toasts)
    themes.ts               Theme definitions and CSS var mappings
```

## Open Graph — Non-Negotiable

Every event page **must** set OG tags server-side in `+page.server.ts`.
A missing OG image means the link preview in iMessage, WhatsApp, etc. is blank —
which kills the primary sharing flow.

```typescript
// event/[slug]/+page.server.ts
import type { PageServerLoad } from './$types'
import { api } from '$lib/api'

export const load: PageServerLoad = async ({ params, request }) => {
  const event = await api.getEvent(params.slug)
  if (!event) throw error(404)

  return {
    event,
    // These populate <svelte:head> in the layout
    meta: {
      title: event.title,
      description: `${event.startsAt} · ${event.location ?? 'See invite for location'}`,
      image: event.coverImageUrl ?? '/og-default.png',
      url: `${PUBLIC_APP_URL}/event/${event.slug}`,
    }
  }
}
```

The root `+layout.svelte` renders these into `<svelte:head>`:
```svelte
<svelte:head>
  <title>{data.meta?.title ?? 'Events'}</title>
  <meta property="og:title"       content={data.meta?.title ?? ''} />
  <meta property="og:description" content={data.meta?.description ?? ''} />
  <meta property="og:image"       content={data.meta?.image ?? ''} />
  <meta property="og:url"         content={data.meta?.url ?? ''} />
  <meta name="twitter:card"       content="summary_large_image" />
</svelte:head>
```

## API Client

All fetch calls go through `$lib/api.ts`. Never call `fetch('/api/...')` directly
in a component. The client:
- Attaches credentials (cookies) automatically
- Parses the typed response or throws a typed `ApiError`
- Is usable on both server (`+page.server.ts`) and client (component event handlers)

```typescript
// $lib/api.ts
export const api = {
  getEvent: (slug: string) =>
    apiFetch<{ event: Event }>(`/events/${slug}`),
  submitRsvp: (slug: string, body: RsvpInput) =>
    apiFetch<{ rsvp: Rsvp }>(`/events/${slug}/rsvps`, { method: 'POST', body }),
  // ...
}
```

Import types from `packages/shared`:
```typescript
import type { Event, Rsvp } from '@haps/shared'
```

## Styling

- Use CSS custom properties for theming. The event page applies a `data-theme`
  attribute to `<body>`; theme CSS files define the vars.
- No CSS framework. Plain CSS with custom properties and `@layer`.
- Mobile-first: write styles for 375px, add `@media (min-width: 768px)` to widen.
- No inline `style` attributes for layout — use classes.

## Forms

- Use SvelteKit `enhance` action for progressive enhancement (works without JS).
- Never navigate programmatically after a form submission — let the `enhance`
  action handle redirect or invalidation.
- Show loading state during submission; disable submit button.
- Display server-side validation errors inline next to the relevant field,
  not just in a toast.

## Components

- One component per file; named to match the filename (`EventCard.svelte`).
- Props typed with TypeScript interfaces imported from `@haps/shared`.
- No component exceeds ~200 lines; split into sub-components if longer.
- Animations: use CSS transitions, not JS animation libraries, for Phase 1.
