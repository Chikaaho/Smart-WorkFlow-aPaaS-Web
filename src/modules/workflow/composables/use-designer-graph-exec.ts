import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import type { BpmVariableDef } from '@/contracts/p64'
import type { DesignerGraph } from '../composables/designer-graph'
import type {
  AgentGraphDef,
  AgentGraphSnapshot,
  AgentGraphVersionBinding,
} from '@/adapters/agent-graph-catalog'
import {
  listGraphVersions,
  listPublishedGraphDefs,
  getGraphVersionBinding,
} from '@/adapters/agent-graph-catalog'

/** 入参映射行（与 agent 子图节点同构：name=图入参名，source=流程变量名）。 */
export interface GraphExecInputRow {
  name: string
  required: boolean
  description: string
  source: string
}

/** 出参映射行（name=目标流程变量名，source=图出参名）。 */
export interface GraphExecOutputRow {
  source: string
  description: string
  target: string
}

/** useDesignerGraphExec 入参。 */
export interface DesignerGraphExecOptions {
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 版本预览态（预览只读）。 */
  isVersionPreview: ComputedRef<boolean>
  /** 流程图文档（variables 供映射变量候选）。 */
  graph: Ref<DesignerGraph | null>
  /** 配置快照（写节点配置后调用，保持既有保存链）。 */
  snapshot: () => void
}

/**
 * 1.2.0 P67（E1-1）：Graph 执行器节点面板状态。
 *
 * 绑定三段：已发布图下拉（listPublishedGraphDefs）→ 固定版本下拉
 * （listGraphVersions）→ 版本绑定描述（getGraphVersionBinding：开始/结束参数声明、
 * 执行超时上限、是否含人工节点）。入参映射行由绑定声明驱动（必填标注、不手写参数名），
 * 出参映射行同理；面板每次变更即写节点配置（updateNodeConfig + snapshot）。
 */
export function useDesignerGraphExec(options: DesignerGraphExecOptions) {
  const { selectedNode, model, isVersionPreview, graph, snapshot } = options

  const graphExecActive = computed(() => selectedNode.value?.type === 'GRAPH_EXEC')

  /** 失败策略（R2-ui：CONTINUE 时面板写明分流方式）。 */
  const failureStrategy = computed(() => {
    const config = (selectedNode.value?.config ?? {}) as Record<string, unknown>
    return typeof config.failureStrategy === 'string' ? config.failureStrategy : 'BLOCK'
  })

  const graphs = ref<AgentGraphDef[]>([])
  const graphsLoading = ref(false)
  const versions = ref<AgentGraphSnapshot[]>([])
  const binding = ref<AgentGraphVersionBinding | null>(null)
  const bindingLoading = ref(false)
  const bindingError = ref('')

  const graphDefId = ref('')
  const graphDefVersion = ref('')
  const inputRows = ref<GraphExecInputRow[]>([])
  const outputRows = ref<GraphExecOutputRow[]>([])

  /** 映射变量候选：流程变量名（运行期 setVariable/getVariable 的键）。 */
  const variableOptions = computed(() =>
    (graph.value?.variables ?? []).map((variable: BpmVariableDef) => variable.name),
  )

  function applyGraphExec() {
    if (!selectedNode.value || !model.value || isVersionPreview.value) return
    model.value.updateNodeConfig(selectedNode.value.id, {
      graphDefId: graphDefId.value,
      graphDefVersion: graphDefVersion.value,
      inputMappings: inputRows.value
        .filter((row) => row.name && row.source)
        .map((row) => ({ name: row.name, source: row.source })),
      outputMappings: outputRows.value
        .filter((row) => row.target && row.source)
        .map((row) => ({ name: row.target, source: row.source })),
    })
    snapshot()
  }

  /** 载入固定版本绑定：映射行按声明重建（同名保留已填变量）。 */
  async function loadBinding(id: string, version: string) {
    bindingError.value = ''
    binding.value = null
    if (!id || !version) return
    bindingLoading.value = true
    try {
      const loaded = await getGraphVersionBinding(id, Number(version))
      binding.value = loaded
      const previousInputs = new Map(inputRows.value.map((row) => [row.name, row.source]))
      inputRows.value = loaded.startParams.map(
        (param: { name: string; required: boolean; description: string }) => ({
          name: param.name,
          required: param.required,
          description: param.description,
          source: previousInputs.get(param.name) ?? '',
        }),
      )
      const previousOutputs = new Map(outputRows.value.map((row) => [row.source, row.target]))
      outputRows.value = loaded.endParams.map((output: { name: string; description: string }) => ({
        source: output.name,
        description: output.description,
        target: previousOutputs.get(output.name) ?? '',
      }))
    } catch (err) {
      bindingError.value = err instanceof Error ? err.message : String(err)
      inputRows.value = []
      outputRows.value = []
    } finally {
      bindingLoading.value = false
    }
  }

  async function onGraphChange(id: string) {
    graphDefId.value = id
    graphDefVersion.value = ''
    versions.value = []
    binding.value = null
    inputRows.value = []
    outputRows.value = []
    applyGraphExec()
    if (!id) return
    try {
      versions.value = await listGraphVersions(id)
      // 默认选中最新发布版本（版本下拉新版本在前）
      const latest = versions.value[0]
      if (latest) await onVersionChange(String(latest.defVersion))
    } catch {
      // 版本加载失败保持空下拉，由用户重选
    }
  }

  async function onVersionChange(version: string) {
    graphDefVersion.value = version
    applyGraphExec()
    await loadBinding(graphDefId.value, version)
    applyGraphExec()
  }

  /** 选中节点切换：从节点配置回显，并按需补载版本与绑定。 */
  watch(
    () => selectedNode.value?.id,
    async () => {
      if (!graphExecActive.value) return
      const config = (selectedNode.value?.config ?? {}) as Record<string, unknown>
      graphDefId.value = config.graphDefId == null ? '' : String(config.graphDefId)
      graphDefVersion.value = config.graphDefVersion == null ? '' : String(config.graphDefVersion)
      const previousInputs = Array.isArray(config.inputMappings)
        ? (config.inputMappings as Array<{ name?: string; source?: string }>)
        : []
      const previousOutputs = Array.isArray(config.outputMappings)
        ? (config.outputMappings as Array<{ name?: string; source?: string }>)
        : []
      // 先按既有配置回填（未载入绑定时也能显示已保存的映射）
      inputRows.value = previousInputs.map((row) => ({
        name: row.name ?? '',
        required: false,
        description: '',
        source: row.source ?? '',
      }))
      outputRows.value = previousOutputs.map((row) => ({
        source: row.source ?? '',
        description: '',
        target: row.name ?? '',
      }))
      if (graphs.value.length === 0 && !graphsLoading.value) {
        graphsLoading.value = true
        try {
          graphs.value = await listPublishedGraphDefs()
        } catch {
          graphs.value = []
        } finally {
          graphsLoading.value = false
        }
      }
      if (graphDefId.value && !versions.value.length) {
        try {
          versions.value = await listGraphVersions(graphDefId.value)
        } catch {
          versions.value = []
        }
      }
      if (graphDefId.value && graphDefVersion.value && !binding.value) {
        await loadBinding(graphDefId.value, graphDefVersion.value)
      }
    },
    { immediate: true },
  )

  return {
    graphExecActive,
    failureStrategy,
    graphs,
    graphsLoading,
    versions,
    binding,
    bindingLoading,
    bindingError,
    graphDefId,
    graphDefVersion,
    inputRows,
    outputRows,
    variableOptions,
    onGraphChange,
    onVersionChange,
    applyGraphExec,
  }
}
