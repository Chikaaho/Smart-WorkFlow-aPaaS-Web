/**
 * resolveReferenceDisplay — REFERENCE 字段 ID→显示名解析接缝函数。
 *
 * ## 设计定位
 * v1 实现 = 按 refId 查目标表单记录 → 取 deriveDisplayField 字段值回。
 * 将来可换后端批量解析端点，只改此函数，调用方不动。
 *
 * ## 回退策略
 * 取不到（记录已删／空／目标表单不存在）→ 返回 refId 本身，
 * 不崩、不留空白。
 *
 * ## 请求单源
 * 复用 queryFormData（单一请求层），不造新端点。
 */
import { getFormDefinition, queryFormData } from '@/modules/form/api/form'
import { deriveDisplayField } from './derive-list-config'
import type { FormSchema } from '@/contracts/form-schema'

/**
 * 解析单个 REFERENCE 引用 ID 为显示文本。
 *
 * @param targetFormKey - 目标表单的 formKey（来自 REFERENCE 字段的 targetFormId）。
 * @param refId         - 被引用记录的主键 ID。
 * @returns 显示文本（解析成功→目标记录显示字段值；解析失败→原样返回 refId）。
 *
 * @example
 * // 正常解析
 * await resolveReferenceDisplay('leave-form', 'rec_001') // → '张三'
 *
 * // 记录已删 / 找不到
 * await resolveReferenceDisplay('leave-form', 'deleted-id') // → 'deleted-id'
 */
export async function resolveReferenceDisplay(
  targetFormKey: string,
  refId: string,
): Promise<string> {
  if (!targetFormKey || !refId) return refId

  let definition: FormSchema
  try {
    definition = await getFormDefinition(targetFormKey)
  } catch {
    return refId
  }

  const displayField = deriveDisplayField(definition)

  try {
    const result = await queryFormData(targetFormKey, {
      pageNum: 1,
      pageSize: 1,
      filters: [{ field: 'id', op: 'EQ', value: refId }],
    })
    const record = result.list?.[0]
    if (!record) return refId

    const displayValue = record[displayField]
    return displayValue !== null && displayValue !== undefined ? String(displayValue) : refId
  } catch {
    return refId
  }
}
