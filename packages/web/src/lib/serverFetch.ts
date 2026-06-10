import type { Cookies } from '@sveltejs/kit'

export const API_BASE = process.env['INTERNAL_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3000'

export class ServerApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ServerApiError'
  }
}

export function buildCookieHeader(cookies: Cookies): string {
  const parts: string[] = []
  const authToken = cookies.get('auth_token')
  const vsid = cookies.get('vsid')
  if (authToken) parts.push(`auth_token=${authToken}`)
  if (vsid) parts.push(`vsid=${vsid}`)
  return parts.join('; ')
}

export function forwardCookies(res: Response, cookies: Cookies): void {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [nameVal, ...directives] = raw.split(';').map((s) => s.trim())
    const [name, ...valParts] = (nameVal ?? '').split('=')
    const value = valParts.join('=')
    if (!name || !value) continue

    const opts: Parameters<typeof cookies.set>[2] = { path: '/' }
    for (const d of directives) {
      const lower = d.toLowerCase()
      if (lower === 'httponly') opts.httpOnly = true
      else if (lower === 'secure') opts.secure = true
      else if (lower === 'samesite=strict') opts.sameSite = 'strict'
      else if (lower === 'samesite=lax') opts.sameSite = 'lax'
      else if (lower.startsWith('max-age=')) opts.maxAge = parseInt(lower.slice(8), 10)
      else if (lower.startsWith('path=')) opts.path = d.slice(5)
    }
    cookies.set(name, value, { ...opts, encode: (v: string) => v })
  }
}

export async function serverGet<T>(path: string, cookies: Cookies): Promise<T> {
  const cookieHeader = buildCookieHeader(cookies)
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ServerApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText)
  }
  forwardCookies(res, cookies)
  return res.json() as Promise<T>
}

export async function serverPost<T>(path: string, body: unknown, cookies: Cookies): Promise<T> {
  const cookieHeader = buildCookieHeader(cookies)
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => null)
    throw new ServerApiError(res.status, b?.error?.code ?? 'UNKNOWN', b?.error?.message ?? res.statusText)
  }
  forwardCookies(res, cookies)
  return res.json() as Promise<T>
}
