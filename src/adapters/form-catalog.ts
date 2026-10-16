/**
 * 表单定义目录接缝：workflow 模块（审批意见表单管理、流程设计器选表单）访问 form 模块
 * 表单定义目录与生命周期（停用/启用）的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值走动态
 * import（保持懒加载、不建立静态跨模块依赖），同步纯函数与类型按具名契约转出。
 */
import type { PageQuery, PageResult } from '@/contracts/common'
import type { FormSchema } from '@/contracts/form-schema'
import type {
  FormCreateReq,
  FormDefDTO,
  FormDefListItem,
  FormDefStatus,
} from '@/modules/form/api/form-def'

export type { FormCreateReq, FormDefDTO, FormDefListItem, FormDefStatus }

/** 状态 → 展示标签 / 标签色（同步纯函数，列表行内用）。 */
export { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'

/** 分页查询表单定义；keyword 模糊搜索名称/formKey，formType 过滤 BUSINESS / APPROVAL_COMMENT。 */
export async function pageFormDefs(
  query: PageQuery,
  keyword?: string,
  formType?: string,
): Promise<PageResult<FormDefListItem>> {
  const { pageFormDefs: page } = await import('@/modules/form/api/form-def')
  return page(query, keyword, formType)
}

/** 新建表单定义（草稿态）。 */
export async function createFormDef(req: FormCreateReq): Promise<FormDefDTO> {
  const { createFormDef: create } = await import('@/modules/form/api/form-def')
  return create(req)
}

/** 保存表单配置（definition JSON 字符串）。 */
export async function saveFormConfig(id: string, definition: string): Promise<void> {
  const { saveFormConfig: save } = await import('@/modules/form/api/form-def')
  await save(id, definition)
}

/** 按表单 ID 读取当前定义（流程节点选择表单后取 schema）。 */
export async function getFormDefinitionById(id: string): Promise<FormSchema> {
  const { getFormDefinitionById: load } = await import('@/modules/form/api/form-def')
  return load(id)
}

/** 停用表单定义（PUBLISHED → DISABLED）。 */
export async function disableFormDef(id: string, reason?: string): Promise<void> {
  const { disableFormDef: disable } = await import('@/modules/form/api/i2-choices')
  await disable(id, reason)
}

/** 启用表单定义（DISABLED → PUBLISHED）。 */
export async function enableFormDef(id: string, reason?: string): Promise<void> {
  const { enableFormDef: enable } = await import('@/modules/form/api/i2-choices')
  await enable(id, reason)
}
