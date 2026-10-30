import { request } from '@/foundation/request'
import type { TenantContextOption } from '@/modules/system/types/tenant'

export function currentTenantContext(): Promise<TenantContextOption> {
  return request({ method: 'GET', url: '/system/tenant-context/current' })
}

export function tenantContextOptions(
  keyword = '',
  creatable = false,
): Promise<TenantContextOption[]> {
  return request({
    method: 'GET',
    url: '/system/tenant-context/options',
    params: { keyword, creatable },
  })
}
