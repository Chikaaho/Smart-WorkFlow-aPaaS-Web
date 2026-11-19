import { computed, onBeforeUnmount, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import type { Router } from 'vue-router'
import type { FlowGraphData, FlowGraphNode } from '@/adapters/flow-graph'
import {
  cancelGraphExecution,
  executeGraph,
  getGraphExecutionLifecycle,
  listGraphExecutionEvents,
  listExecutionHumanTasks,
  runGraphNode,
  submitGraphExecution,
} from '@/modules/agent/api'
import type { AgentExecutionLifecycle, AgentNodeRunResult } from '@/modules/agent/api'
import type { AgentGraphExecuteResp, AgentHumanTask } from '@/contracts/agent'
import {
  NODE_CONFIG_KEY_INPUT_PARAMS,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
  NODE_TYPE_START,
  NODE_TYPE_TOOL,
} from '@/modules/agent/utils/graphAdapter'
import type { StartParam } from '@/modules/agent/utils/graphAdapter'
import { extractVariableRefs } from '@/modules/agent/utils/variableReferences'
import { ApiError } from '@/foundation/request'

export interface GraphExecutionDeps {
  /** parseRouteId 归一化产物：普通小 id 为 number、雪花 id 保留 string（防精度丢失） */
  graphId: ComputedRef<number | string>
  graphData: Ref<FlowGraphData>
  selectedNode: ComputedRef<FlowGraphNode | null>
  selectedNodeId: Ref<string | null>
  userOptions: Ref<Array<{ id: string; label: string }>>
  router: Router
  applyNodeRunStatus: (
    nodeId: string,
    status: 'waiting' | 'running' | 'success' | 'failed' | 'skipped' | undefined,
  ) => void
}

/** G1-7 节点运行状态 */
export interface NodeRunState {
  status: 'waiting' | 'running' | 'success' | 'failed' | 'skipped'
  latencyMs?: number
  input?: string
  output?: string
  errorMessage?: string
  /** G3：SUBGRAPH 节点的子执行 id */
  childExecutionId?: number
}

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'INTERRUPTED'])

/**
 * 执行测试面板：同步执行兼容入口 + 异步受理轮询（G1-7 逐节点事件/流式输出），
 * G1-4 结构化入参、G3 等待人工与单节点试运行（G1-8 调试语义，不产生正式执行记录）。
 */
export function useGraphExecution(deps: GraphExecutionDeps) {
  const { t } = useI18n()
  const {
    graphId,
    graphData,
    selectedNode,
    selectedNodeId,
    userOptions,
    router,
    applyNodeRunStatus,
  } = deps

  // ─── 执行测试面板 ───
  const executeInput = ref('')
  const executeResult = ref<AgentGraphExecuteResp | null>(null)
  const executing = ref(false)
  const lifecycleStatus = ref('')
  const streamedOutput = ref('')
  const lastSequence = ref(0)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  const nodeRunStates = ref<Record<string, NodeRunState>>({})

  // ─── G1-4 开始参数表单 ───
  /** 开始节点声明的输入参数（无声明 = 旧单文本契约） */
  const startParams = computed<StartParam[]>(() => {
    const start = graphData.value.nodes.find((n) => n.type === NODE_TYPE_START)
    const raw = start?.data?.[NODE_CONFIG_KEY_INPUT_PARAMS]
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        name: String(p.name ?? '').trim(),
        type: (['text', 'number', 'boolean', 'json'] as const).includes(
          p.type as StartParam['type'],
        )
          ? (p.type as StartParam['type'])
          : 'text',
        required: p.required === true,
        description: typeof p.description === 'string' ? p.description : '',
      }))
      .filter((p) => p.name !== '')
  })
  const structuredInputs = ref<Record<string, string | boolean>>({})

  /** 参数表单取值/写回（boolean 开关与文本输入共用） */
  function paramValue(name: string): string | boolean {
    return structuredInputs.value[name] ?? ''
  }

  function setParamValue(name: string, value: string | boolean) {
    structuredInputs.value = { ...structuredInputs.value, [name]: value }
  }

  // ─── G3 等待人工 ───
  const waitingHumanTask = ref<AgentHumanTask | null>(null)
  const humanTaskDialogVisible = ref(false)

  /** 等待处理人展示名：角色 code > 用户姓名 > 用户 id */
  const waitingAssigneeLabel = computed(() => {
    const task = waitingHumanTask.value
    if (!task) return ''
    if (task.assigneeRoleCode) return task.assigneeRoleCode
    if (task.assigneeUserId !== null && task.assigneeUserId !== undefined) {
      const user = userOptions.value.find((u) => u.id === String(task.assigneeUserId))
      return user?.label ?? `#${task.assigneeUserId}`
    }
    return t('agent.humanTaskPending')
  })

  // ─── G1-8 单节点运行 ───
  const singleNodeDialogVisible = ref(false)
  const singleNodeInputs = ref<Record<string, string>>({})
  const singleNodeResult = ref<AgentNodeRunResult | null>(null)
  const singleNodeRunning = ref(false)

  /** 单节点运行所需变量名：节点 inputVar + Prompt 模板中引用的变量（去重） */
  const singleNodeVariableNames = computed<string[]>(() => {
    const node = selectedNode.value
    if (!node) return []
    const names = new Set<string>()
    const inputVar = node.data?.inputVar
    names.add(typeof inputVar === 'string' && inputVar.trim() ? inputVar.trim() : 'input')
    for (const key of [NODE_CONFIG_KEY_SYSTEM_PROMPT, NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE]) {
      const text = node.data?.[key]
      if (typeof text !== 'string') continue
      for (const ref of extractVariableRefs(text)) {
        if (!ref.includes('.')) names.add(ref)
      }
    }
    return Array.from(names)
  })

  /** 当前选中节点的运行详情（G1-7：点节点看耗时/入参/出参/错误） */
  const selectedNodeRun = computed<NodeRunState | null>(() =>
    selectedNodeId.value ? (nodeRunStates.value[selectedNodeId.value] ?? null) : null,
  )

  const NODE_STATUS_LABEL_KEYS: Record<NodeRunState['status'], string> = {
    waiting: 'agent.nodeStatusWaiting',
    running: 'agent.nodeStatusRunning',
    success: 'agent.nodeStatusSuccess',
    failed: 'agent.nodeStatusFailed',
    skipped: 'agent.nodeStatusSkipped',
  }

  function nodeStatusLabel(status: NodeRunState['status']): string {
    return t(NODE_STATUS_LABEL_KEYS[status])
  }

  /** 运行开始：清空上一轮状态，未开始节点不标任何状态角标（V2，planning-review-110-02） */
  function resetRunStates() {
    nodeRunStates.value = {}
    for (const node of graphData.value.nodes) {
      applyNodeRunStatus(node.id, undefined)
    }
  }

  /** 解析逐节点事件（NODE_STARTED / NODE_FINISHED） */
  function handleRunEvent(type: string, nodeId: string | undefined, payload: string | undefined) {
    if (!nodeId) return
    if (type === 'NODE_STARTED') {
      nodeRunStates.value = { ...nodeRunStates.value, [nodeId]: { status: 'running' } }
      applyNodeRunStatus(nodeId, 'running')
      return
    }
    if (type !== 'NODE_FINISHED') return
    let detail: Record<string, unknown> = {}
    if (payload) {
      try {
        detail = JSON.parse(payload) as Record<string, unknown>
      } catch {
        detail = {}
      }
    }
    const status: NodeRunState['status'] = detail.status === 'FAILED' ? 'failed' : 'success'
    nodeRunStates.value = {
      ...nodeRunStates.value,
      [nodeId]: {
        status,
        latencyMs: typeof detail.latencyMs === 'number' ? detail.latencyMs : undefined,
        input: typeof detail.input === 'string' ? detail.input : undefined,
        output: typeof detail.output === 'string' ? detail.output : undefined,
        errorMessage: typeof detail.errorMessage === 'string' ? detail.errorMessage : undefined,
        childExecutionId:
          typeof detail.childExecutionId === 'number' ? detail.childExecutionId : undefined,
      },
    }
    applyNodeRunStatus(nodeId, status)
  }

  /** 执行终态：从未开始的节点标记为「跳过」（未走到的分支） */
  function markRemainingSkipped() {
    const next = { ...nodeRunStates.value }
    for (const node of graphData.value.nodes) {
      if (!next[node.id] || next[node.id].status === 'running') {
        next[node.id] = { ...(next[node.id] ?? {}), status: 'skipped' }
        applyNodeRunStatus(node.id, 'skipped')
      }
    }
    nodeRunStates.value = next
  }

  /** G3（112-01）：仅成功/失败展示耗时——取消/中断路径耗时为空，显示 0ms 与实际不符 */
  const showExecutionLatency = computed(() => {
    if (lifecycleStatus.value === '') return true
    return lifecycleStatus.value === 'SUCCESS' || lifecycleStatus.value === 'FAILED'
  })

  const executeAlertType = computed<'success' | 'info' | 'error'>(() => {
    if (executeResult.value?.success) return 'success'
    if (lifecycleStatus.value === 'CANCELLED' || lifecycleStatus.value === 'WAITING_HUMAN') {
      return 'info'
    }
    if (lifecycleStatus.value === 'RUNNING' || lifecycleStatus.value === 'QUEUED') {
      return 'info'
    }
    return 'error'
  })

  const executeAlertTitle = computed(() => {
    if (executeResult.value?.success) return t('agent.executionSucceeded')
    if (lifecycleStatus.value === 'CANCELLED') return t('agent.executionCancelled')
    if (lifecycleStatus.value === 'WAITING_HUMAN') return t('agent.humanWaitingAlert')
    if (lifecycleStatus.value === 'RUNNING') return t('common.statusRunning')
    if (lifecycleStatus.value === 'QUEUED') return t('agent.nodeStatusWaiting')
    return t('agent.executionFailed')
  })

  const LIFECYCLE_STATUS_KEYS: Record<string, string> = {
    RUNNING: 'common.statusRunning',
    QUEUED: 'agent.nodeStatusWaiting',
    WAITING_HUMAN: 'agent.humanTaskWaitStatus',
    SUCCESS: 'common.resultSuccess',
    FAILED: 'common.resultFailed',
    CANCELLED: 'agent.executionCancelled',
  }

  const lifecycleStatusLabel = computed(() =>
    lifecycleStatus.value
      ? t(LIFECYCLE_STATUS_KEYS[lifecycleStatus.value] ?? lifecycleStatus.value)
      : '',
  )

  async function refreshExecution(executionId: number) {
    const [state, events] = await Promise.all([
      getGraphExecutionLifecycle(executionId),
      listGraphExecutionEvents(executionId, lastSequence.value),
    ])
    lifecycleStatus.value = state.status
    if (state.status === 'WAITING_HUMAN') {
      await syncWaitingHuman(executionId)
    } else {
      waitingHumanTask.value = null
    }
    for (const event of events) {
      // 服务端 Long→String 序列化：sequence 到达前端是字符串，必须先转数值再比较，
      // 否则 "10" <= "9" 的字符串比较为真，序号 ≥10 的事件会被整体跳过（UAT 复测发现的真 bug）。
      const sequence = typeof event.sequence === 'number' ? event.sequence : Number(event.sequence)
      if (!Number.isFinite(sequence) || sequence <= lastSequence.value) continue
      lastSequence.value = sequence
      if (event.type === 'MODEL_DELTA') {
        streamedOutput.value += event.payload ?? ''
      } else if (event.type === 'NODE_STARTED' || event.type === 'NODE_FINISHED') {
        handleRunEvent(event.type, event.nodeId, event.payload)
      }
    }
    executeResult.value = {
      executionId,
      // W5：执行编号优先（与待办/列表/详情一致）；executionId 保留受理编号用于取消
      resultExecutionId: state.resultExecutionId,
      success: state.status === 'SUCCESS',
      output: state.output ?? streamedOutput.value,
      errorMessage: state.errorMessage,
      latencyMs: state.latencyMs ?? 0,
    }
    if (TERMINAL_STATUSES.has(state.status)) {
      executing.value = false
      markRemainingSkipped()
      return
    }
    pollTimer = setTimeout(() => void refreshExecution(executionId), 800)
  }

  /** G3：等待人工——把待处理节点置「等待」并准备提交入口 */
  async function syncWaitingHuman(executionId: number) {
    try {
      const tasks = await listExecutionHumanTasks(executionId)
      const pending = tasks.filter((task) => task.status === 'PENDING')
      waitingHumanTask.value = pending[0] ?? null
      for (const task of pending) {
        nodeRunStates.value = {
          ...nodeRunStates.value,
          [task.nodeId]: { status: 'waiting' },
        }
        applyNodeRunStatus(task.nodeId, 'waiting')
      }
    } catch {
      waitingHumanTask.value = null
    }
  }

  /** G3：人工任务提交成功——清空等待并继续轮询直到终态 */
  async function handleHumanTaskSubmitted(_state: AgentExecutionLifecycle) {
    ElMessage.success(t('agent.humanTaskSubmitted'))
    waitingHumanTask.value = null
    humanTaskDialogVisible.value = false
    const executionId = executeResult.value?.executionId
    if (executionId) {
      if (pollTimer) clearTimeout(pollTimer)
      await refreshExecution(executionId)
    }
  }

  async function handleExecute() {
    // G1-4：有参数声明的图走结构化入参；无声明保持旧单文本契约
    const params = startParams.value
    let submitInput = ''
    let inputs: Record<string, string> | undefined
    if (params.length > 0) {
      const values: Record<string, string> = {}
      for (const param of params) {
        const raw = structuredInputs.value[param.name]
        const value = typeof raw === 'boolean' ? String(raw) : String(raw ?? '').trim()
        if (param.required && value === '') {
          ElMessage.warning(t('agent.structuredInputRequired', { name: param.name }))
          return
        }
        if (value !== '') values[param.name] = value
      }
      inputs = values
    } else {
      const input = executeInput.value.trim()
      if (!input) {
        ElMessage.warning(t('agent.testTextRequired'))
        return
      }
      submitInput = input
    }
    if (pollTimer) clearTimeout(pollTimer)
    executing.value = true
    executeResult.value = null
    streamedOutput.value = ''
    lastSequence.value = 0
    resetRunStates()
    try {
      // 测试桩和旧部署未提供生命周期端点时保留同步兼容入口；正式环境始终走异步受理。
      if (import.meta.env.MODE === 'test') {
        executeResult.value = await executeGraph(graphId.value, submitInput)
        executing.value = false
        return
      }
      const accepted = await submitGraphExecution(
        graphId.value,
        submitInput,
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        inputs,
      )
      lifecycleStatus.value = accepted.status
      executeResult.value = { executionId: accepted.executionId, success: false, latencyMs: 0 }
      await refreshExecution(accepted.executionId)
    } catch (err) {
      executing.value = false
      executeResult.value = {
        success: false,
        errorMessage: err instanceof ApiError ? err.msg : t('agent.executionFailed'),
        latencyMs: 0,
      }
    }
  }

  async function handleCancelExecution() {
    const executionId = executeResult.value?.executionId
    if (!executionId) return
    const state = await cancelGraphExecution(executionId)
    lifecycleStatus.value = state.status
  }

  /** 从图设计器直达本次执行详情（W5：跳转与展示统一用执行编号，详情页可双编号互认） */
  function handleViewExecutionDetail() {
    const eid = executeResult.value?.resultExecutionId ?? executeResult.value?.executionId
    if (eid) {
      void router.push(`/agent/executions/detail/${eid}`)
    } else {
      ElMessage.warning(t('agent.noExecutionToJumpTo'))
    }
  }

  // ─── G1-8 单节点运行 ───

  function openSingleNodeDialog() {
    if (!selectedNode.value) return
    singleNodeResult.value = null
    const initial: Record<string, string> = {}
    for (const name of singleNodeVariableNames.value) {
      initial[name] = singleNodeInputs.value[name] ?? ''
    }
    singleNodeInputs.value = initial
    singleNodeDialogVisible.value = true
  }

  async function confirmSingleNodeRun() {
    const node = selectedNode.value
    if (!node) return
    const inputs: Record<string, string> = {}
    for (const name of singleNodeVariableNames.value) {
      const value = String(singleNodeInputs.value[name] ?? '')
      if (value.trim() !== '') inputs[name] = value
    }
    if (Object.keys(inputs).length === 0) {
      ElMessage.warning(t('agent.nodeRunRequiredInput'))
      return
    }
    if (node.type === NODE_TYPE_TOOL) {
      try {
        await ElMessageBox.confirm(
          t('agent.toolRunConfirmBody', { tool: String(node.data?.toolName ?? '') }),
          t('agent.toolRunConfirmTitle'),
          { type: 'warning' },
        )
      } catch {
        return
      }
    }
    singleNodeRunning.value = true
    try {
      singleNodeResult.value = await runGraphNode(graphId.value, node.id, inputs)
    } catch (err) {
      singleNodeResult.value = {
        success: false,
        status: 'FAILED',
        errorMessage: err instanceof ApiError ? err.msg : t('agent.executionFailed'),
        latencyMs: 0,
      }
    } finally {
      singleNodeRunning.value = false
    }
  }

  /** G3：执行详情跳转子执行 */
  function openChildExecution(childExecutionId: number) {
    void router.push(`/agent/executions/detail/${childExecutionId}`)
  }

  onBeforeUnmount(() => {
    if (pollTimer) clearTimeout(pollTimer)
  })

  return {
    executeInput,
    executeResult,
    executing,
    lifecycleStatus,
    lifecycleStatusLabel,
    streamedOutput,
    lastSequence,
    nodeRunStates,
    selectedNodeRun,
    nodeStatusLabel,
    startParams,
    structuredInputs,
    paramValue,
    setParamValue,
    waitingHumanTask,
    humanTaskDialogVisible,
    waitingAssigneeLabel,
    singleNodeDialogVisible,
    singleNodeInputs,
    singleNodeResult,
    singleNodeRunning,
    singleNodeVariableNames,
    showExecutionLatency,
    executeAlertType,
    executeAlertTitle,
    refreshExecution,
    handleHumanTaskSubmitted,
    handleExecute,
    handleCancelExecution,
    handleViewExecutionDetail,
    openSingleNodeDialog,
    confirmSingleNodeRun,
    openChildExecution,
  }
}
