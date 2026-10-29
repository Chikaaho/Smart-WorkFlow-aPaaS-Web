/**
 * 租户列表接缝：form 模块（超管表单管理租户筛选候选）读取 system 模块租户分页的
 * 唯一跨模块出口。modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；
 * 运行时值走动态 import（保持懒加载、不建立静态跨模块依赖），类型按具名契约转出。
 */
import type { SysTenant } from '@/modules/system/types/tenant'
import type { PageQuery } from '@/contracts/common'

export type { SysTenant }

/** 租户分页（超管上下文；筛选候选只取名称/标识）。 */
export async function pageTenants(
  page: PageQuery,
  filter: { name?: string; status?: number },
): Promise<{ list: SysTenant[]; total: number }> {
  const { pageTenants: load } = await import('@/modules/system/api/tenant')
  return load(page, filter)
}
