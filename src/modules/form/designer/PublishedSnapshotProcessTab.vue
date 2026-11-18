<script setup lang="ts">
import { useI18n } from '@/locales'
import type {
  SnapshotAdvancedConfigView,
  SnapshotNodeView,
  SnapshotProcessSource,
} from './published-snapshot'
import {
  FROZEN_EVENT_TYPES,
  FROZEN_GATEWAY_TYPES,
  type FrozenGraphEdge,
  type FrozenGraphNode,
  type FrozenLayoutNode,
} from './use-snapshot-frozen-graph'
import { prettyJson, useSnapshotLabels } from './use-snapshot-labels'
import type { FrozenNodeConfigRow } from './use-snapshot-node-config'

/**
 * 流程设计页签：左流程版本 220 / 冻结图展示点选 / 右选中节点只读属性 336。
 * 节点/流程点选与配置「查看」入口经事件冒泡给宿主。
 */
defineProps<{
  processSources: SnapshotProcessSource[]
  selectedProcess: SnapshotProcessSource | null
  selectedNode: SnapshotNodeView | null
  frozenGraph: { nodes: FrozenGraphNode[]; edges: FrozenGraphEdge[] }
  frozenLayoutNodes: FrozenLayoutNode[]
  frozenViewBox: string | null
  frozenViewBoxRect: { x: number; y: number; w: number; h: number } | null
  advancedConfigs: SnapshotAdvancedConfigView[]
  frozenNodePropRows: Array<{ label: string; value: string }>
  frozenNodeConfigRows: FrozenNodeConfigRow[]
  frozenEdgePoints: (edge: FrozenGraphEdge) => Array<{ x: number; y: number }>
}>()

const emit = defineEmits<{
  'select-process': [key: string]
  'select-node': [id: string]
  'open-node-config': [row: FrozenNodeConfigRow]
}>()

const { t } = useI18n()
const { sectionLabel } = useSnapshotLabels()
</script>

<template>
  <!-- ═══ 流程设计：左流程版本 220 / 冻结图展示点选 / 右选中节点只读属性 336 ═══ -->
  <div class="snapshot-tabbody snapshot-tabbody--process">
    <aside class="snapshot-side snapshot-side--procs">
      <h4>{{ t('form.snapshotViewer.processSnapshots') }}</h4>
      <p v-if="processSources.length === 0" class="snapshot-empty">
        {{ t('form.snapshotViewer.noMatchingProcess') }}
      </p>
      <ul v-else class="snapshot-component-list">
        <li v-for="process in processSources" :key="`${process.defId}:${process.graphVersion}`">
          <button
            type="button"
            :class="{
              'is-active':
                `${process.defId}:${process.graphVersion}` ===
                `${selectedProcess?.defId}:${selectedProcess?.graphVersion}`,
            }"
            @click="emit('select-process', `${process.defId}:${process.graphVersion}`)"
          >
            <span>{{ process.defName }}</span>
            <small>v{{ process.graphVersion }}</small>
          </button>
        </li>
      </ul>
    </aside>
    <div class="snapshot-tabbody__main">
      <section class="snapshot-section">
        <div v-if="selectedProcess" class="snapshot-process">
          <div>
            <strong>{{ selectedProcess.defName }}</strong>
            <span>{{ selectedProcess.processKey }} · v{{ selectedProcess.graphVersion }}</span>
          </div>
          <div class="snapshot-process__meta">
            <span>{{ selectedProcess.status }}</span>
            <span>{{ selectedProcess.publishedAt || '—' }}</span>
            <span>{{ selectedProcess.publisherName || '—' }}</span>
          </div>
          <details class="snapshot-raw snapshot-raw--card">
            <summary>{{ t('form.snapshotViewer.rawProcessGraph') }}</summary>
            <pre>{{ prettyJson(selectedProcess.graph) }}</pre>
          </details>
        </div>
        <div class="snapshot-section__head">
          <div>
            <h3>{{ sectionLabel('nodes') }}</h3>
          </div>
        </div>
        <p v-if="frozenGraph.nodes.length === 0" class="snapshot-empty">
          {{ t('form.snapshotViewer.noData') }}
        </p>
        <div v-else class="snapshot-frozen-graph">
          <svg
            :viewBox="frozenViewBox ?? undefined"
            :width="frozenViewBoxRect ? frozenViewBoxRect.w + 2 : undefined"
            :height="frozenViewBoxRect ? frozenViewBoxRect.h + 2 : undefined"
            role="img"
            :aria-label="sectionLabel('nodes')"
          >
            <defs>
              <marker
                id="frozen-edge-arrow"
                markerUnits="userSpaceOnUse"
                markerWidth="8.5"
                markerHeight="7"
                refX="8.2"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L8.5,3.5 L0,7 z" fill="#8996ab" />
              </marker>
            </defs>
            <polyline
              v-for="edge in frozenGraph.edges"
              :key="edge.id"
              class="snapshot-frozen-graph__edge"
              :points="
                frozenEdgePoints(edge)
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')
              "
              marker-end="url(#frozen-edge-arrow)"
            />
            <g
              v-for="node in frozenLayoutNodes"
              :key="node.id"
              class="snapshot-frozen-graph__node"
              :class="{
                'is-selected': selectedNode?.id === node.id,
                'is-event': FROZEN_EVENT_TYPES.has(node.type),
                'is-gateway': FROZEN_GATEWAY_TYPES.has(node.type),
                'is-start': node.type === 'START',
                'is-end': node.type === 'END',
              }"
              @click="emit('select-node', node.id)"
            >
              <rect
                v-if="FROZEN_GATEWAY_TYPES.has(node.type)"
                :x="node.x - 14"
                :y="node.y - 14"
                width="28"
                height="28"
                :transform="`rotate(45 ${node.x} ${node.y})`"
              />
              <rect
                v-else-if="FROZEN_EVENT_TYPES.has(node.type)"
                :x="node.x - 64"
                :y="node.y - 22"
                width="128"
                height="44"
                rx="22"
              />
              <rect v-else :x="node.x - 115" :y="node.y - 22" width="230" height="44" rx="8" />
              <text
                v-if="!FROZEN_GATEWAY_TYPES.has(node.type)"
                :x="node.x"
                :y="node.y + 5"
                text-anchor="middle"
              >
                {{ node.label }}
              </text>
            </g>
          </svg>
          <p class="snapshot-frozen-graph__hint">
            {{ t('form.snapshotViewer.nodeCountUnit', { count: frozenGraph.nodes.length }) }}
          </p>
        </div>
        <h4>{{ t('form.snapshotViewer.advancedConfig') }}</h4>
        <p v-if="advancedConfigs.length === 0" class="snapshot-empty">
          {{ t('form.snapshotViewer.noData') }}
        </p>
        <template v-else>
          <details
            v-for="row in advancedConfigs"
            :key="`${row.processKey}:${row.graphVersion}`"
            class="snapshot-raw snapshot-raw--card"
          >
            <summary>{{ row.processName }} · v{{ row.graphVersion }}</summary>
            <pre>{{ prettyJson(row.config) }}</pre>
          </details>
        </template>
      </section>
    </div>
    <aside class="snapshot-side snapshot-side--props snapshot-side--props-surface">
      <h4 class="snapshot-node-props-title">
        {{ t('form.snapshotViewer.nodePropsTitle') }}
      </h4>
      <template v-if="selectedNode">
        <!-- 502:21715：节点属性五个只读框，值取真实节点/查看层派生坐标与真实图形尺寸 -->
        <div class="snapshot-props-surface">
          <div
            v-for="row in frozenNodePropRows"
            :key="row.label"
            class="snapshot-props-surface__group"
          >
            <label class="snapshot-props-surface__label">{{ row.label }}</label>
            <input class="snapshot-props-surface__input" :value="row.value" readonly />
          </div>
        </div>
        <!-- Q31/Q25/Q26/Q20：按真实 kind/config 的只读节点配置；缺值显示未配置 -->
        <h4 class="snapshot-node-props-subtitle">
          {{ t('form.snapshotViewer.nodeConfigSection') }}
        </h4>
        <div class="snapshot-props-surface snapshot-props-surface--node-config">
          <div
            v-for="row in frozenNodeConfigRows"
            :key="row.key"
            class="snapshot-props-surface__group"
            :data-testid="`node-config-${row.key}`"
          >
            <div class="snapshot-props-surface__head">
              <label class="snapshot-props-surface__label">{{ row.label }}</label>
              <el-button
                v-if="row.detail"
                link
                type="primary"
                size="small"
                :data-testid="`node-config-view-${row.key}`"
                @click="emit('open-node-config', row)"
              >
                {{ t('common.view') }}
              </el-button>
            </div>
            <input class="snapshot-props-surface__input" :value="row.value" readonly />
          </div>
        </div>
        <details class="snapshot-raw snapshot-raw--card">
          <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
          <pre>{{ prettyJson(selectedNode.config) }}</pre>
        </details>
      </template>
      <p v-else class="snapshot-empty">
        {{ t('form.snapshotViewer.noData') }}
      </p>
    </aside>
  </div>
</template>

<style scoped>
.snapshot-tabbody--process {
  display: flex;
  align-items: stretch;
  min-height: 0;
}

/* 流程设计：左 220 / 右 336（272:1518） */
.snapshot-tabbody--process .snapshot-side--procs {
  flex: 0 0 220px;
}

.snapshot-tabbody--process .snapshot-side--props {
  flex: 0 0 336px;
  border-left: 1px solid var(--sw-border-light);
}

/* Q31：节点配置行增多后右栏需滚动；滚动条不占内容宽度，共同属性保持 295×32。 */
.snapshot-tabbody--process .snapshot-side--props {
  scrollbar-width: none;
}

.snapshot-tabbody--process .snapshot-side--props::-webkit-scrollbar {
  display: none;
}

.snapshot-tabbody__main {
  flex: 1 1 auto;
  box-sizing: border-box;
  min-width: 0;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-side {
  box-sizing: border-box;
  padding: 20px 16px 24px;
  overflow-y: auto;
  background: var(--sw-surface-card);
}

.snapshot-side--procs {
  border-right: 1px solid var(--sw-border-light);
}

.snapshot-side h4 {
  margin: 0 0 12px;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.snapshot-component-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-component-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.snapshot-component-list button small {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-component-list button:hover {
  background: var(--sw-color-primary-soft);
}

.snapshot-component-list button.is-active {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 600;
}

/* 272:1518（执行提示13）：冻结图只读渲染（事件胶囊/网关菱形/普通节点 230×44，连线 #8996AB）。 */
/* 执行提示14：svg 宽高属性=视盒尺寸（1:1 初始展示，不放大），容器内滚动承接大图。 */
.snapshot-frozen-graph {
  overflow: auto;
}

.snapshot-frozen-graph svg {
  box-sizing: border-box;
  display: block;
  max-width: none;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: #f8fafe;
}

.snapshot-frozen-graph__edge {
  fill: none;
  stroke: #8996ab;
  stroke-width: 2;
}

.snapshot-frozen-graph__node {
  cursor: pointer;
}

.snapshot-frozen-graph__node rect {
  fill: #fff;
  stroke: #d7dfec;
  stroke-width: 1.4;
}

.snapshot-frozen-graph__node.is-event rect {
  stroke-width: 1.6;
}

.snapshot-frozen-graph__node.is-start rect {
  fill: #eefaf3;
  stroke: #16a77b;
}

.snapshot-frozen-graph__node.is-end rect {
  fill: #fdf0f1;
  stroke: #ef5d71;
}

.snapshot-frozen-graph__node.is-gateway rect {
  fill: #f7a92c;
  stroke: #e79a1f;
}

.snapshot-frozen-graph__node.is-selected rect {
  stroke: var(--sw-color-primary);
  stroke-width: 2;
}

.snapshot-frozen-graph__node text {
  fill: #19233b;
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

.snapshot-frozen-graph__node.is-selected text {
  fill: var(--sw-color-primary);
}

.snapshot-frozen-graph__hint {
  margin: 8px 0 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-raw {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-raw summary {
  padding: 9px 12px;
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.snapshot-raw--inline summary,
.snapshot-raw--card summary {
  padding: 7px 9px;
}

.snapshot-raw--card {
  margin-bottom: 8px;
}

.snapshot-raw pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--sw-text-primary);
  font: 12px/1.65 var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sw-surface-page);
}

.snapshot-process {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}

.snapshot-process > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.snapshot-process span {
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-process__meta {
  align-items: flex-end;
  text-align: right;
}

.snapshot-process > .snapshot-raw {
  flex: 1 0 100%;
}

.snapshot-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
}

/* 272:1518（执行提示14）：流程右栏只读控件表面（节点属性/节点配置）。 */
.snapshot-tabbody--process .snapshot-side--props-surface {
  padding: 20px;
}

.snapshot-props-surface {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 22px;
}

/* 502:21715：节点属性首框 y184（少 8px 顶部空隙） */
.snapshot-tabbody--process .snapshot-props-surface {
  margin-top: 14px;
}

.snapshot-props-surface__group {
  display: flex;
  flex-direction: column;
}

.snapshot-props-surface__label {
  display: block;
  margin-bottom: 6px;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #dde3ef;
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 30px;
  font-family: inherit;
}

.snapshot-props-surface__input[readonly] {
  cursor: default;
}

.snapshot-side .snapshot-node-props-title {
  margin: 0 0 6px;
  color: var(--sw-text-primary);
  font-size: 16px;
  line-height: 24px;
}

/* Q31/Q25/Q26/Q20：节点配置分区标题与行内「查看」入口；输入框仍保持 295×32 只读。 */
.snapshot-side .snapshot-node-props-subtitle {
  margin: 22px 0 0;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.snapshot-props-surface--node-config {
  margin-top: 12px;
}

.snapshot-props-surface__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.snapshot-props-surface__head .snapshot-props-surface__label {
  min-width: 0;
}

.snapshot-props-surface__head .el-button {
  flex: 0 0 auto;
  margin-top: -2px;
}

@media (max-width: 900px) {
  .snapshot-tabbody--process {
    flex-direction: column;
  }

  .snapshot-tabbody__main {
    max-height: 58vh;
  }

  .snapshot-process {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
