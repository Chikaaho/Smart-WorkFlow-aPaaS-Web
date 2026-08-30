<script setup lang="ts">
/**
 * CONDITION 节点属性面板：出边关键词编辑（写 edge.label，画布原生渲染边标签；
 * 留空 = 默认边）。写回统一 emit 上行：keywordChange（逐边关键词，改后画布重挂载在
 * GraphDesigner.handleKeywordChange）/ removeEdge（删除条件分支出边）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()

defineEmits<{
  keywordChange: [edge: NodePanelProps['conditionOutEdges'][number], value: unknown]
  removeEdge: [edgeId: string]
}>()
</script>

<template>
  <div class="field-row">
    <div class="field-label">出边关键词</div>
    <el-alert
      title="输入关键词后文本命中即走该边；留空为默认边（仅一条）"
      type="info"
      :closable="false"
      show-icon
    />
    <div v-for="edge in conditionOutEdges" :key="edge.id" class="edge-row">
      <div class="edge-name">{{ edgeDisplayName(edge) }}</div>
      <el-input
        :model-value="edge.label ?? ''"
        placeholder="关键词（留空=默认边）"
        size="small"
        @change="(v) => $emit('keywordChange', edge, v)"
      />
      <el-button size="small" link type="danger" @click="$emit('removeEdge', edge.id)">
        删除边
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.field-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.field-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.edge-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px dashed var(--el-border-color-light);
  border-radius: 4px;
}

.edge-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
