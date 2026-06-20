type SendFn = (event: string, data: unknown) => void

const clients = new Map<string, Set<SendFn>>()

export function subscribeToEvent(slug: string, send: SendFn): () => void {
  if (!clients.has(slug)) clients.set(slug, new Set())
  clients.get(slug)!.add(send)
  return () => {
    const set = clients.get(slug)
    if (!set) return
    set.delete(send)
    if (set.size === 0) clients.delete(slug)
  }
}

export function broadcast(slug: string, event: string, data: unknown): void {
  clients.get(slug)?.forEach((send) => send(event, data))
}
