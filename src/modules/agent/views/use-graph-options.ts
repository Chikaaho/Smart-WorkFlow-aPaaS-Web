import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import type { FlowGraphData, FlowGraphNode } from '@/adapters/flow-graph'
import {
  listGraphDefVersions,
  listModelOptions,
  listToolOptions,
  listUserChoices,
  pageGraphDefs,
  pageKnowledgeBases,
} from '@/modules/agent/api'
import type { AgentModelConfigOption, AgentToolOption, KnowledgeBase } from '@/contracts/agent'
import {
  NODE_CONFIG_KEY_SUBGRAPH_DEF_ID,
  NODE_TYPE_SUBGRAPH,
} from '@/modules/agent/utils/graphAdapter'
import { ApiError } from '@/foundation/request'

export interface GraphOptionsDeps {
  /** parseRouteId 归一化产物：普通小 id 为 number、雪花 id 保留 string（防精度丢失） */
  graphId: ComputedRef<number | string>
  graphData: Ref<FlowGraphData>
  selectedNode: ComputedRef<FlowGraphNode | null>
  selectedNodeType: ComputedRef<string>
}

/**
 * 属性面板选项数据：模型/工具/知识库下拉，G3 附属选项（处理人/已发布图），
 * 以及选中子图节点的发布版本快照（watch 节点类型与 SUBGRAPH defId）。
 */
export function useGraphOptions(deps: GraphOptionsDeps) {
  const { t } = useI18n()
  const { graphId, selectedNode, selectedNodeType } = deps

  const modelOptions = ref<AgentModelConfigOption[]>([])
  const toolOptions = ref<AgentToolOption[]>([])
  const knowledgeOptions = ref<KnowledgeBase[]>([])
  /** G3：已发布图（SUBGRAPH 选择）与处理人候选（HUMAN 选择） */
  const graphOptions = ref<Array<{ id: number | string; name: string; defVersion?: number }>>([])
  const userOptions = ref<Array<{ id: string; label: string }>>([])
  /** G3：当前选中子图节点的发布版本快照 */
  const subgraphVersions = ref<Array<{ defVersion: number }>>([])

  const presentationCtx = computed(() => ({
    modelOptions: modelOptions.value,
    toolOptions: toolOptions.value,
    knowledgeOptions: knowledgeOptions.value,
    graphOptions: graphOptions.value,
    edges: deps.graphData.value.edges,
  }))

  /** G3：加载选中子图节点的发布版本快照 */
  async function loadSubgraphVersions(defId: string) {
    if (!defId) {
      subgraphVersions.value = []
      return
    }
    try {
      const snapshots = await listGraphDefVersions(defId)
      subgraphVersions.value = snapshots
        .map((s) => ({ defVersion: s.defVersion }))
        .sort((a, b) => b.defVersion - a.defVersion)
    } catch {
      subgraphVersions.value = []
    }
  }

  watch(
    () => [selectedNodeType.value, selectedNode.value?.data?.[NODE_CONFIG_KEY_SUBGRAPH_DEF_ID]],
    ([type, defId]) => {
      if (type !== NODE_TYPE_SUBGRAPH) {
        subgraphVersions.value = []
        return
      }
      void loadSubgraphVersions(defId === undefined || defId === null ? '' : String(defId))
    },
  )

  async function loadOptions(refreshPresentations: () => void) {
    try {
      const [models, tools, knowledgePage] = await Promise.all([
        listModelOptions(),
        listToolOptions(),
        pageKnowledgeBases({ pageNum: 1, pageSize: 100 }),
      ])
      modelOptions.value = models
      toolOptions.value = tools
      knowledgeOptions.value = knowledgePage.list
      refreshPresentations()
      // G3 附属选项：处理人/已发布图加载失败不阻断设计器主流程
      const usersPromise =
        typeof listUserChoices === 'function'
          ? listUserChoices().catch(() => [])
          : Promise.resolve([])
      const graphsPromise =
        typeof pageGraphDefs === 'function'
          ? pageGraphDefs({ pageNum: 1, pageSize: 100 }).catch(() => ({ list: [] }))
          : Promise.resolve({ list: [] })
      const [users, graphPage] = await Promise.all([usersPromise, graphsPromise])
      userOptions.value = users ?? []
      graphOptions.value = (graphPage.list ?? [])
        .filter((g) => g.status === 'PUBLISHED' && String(g.id) !== String(graphId.value))
        .map((g) => ({ id: g.id, name: g.name, defVersion: g.defVersion }))
      refreshPresentations()
    } catch (err) {
      ElMessage.warning(
        t('agent.dropdownLoadFailed') + ((err as ApiError).msg ?? t('common.unknownError')),
      )
    }
  }

  return {
    modelOptions,
    toolOptions,
    knowledgeOptions,
    graphOptions,
    userOptions,
    subgraphVersions,
    presentationCtx,
    loadSubgraphVersions,
    loadOptions,
  }
}
