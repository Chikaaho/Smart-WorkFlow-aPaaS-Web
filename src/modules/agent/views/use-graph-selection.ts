import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { i18n } from '@/locales'
import type { FlowGraphData, FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import { getNodePanelDescriptor } from './panels/node-panel-registry'
import { NODE_TYPE_CONDITION } from '@/modules/agent/utils/graphAdapter'
import { buildVariableGroups } from '@/modules/agent/utils/variableReferences'

export interface GraphSelectionDeps {
  graphData: Ref<FlowGraphData>
  selectedNodeId: Ref<string | null>
  selectedEdgeId: Ref<string | null>
}

/**
 * 选中态派生：选中节点/连线、连接页签出入边、CONDITION 出边、
 * 可插拔面板描述符与当前节点可用变量组（G1-5：只列上游可达节点输出 + 开始参数）。
 */
export function useGraphSelection(deps: GraphSelectionDeps) {
  const { graphData, selectedNodeId, selectedEdgeId } = deps

  const selectedNode = computed<FlowGraphNode | null>(
    () => graphData.value.nodes.find((n) => n.id === selectedNodeId.value) ?? null,
  )

  const selectedEdge = computed<FlowGraphEdge | null>(
    () => graphData.value.edges.find((e) => e.id === selectedEdgeId.value) ?? null,
  )

  const selectedNodeType = computed(() => selectedNode.value?.type ?? '')

  const incomingEdges = computed(() =>
    graphData.value.edges.filter((e) => e.target === selectedNodeId.value),
  )
  const outgoingEdges = computed(() =>
    graphData.value.edges.filter((e) => e.source === selectedNodeId.value),
  )

  /** CONDITION 节点出边（条件分支关键词编辑入口） */
  const conditionOutEdges = computed<FlowGraphEdge[]>(() => {
    if (selectedNodeType.value !== NODE_TYPE_CONDITION || !selectedNode.value) return []
    return outgoingEdges.value
  })

  const panelDescriptor = computed(() => getNodePanelDescriptor(selectedNodeType.value))
  const panelComponent = computed(() => panelDescriptor.value?.component ?? null)
  const panelLabel = computed(() =>
    panelDescriptor.value ? i18n.global.t(panelDescriptor.value.labelKey) : selectedNodeType.value,
  )

  /** 当前节点可用变量（G1-5：只列上游可达节点输出 + 开始参数） */
  const variableGroups = computed(() =>
    selectedNode.value
      ? buildVariableGroups(selectedNode.value, graphData.value.nodes, graphData.value.edges)
      : [],
  )

  const activeNodeTab = ref<'config' | 'connection'>('config')

  watch(selectedNodeId, () => {
    activeNodeTab.value = 'config'
  })

  function edgeDisplayName(edge: FlowGraphEdge): string {
    const from = graphData.value.nodes.find((n) => n.id === edge.source)
    const to = graphData.value.nodes.find((n) => n.id === edge.target)
    return `${from?.label ?? edge.source} → ${to?.label ?? edge.target}`
  }

  return {
    selectedNode,
    selectedEdge,
    selectedNodeType,
    incomingEdges,
    outgoingEdges,
    conditionOutEdges,
    panelDescriptor,
    panelComponent,
    panelLabel,
    variableGroups,
    activeNodeTab,
    edgeDisplayName,
  }
}

export type GraphSelectionApi = ReturnType<typeof useGraphSelection>
