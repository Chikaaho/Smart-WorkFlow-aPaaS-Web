/**
 * 表单运行期接缝：workflow 模块（任务详情、移动工作台、流程设计器）读取表单数据与定义、
 * 复用字段级能力的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值走动态
 * import（保持懒加载、不建立静态跨模块依赖），同步工厂与类型按具名契约转出。
 */
import type { FormSchema } from '@/contracts/form-schema'
import type { UserDeptDisplayMap } from '@/modules/form/utils/user-dept-display'

export type {
  FieldScriptOverrides,
  FieldScriptsOptions,
  FieldScriptsRuntime,
} from '@/modules/form/utils/field-scripts'
export type { ScriptOrgContext } from '@/modules/form/utils/script-hosts'

/** 表单脚本组织目录快照（复用选择器的同一授权查询；上限 200）。 */
export async function loadScriptOrgContext() {
  const { loadScriptOrgContext: load } = await import('@/modules/form/api/i2-choices')
  return load()
}

/** 已授权人员候选（id/显示名；同租户启用用户，上限 200）。 */
export async function loadOrgUserChoices(): Promise<Array<{ id: string; name: string }>> {
  const context = await loadScriptOrgContext()
  return context.users
}

/** 人员 ID → 显示名映射；快照内不存在的 ID 不返回，调用方保留 ID 展示。 */
export async function resolveUserDisplayNames(ids: string[]): Promise<Record<string, string>> {
  const wanted = new Set(ids.map((id) => String(id).trim()).filter(Boolean))
  if (wanted.size === 0) return {}
  const users = await loadOrgUserChoices()
  const result: Record<string, string> = {}
  for (const user of users) {
    if (wanted.has(user.id)) result[user.id] = user.name
  }
  return result
}

/** 字段脚本工厂（值变更触发；onLoad 装载后执行；只读回看不执行）。 */
export { createFieldScripts } from '@/modules/form/utils/field-scripts'

/** 读取表单记录（含 id / version / 审计列 / 业务字段 / 子表行）。 */
export async function getFormData(
  formKey: string,
  recordId: string,
): Promise<Record<string, unknown>> {
  const { getFormData: load } = await import('@/modules/form/api/form')
  return load(formKey, recordId)
}

/** 读取表单当前定义（防腐层已解析为 FormSchema）。 */
export async function getFormDefinition(formKey: string): Promise<FormSchema> {
  const { getFormDefinition: load } = await import('@/modules/form/api/form')
  return load(formKey)
}

/** REFERENCE 引用 ID → 显示文本（解析失败原样返回 refId，不阻断主链）。 */
export async function resolveReferenceDisplay(
  targetFormKey: string,
  refId: string,
): Promise<string> {
  const { resolveReferenceDisplay: resolve } =
    await import('@/modules/form/utils/resolve-reference-display')
  return resolve(targetFormKey, refId)
}

/** 按 schema 解析整张记录的全部 USER/DEPT 显示串 { fieldName: '张三、李四' }。 */
export async function buildUserDeptDisplays(
  schema: FormSchema,
  record: Record<string, unknown>,
): Promise<UserDeptDisplayMap> {
  const { buildUserDeptDisplays: build } = await import('@/modules/form/utils/user-dept-display')
  return build(schema, record)
}
