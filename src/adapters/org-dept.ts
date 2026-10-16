/**
 * 部门树接缝：form 模块（部门候选）读取 system 模块部门树的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值走动态
 * import（保持懒加载、不建立静态跨模块依赖），类型按具名契约转出。
 */
import type { SysDept } from '@/modules/system/types/dept'

export type { SysDept }

/** 读取部门树（仅正常状态由服务端保证）。 */
export async function listDeptTree(): Promise<SysDept[]> {
  const { listDeptTree: load } = await import('@/modules/system/api/dept')
  return load()
}
