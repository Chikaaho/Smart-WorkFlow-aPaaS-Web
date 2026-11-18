import { ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { previewProcessScript } from '@/modules/workflow/api'
import type { PositionedNode } from '@/adapters/process-graph'
import type { TriggerConfig } from '@/contracts/p64'
import type { TriggerDraft } from '@/modules/workflow/utils/p64-orchestration'
import type { ParticipantFormDraft } from '@/modules/workflow/utils/node-capabilities'
import type { DesignerGraph } from './designer-graph'
import type { SubflowFormDraft, SubflowMappingDraft } from './use-designer-subflow'

/* global AbortSignal */

/** useDesignerScriptDialog 入参。 */
export interface DesignerScriptDialogOptions {
  /** 设计器图文档（脚本模拟的变量声明来源；节点触发器落库）。 */
  graph: Ref<DesignerGraph | null>
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 未保存标记（节点触发器落库后置脏）。 */
  dirty: Ref<boolean>
  /** 参与人面板草稿（表达式目标回写）。 */
  participantForm: Ref<ParticipantFormDraft>
  /** 参与人面板提交。 */
  applyParticipant: () => void
  /** 触发器草稿（触发器判断脚本目标回写）。 */
  triggerDraft: Ref<TriggerDraft>
  /** 子流程面板草稿（判断脚本/初始值脚本目标回写）。 */
  subflowForm: Ref<SubflowFormDraft>
  /** 子流程面板提交。 */
  applySubflow: () => void
}

/** 弹窗应用目标：触发器草稿 / 子流程 / 审批人表达式 / 节点触发器。 */
type ScriptDialogTarget =
  | { kind: 'triggerDraft' }
  | { kind: 'subflow' }
  | { kind: 'subflowMapping'; mapping: SubflowMappingDraft }
  | { kind: 'expression' }
  | { kind: 'nodeTrigger'; event: string }

/**
 * BF20261013-022②：统一脚本编辑弹窗编排（流程脚本函数目录）
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerScriptDialog(options: DesignerScriptDialogOptions) {
  const {
    graph,
    selectedNode,
    dirty,
    participantForm,
    applyParticipant,
    triggerDraft,
    subflowForm,
    applySubflow,
  } = options

  const scriptDialogVisible = ref(false)
  const scriptDialogTitle = ref('编辑脚本')
  const scriptDialogCode = ref('')
  let scriptDialogTarget: ScriptDialogTarget | null = null

  function openProcessScriptDialog(title: string, code: string, target: ScriptDialogTarget) {
    scriptDialogTitle.value = title
    scriptDialogCode.value = code ?? ''
    scriptDialogTarget = target
    scriptDialogVisible.value = true
  }

  /**
   * 流程脚本模拟运行：交给服务端脚本引擎（与运行期同一 GraalJS + # 语法糖），
   * 变量按图定义声明传给服务端，由其按类型生成示例值并加载真实组织目录。
   */
  async function simulateProcessScript(code: string, signal?: AbortSignal) {
    const variables = (graph.value?.variables ?? []).map((item) => ({
      name: item.varId,
      type: item.type,
    }))
    const result = await previewProcessScript(code, variables, signal)
    if (result.kind === 'OK') {
      return { ok: true, value: result.value, log: [] }
    }
    return {
      ok: false,
      log: [] as string[],
      error: result.errorMessage || `脚本执行失败（${result.kind}）`,
    }
  }

  function onScriptDialogSave(code: string) {
    const target = scriptDialogTarget
    if (!target) return
    if (target.kind === 'triggerDraft') {
      triggerDraft.value.script = code
    } else if (target.kind === 'subflow') {
      subflowForm.value.script = code
      applySubflow()
    } else if (target.kind === 'subflowMapping') {
      target.mapping.script = code
      applySubflow()
    } else if (target.kind === 'expression') {
      participantForm.value.genericValue = code
      applyParticipant()
    } else if (target.kind === 'nodeTrigger') {
      upsertNodeTriggerScript(target.event as TriggerConfig['event'], code)
    }
  }

  /** ①节点触发器：取该节点指定事件的触发器（不存在即未配置）。 */
  function nodeTriggerOf(event: string): TriggerConfig | null {
    const node = selectedNode.value
    if (!node) return null
    const found = (graph.value?.triggers ?? []).find(
      (item) => item.event === event && item.nodeKey === node.id,
    )
    return found ?? null
  }

  /** ①节点触发器：状态文案（已配置仅显示业务状态，不展示脚本片段）。 */
  function nodeTriggerSummary(event: string): string {
    const trigger = nodeTriggerOf(event)
    if (!trigger || !trigger.script?.trim()) return '未配置'
    return '已配置'
  }

  /** ①节点触发器：打开脚本弹窗（无则应用时创建；变量授权=全部已定义变量）。 */
  function openNodeTriggerScriptDialog(event: string) {
    const node = selectedNode.value
    if (!node) return
    const existing = nodeTriggerOf(event)
    const title = event === 'NODE_ENTERING' ? '节点开始前触发脚本' : '节点结束触发脚本'
    openProcessScriptDialog(title, existing?.script ?? '', { kind: 'nodeTrigger', event })
  }

  /** ①节点触发器：应用脚本（存在则更新；不存在则创建无动作触发器——脚本副作用即用途）。 */
  function upsertNodeTriggerScript(event: TriggerConfig['event'], code: string) {
    const node = selectedNode.value
    if (!graph.value || !node) return
    const triggerId = event === 'NODE_ENTERING' ? `node_enter_${node.id}` : `node_end_${node.id}`
    const triggers = (graph.value.triggers ?? []).filter((item) => item.triggerId !== triggerId)
    const trimmed = code.trim()
    const existing = nodeTriggerOf(event)
    if (!trimmed && !existing) {
      // 清空脚本且原无触发器：无需创建
      return
    }
    const name = event === 'NODE_ENTERING' ? '节点开始前触发' : '节点结束触发'
    triggers.push({
      triggerId,
      name,
      event,
      nodeKey: node.id,
      script: trimmed || 'return null;',
      variables: (graph.value.variables ?? []).map((item) => item.varId),
      branches: [],
      // 节点触发器无动作分支：脚本副作用即用途，返回值不参与匹配（执行记录 UNMATCHED 属正常）
      unmatchedDisposition: 'IGNORE',
      errorDisposition: 'IGNORE',
    })
    graph.value = { ...(graph.value ?? {}), triggers } as DesignerGraph
    dirty.value = true
  }

  /** ④参与人表达式：打开脚本弹窗（表达式=脚本，运行期由 SCRIPT 解析器求值）。 */
  function openExpressionScriptDialog() {
    openProcessScriptDialog('审批人表达式脚本', participantForm.value.genericValue, {
      kind: 'expression',
    })
  }

  return {
    scriptDialogVisible,
    scriptDialogTitle,
    scriptDialogCode,
    openProcessScriptDialog,
    simulateProcessScript,
    onScriptDialogSave,
    nodeTriggerOf,
    nodeTriggerSummary,
    openNodeTriggerScriptDialog,
    openExpressionScriptDialog,
  }
}
