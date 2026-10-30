import { i18n } from '@/locales'
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

/** 保存成功提示的呈现参数：仅调用方显式传入时生效，其他入口保持默认提示。 */
export interface SaveDraftSuccessToast {
  /** 专用样式类（落真实 .el-message 根）。 */
  className?: string
  /** 距视口顶部距离（px）。 */
  offset?: number
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
  /** 首次创建时携带的归属（0.1.7 回归01b：应用内新建，未保存不建记录） */
  createExtras?: { appId?: string | null; dirId?: string | null },
  /** 保存成功轻提示的专用外观（仅 FormDesigner 工作台传入）。 */
  successToast?: SaveDraftSuccessToast,
): Promise<SaveDraftResult> {
  try {
    let id = existingId

    if (!id) {
      // 新建态：先建草稿拿到 id（应用内新建携带应用/目录归属）
      const created = await createFormDef({
        formKey,
        name: definition.title,
        appId: createExtras?.appId ?? null,
        dirId: createExtras?.dirId ?? null,
      })
      id = created.id
    }

    // 存 definition（新建/编辑都走此步）
    const definitionJson = JSON.stringify(definition)
    await saveFormConfig(id, definitionJson)

    const successText = i18n.global.t('common.draftSaved')
    if (successToast) {
      ElMessage.success({
        message: successText,
        customClass: successToast.className,
        offset: successToast.offset,
      })
    } else {
      ElMessage.success(successText)
    }
    return { id, status: 'DRAFT' }
  } catch (err) {
    handleError(err, i18n.global.t('common.saveDraftFailed'))
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
    ElMessage.success(i18n.global.t('common.publishSuccess'))
    return published
  } catch (err) {
    handleError(err, i18n.global.t('common.publishFailed'))
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
