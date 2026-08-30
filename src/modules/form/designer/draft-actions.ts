import { ElMessage } from 'element-plus'
import type { FormSchema } from '@/contracts/form-schema'
import type { FormDefDTO, FormDefStatus } from '../api/form-def'
import { createFormDef, saveFormConfig, publishFormDef } from '../api/form-def'
import { ApiError } from '@/foundation/request'

/**
 * 保存草稿 / 发布动作（第四刀：接线真后端）。
 *
 * 本文件替换第一刀的空跑 log，通过 foundation/request 走真实后端端点。
 * FormDesigner.vue 调用处参数略有变化（返回值从 void 变为含 id/status 的对象），
 * 但动作语义不变。
 */

export interface SaveDraftResult {
  /** 表单定义 id（UUID）。新建草稿时由后端生成，编辑态传入已有 id。 */
  id: string
  status: FormDefStatus
}

/**
 * 保存草稿：当前设计若还没有 id（新建态）→ 先建草稿再存 definition；
 * 已有 id（编辑态）→ 直接存 definition。
 *
 * definition = 当前 items 转成的 FormSchema 序列化字符串。
 */
export async function saveDraftDefinition(
  definition: FormSchema,
  existingId: string | null,
  formKey: string,
): Promise<SaveDraftResult> {
  try {
    let id = existingId

    if (!id) {
      // 新建态：先建草稿拿到 id
      const created = await createFormDef({
        formKey,
        name: definition.title,
      })
      id = created.id
    }

    // 存 definition（新建/编辑都走此步）
    const definitionJson = JSON.stringify(definition)
    await saveFormConfig(id, definitionJson)

    ElMessage.success('草稿已保存')
    return { id, status: 'DRAFT' }
  } catch (err) {
    handleError(err, '保存草稿失败')
    throw err
  }
}

/**
 * 发布：先存一次 config（硬时序），再调 publish。
 *
 * 后端 publish 从库读 definition，不接前端传的，所以发布前必须先 saveConfig。
 * 发布成功后返回更新后的 FormDefDTO（status=PUBLISHED）。
 */
export async function publishDefinition(definition: FormSchema, id: string): Promise<FormDefDTO> {
  try {
    // 硬时序：先存 config，再 publish（不可颠倒、不可省）
    const definitionJson = JSON.stringify(definition)
    await saveFormConfig(id, definitionJson)

    const published = await publishFormDef(id)
    ElMessage.success('发布成功')
    return published
  } catch (err) {
    handleError(err, '发布失败')
    throw err
  }
}

/**
 * 错误归一处理：ApiError 用后端中文 message，其余用兜底文案。
 */
function handleError(err: unknown, fallback: string): void {
  if (err instanceof ApiError) {
    ElMessage.error(err.msg || fallback)
  } else if (err instanceof Error) {
    ElMessage.error(err.message || fallback)
  } else {
    ElMessage.error(fallback)
  }
}
