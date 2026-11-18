import { ref } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import {
  saveProcessDefGraph,
  publishProcessDef,
  validateProcessDefGraph,
} from '@/modules/workflow/api'
import type { GraphValidationError } from '@/modules/workflow/api'
import { buildDesignerGraphPayload } from '@/modules/workflow/utils/graph-payload'
import { validateNodeConfigSemantics } from '@/modules/workflow/utils/node-capabilities'
import type { DesignerModel } from '@/adapters/process-graph'
import type { DesignerGraph } from './designer-graph'

/** useDesignerSave 入参。 */
export interface DesignerSaveOptions {
  /** 流程定义 id。 */
  defId: Ref<string>
  /** 设计器图文档（响应式）。 */
  graph: Ref<DesignerGraph | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 版本预览态（预览只读，禁用保存/校验/发布）。 */
  isVersionPreview: ComputedRef<boolean>
  /** 页面错误信息（保存失败回写）。 */
  errorMsg: Ref<string>
  /** 发布成功后的重新加载（主文件 load）。 */
  reload: () => Promise<void>
}

/**
 * 设计器草稿保存 / 校验 / 发布 + 未保存离开确认（自 ProcessDesigner.vue 原地迁出）。
 *
 * 复核02 G6a：头部只反映真实保存结果——模型变更为脏状态；发布消费服务端持久化图，
 * 存在未保存更改时先真实保存，杜绝"发布旧图"。
 */
export function useDesignerSave(options: DesignerSaveOptions) {
  const { defId, graph, model, isVersionPreview, errorMsg, reload } = options
  const { t } = useI18n()

  /** 草稿保存状态（复核02 G6a 修复）：头部只反映真实保存结果——加载时刻不再假报
   * "草稿已保存"；模型变更为脏状态并防抖自动保存（1.5s），保存成功后刷新时钟。 */
  const savedAtText = ref('')
  const dirty = ref(false)
  let lastSavedJson = ''
  function formatClock(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  function currentGraphJson(): string {
    try {
      return JSON.stringify(model.value?.serialize() ?? {})
    } catch {
      return ''
    }
  }
  function onModelChanged() {
    const json = currentGraphJson()
    if (!json || json === lastSavedJson) return
    // BF20261013-022⑤：关闭自动保存，仅标记未保存状态（离开时提醒）
    dirty.value = true
  }

  /** BF20261013-022⑤：未保存离开提醒——路由离开弹确认框；刷新/关闭走浏览器原生确认。 */
  // DOM 全局类型按仓库约定用结构类型（不裸引 DOM 全局）
  function beforeUnloadGuard(event: { preventDefault(): void; returnValue: string }) {
    if (!dirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  /** 未保存离开确认（设计 272:1575）：600 宽三选一——取消/不保存/保存。 */
  const leaveConfirmVisible = ref(false)
  let leaveConfirmResolver: ((proceed: boolean) => void) | null = null

  function settleLeaveConfirm(proceed: boolean): void {
    const resolve = leaveConfirmResolver
    leaveConfirmResolver = null
    leaveConfirmVisible.value = false
    resolve?.(proceed)
  }

  function askLeaveConfirmation(): Promise<boolean> {
    // 同一时刻只挂一个确认；重复触发按“继续编辑”处理，避免并发导航双弹窗。
    if (leaveConfirmResolver) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      leaveConfirmResolver = resolve
      leaveConfirmVisible.value = true
    })
  }

  async function confirmLeaveIfDirty(): Promise<boolean> {
    if (!dirty.value) return true
    const proceed = await askLeaveConfirmation()
    if (!proceed) return false
    dirty.value = false
    return true
  }

  /** 关闭按钮 / Esc / 点击遮罩：继续编辑。 */
  function onLeaveConfirmClosed(): void {
    settleLeaveConfirm(false)
  }

  /** 保存成功后离开；保存失败留在编辑器（错误沿用既有保存提示）。 */
  function saveAndLeave(): void {
    void (async () => {
      const saved = await save()
      settleLeaveConfirm(saved)
    })()
  }

  onBeforeRouteLeave(() => confirmLeaveIfDirty())

  /* ─────────── 保存 / 校验 / 发布 ─────────── */

  const saving = ref(false)
  const validating = ref(false)
  const publishing = ref(false)
  const validationErrors = ref<GraphValidationError[]>([])

  function markSaved() {
    dirty.value = false
    savedAtText.value = formatClock(new Date())
    lastSavedJson = currentGraphJson()
  }

  /** 加载完成：以当前图为基线清空脏标记与保存时钟（复核02 G6a；原 load 内联逻辑）。 */
  function resetSaveBaseline() {
    lastSavedJson = currentGraphJson()
    dirty.value = false
    savedAtText.value = ''
  }

  /** P63 保存前语义校验：FORM_FIELD/动态并行配置错误以中文提示直接展示（对齐服务端口径）。 */
  function assertNodeSemantics(): boolean {
    if (!model.value) return true
    const semanticErrors = validateNodeConfigSemantics(model.value.serialize())
    if (semanticErrors.length === 0) return true
    errorMsg.value = semanticErrors.join('；')
    ElMessage.error(semanticErrors[0])
    return false
  }

  /** 保存载荷：serialize() 只含画布契约字段，文档级 P64/通知配置在此合并。 */
  function buildGraphPayload(): Record<string, unknown> {
    return buildDesignerGraphPayload(
      (model.value?.serialize() ?? {}) as Record<string, unknown>,
      graph.value,
    )
  }

  /** 保存草稿；返回是否真实保存成功（发布前依赖该结果避免“发布旧图”）。 */
  async function save(): Promise<boolean> {
    if (!model.value || !graph.value || !defId.value || isVersionPreview.value) return false
    if (!assertNodeSemantics()) return false
    saving.value = true
    errorMsg.value = ''
    try {
      await saveProcessDefGraph(defId.value, buildGraphPayload())
      // 复核02 G6a：以真实保存成功为准刷新状态（脏清零 + 时钟 + 基线快照）
      markSaved()
      ElMessage.success(t('common.draftSaved'))
      return true
    } catch (err) {
      errorMsg.value = (err as { msg?: string }).msg ?? t('common.saveFailed')
      return false
    } finally {
      saving.value = false
    }
  }

  async function validate() {
    if (!model.value || !defId.value || isVersionPreview.value) return
    // 本地语义校验未通过时不再请求服务端（错误口径一致且可先定位画布节点）
    if (!assertNodeSemantics()) {
      validationErrors.value = []
      return
    }
    validating.value = true
    validationErrors.value = []
    try {
      // 先保存草稿再校验，保证服务端查询到最新图
      await saveProcessDefGraph(defId.value, buildGraphPayload())
      markSaved()
      validationErrors.value = await validateProcessDefGraph(defId.value)
      if (validationErrors.value.length === 0) {
        ElMessage.success({
          message: t('workflow.validationPassedNoErrors'),
          customClass: 'designer-feedback-toast',
          offset: 84,
        })
      }
    } catch (err) {
      errorMsg.value = (err as { msg?: string }).msg ?? t('workflow.graphValidationFailed')
    } finally {
      validating.value = false
    }
  }

  async function publish() {
    if (!defId.value || isVersionPreview.value) return
    try {
      await ElMessageBox.confirm(
        t('workflow.publishConfirmMessage'),
        t('common.publishConfirmTitle'),
        {
          get confirmButtonText() {
            return t('workflow.confirmPublishButton')
          },
          get cancelButtonText() {
            return t('common.cancel')
          },
          type: 'warning',
        },
      )
    } catch {
      return
    }
    publishing.value = true
    try {
      // 复核02 G6a：发布消费的是服务端持久化图——存在未保存更改时先真实保存，杜绝"发布旧图"；
      // P63：保存被语义校验拦截时中止发布，避免带着旧图继续走发布链路
      if (dirty.value) {
        const saved = await save()
        if (!saved) return
      }
      await publishProcessDef(defId.value)
      ElMessage.success({
        message: t('workflow.publishSucceeded'),
        customClass: 'designer-feedback-toast',
        offset: 84,
      })
      await reload()
    } catch (err) {
      ElMessage.error((err as { msg?: string }).msg ?? t('workflow.publishFailedZeroDeploy'))
    } finally {
      publishing.value = false
    }
  }

  return {
    savedAtText,
    dirty,
    currentGraphJson,
    onModelChanged,
    beforeUnloadGuard,
    leaveConfirmVisible,
    settleLeaveConfirm,
    confirmLeaveIfDirty,
    onLeaveConfirmClosed,
    saveAndLeave,
    saving,
    validating,
    publishing,
    validationErrors,
    markSaved,
    resetSaveBaseline,
    save,
    validate,
    publish,
  }
}
