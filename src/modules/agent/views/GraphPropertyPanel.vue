<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'
import type { Component } from 'vue'
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import { NODE_TYPE_START } from '@/modules/agent/utils/graphAdapter'
import type { AgentModelConfigOption, AgentToolOption, KnowledgeBase } from '@/contracts/agent'
import type { VariableGroup } from '@/modules/agent/utils/variableReferences'
import { RUNNABLE_NODE_TYPES } from './graph-palette-config'
import type { NodeRunState } from './use-graph-execution'

/**
 * 属性面板：连线属性 / 节点属性（配置/连接/运行页签）/ 空态。
 * 节点类型面板经 node-panel-registry 动态挂载（`<component :is>`），
 * 写回事件全部上行到宿主统一处理。
 */
defineProps<{
  selectedEdge: FlowGraphEdge | null
  selectedNode: FlowGraphNode | null
  selectedNodeType: string
  activeNodeTab: 'config' | 'connection'
  panelComponent: Component | null
  panelLabel: string
  modelOptions: AgentModelConfigOption[]
  toolOptions: AgentToolOption[]
  knowledgeOptions: KnowledgeBase[]
  conditionOutEdges: FlowGraphEdge[]
  edgeDisplayName: (edge: FlowGraphEdge) => string
  variableGroups: VariableGroup[]
  userOptions: Array<{ id: string; label: string }>
  graphOptions: Array<{ id: number | string; name: string; defVersion?: number }>
  subgraphVersions: Array<{ defVersion: number }>
  incomingEdges: FlowGraphEdge[]
  outgoingEdges: FlowGraphEdge[]
  selectedNodeRun: NodeRunState | null
  nodeStatusLabel: (status: NodeRunState['status']) => string
}>()

const emit = defineEmits<{
  'update:activeNodeTab': [tab: 'config' | 'connection']
  'select-edge': [id: string]
  'update-node-data': [key: string, value: unknown]
  'subgraph-graph-change': [defId: string]
  'var-name-change': [key: string, value: unknown]
  'max-iterations-change': [value: unknown]
  'keyword-change': [edge: FlowGraphEdge, value: unknown]
  'remove-edge': [edgeId: string]
  'remove-node': []
  'open-node-run': []
  'open-child-execution': [childExecutionId: number]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="property-panel">
    <!-- 连线属性 -->
    <template v-if="selectedEdge">
      <div class="panel-title">{{ t('agent.edgeProperties') }}</div>
      <div class="panel-field">
        <div class="panel-field__label">{{ t('agent.edgeKeywordLabel') }}</div>
        <el-input
          :model-value="selectedEdge.label ?? ''"
          size="small"
          :placeholder="t('agent.edgeKeywordPlaceholder')"
          @change="emit('keyword-change', selectedEdge, $event)"
        />
      </div>
      <div class="panel-meta">
        <div>
          {{ t('agent.edgeSourceLabel') }}：{{ edgeDisplayName(selectedEdge).split(' → ')[0] }}
        </div>
        <div>
          {{ t('agent.edgeTargetLabel') }}：{{ edgeDisplayName(selectedEdge).split(' → ')[1] }}
        </div>
        <div>{{ t('agent.edgeIdLabel') }}：{{ selectedEdge.id }}</div>
      </div>
      <div class="panel-footer">
        <el-button size="small" type="danger" plain @click="emit('remove-edge', selectedEdge.id)">
          {{ t('agent.deleteEdge') }}
        </el-button>
      </div>
    </template>

    <!-- 节点属性 -->
    <template v-else-if="selectedNode">
      <div class="panel-title">
        {{ t('agent.nodeProperties') }}
        <span class="panel-sub">{{ enumLabel('AGENT_NODE_TYPE', selectedNode.type) }}</span>
      </div>

      <el-tabs
        :model-value="activeNodeTab"
        class="node-tabs"
        @update:model-value="emit('update:activeNodeTab', $event as 'config' | 'connection')"
      >
        <el-tab-pane :label="t('agent.nodeTabConfig')" name="config">
          <component
            :is="panelComponent"
            v-if="panelComponent"
            :node="selectedNode"
            :label="panelLabel"
            :model-options="modelOptions"
            :tool-options="toolOptions"
            :knowledge-options="knowledgeOptions"
            :condition-out-edges="conditionOutEdges"
            :edge-display-name="edgeDisplayName"
            :variable-groups="variableGroups"
            :user-options="userOptions"
            :graph-options="graphOptions"
            :subgraph-versions="subgraphVersions"
            @update-node-data="
              (key: string, value: unknown) => emit('update-node-data', key, value)
            "
            @subgraph-graph-change="emit('subgraph-graph-change', $event)"
            @var-name-change="(key: string, value: unknown) => emit('var-name-change', key, value)"
            @max-iterations-change="emit('max-iterations-change', $event)"
            @keyword-change="
              (edge: FlowGraphEdge, value: unknown) => emit('keyword-change', edge, value)
            "
            @remove-edge="emit('remove-edge', $event)"
          />
        </el-tab-pane>
        <el-tab-pane :label="t('agent.nodeTabConnection')" name="connection">
          <div class="panel-field__label">{{ t('agent.incomingEdges') }}</div>
          <div v-if="incomingEdges.length === 0" class="panel-empty">
            {{ t('agent.noConnection') }}
          </div>
          <el-button
            v-for="edge in incomingEdges"
            :key="edge.id"
            size="small"
            link
            type="primary"
            class="connection-link"
            @click="emit('select-edge', edge.id)"
          >
            {{ edgeDisplayName(edge) }}
          </el-button>
          <div class="panel-field__label connect-out-label">{{ t('agent.outgoingEdges') }}</div>
          <div v-if="outgoingEdges.length === 0" class="panel-empty">
            {{ t('agent.noConnection') }}
          </div>
          <el-button
            v-for="edge in outgoingEdges"
            :key="edge.id"
            size="small"
            link
            type="primary"
            class="connection-link"
            @click="emit('select-edge', edge.id)"
          >
            {{ edgeDisplayName(edge) }}
          </el-button>
          <div class="panel-meta">
            <div>{{ t('agent.nodeIdLabel') }}：{{ selectedNode.id }}</div>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="selectedNodeRun" :label="t('agent.nodeTabRun')" name="run">
          <div class="panel-field__label">{{ t('agent.nodeRunStatus') }}</div>
          <el-tag size="small" :type="selectedNodeRun.status === 'failed' ? 'danger' : 'info'">
            {{ nodeStatusLabel(selectedNodeRun.status) }}
          </el-tag>
          <div v-if="selectedNodeRun.latencyMs !== undefined" class="panel-meta">
            {{ t('agent.nodeRunLatency') }}：{{ selectedNodeRun.latencyMs }}ms
          </div>
          <template v-if="selectedNodeRun.input">
            <div class="panel-field__label">{{ t('agent.nodeRunInput') }}</div>
            <pre class="node-run-text">{{ selectedNodeRun.input }}</pre>
          </template>
          <template v-if="selectedNodeRun.output">
            <div class="panel-field__label">{{ t('agent.nodeRunOutput') }}</div>
            <pre class="node-run-text">{{ selectedNodeRun.output }}</pre>
          </template>
          <template v-if="selectedNodeRun.errorMessage">
            <div class="panel-field__label">{{ t('agent.nodeRunError') }}</div>
            <pre class="node-run-text node-run-error">{{ selectedNodeRun.errorMessage }}</pre>
          </template>
          <div v-if="selectedNodeRun.childExecutionId" class="panel-meta">
            <el-button
              size="small"
              link
              type="primary"
              @click="$emit('open-child-execution', selectedNodeRun.childExecutionId)"
            >
              {{ t('agent.subgraphChildExecutionLink', { id: selectedNodeRun.childExecutionId }) }}
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="panel-footer">
        <el-button
          v-if="RUNNABLE_NODE_TYPES.includes(selectedNodeType)"
          size="small"
          type="primary"
          plain
          @click="emit('open-node-run')"
        >
          {{ t('agent.runNode') }}
        </el-button>
        <el-button
          v-if="selectedNodeType !== NODE_TYPE_START"
          size="small"
          type="danger"
          plain
          @click="emit('remove-node')"
        >
          {{ t('agent.deleteNode') }}
        </el-button>
      </div>
    </template>

    <el-empty v-else :description="t('agent.clickNodeToEditHint')" :image-size="60">
      <template #description>
        <div>{{ t('agent.clickNodeToEditHint') }}</div>
        <div class="panel-empty">{{ t('agent.selectEdgeHint') }}</div>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.property-panel {
  width: 320px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  overflow-y: auto;
  flex: none;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.panel-sub {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel-field {
  margin-bottom: 10px;
}

.panel-field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.connect-out-label {
  margin-top: 12px;
}

.panel-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 20px;
  margin-top: 8px;
  word-break: break-all;
}

.panel-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 2px 0 6px;
}

.connection-link {
  display: block;
  margin: 2px 0;
}

.panel-footer {
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 12px;
}

.node-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.node-run-text {
  margin: 4px 0;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.node-run-error {
  color: var(--el-color-danger);
}
</style>
