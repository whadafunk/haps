import type { PageServerLoad } from './$types'
import { serverGet } from '$lib/serverFetch'

interface AdminConfig {
  instanceName: string
  smtpHost: string | null
  smtpPort: number
  smtpUser: string | null
  smtpFrom: string | null
  smtpConfigured: boolean
  storageType: string
  defaultTheme: string | null
}

export const load: PageServerLoad = async ({ cookies }) => {
  const { config } = await serverGet<{ config: AdminConfig }>('/admin/config', cookies)
  return { config }
}
