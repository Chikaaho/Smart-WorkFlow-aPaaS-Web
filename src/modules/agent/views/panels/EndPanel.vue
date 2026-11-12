<script setup lang="ts">
/**
 * END 节点面板（G1-4）：声明输出参数（名称/来源变量/说明）。
 * 来源写「节点 ID.变量名」或全局变量名；G1-5 变量选择器接入后改为选择式。
 */
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import {
  NODE_CONFIG_KEY_OUTPUT_PARAMS,
  type EndOutputParam,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
}>()

const { t } = useI18n()

function readOutputs(): EndOutputParam[] {
  const raw = props.node.data?.[NODE_CONFIG_KEY_OUTPUT_PARAMS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      name: String(p.name ?? ''),
      source: String(p.source ?? ''),
      description: typeof p.description === 'string' ? p.description : '',
    }))
}

const rows = ref<EndOutputParam[]>(readOutputs())

watch(
  () => props.node.id,
  () => {
    rows.value = readOutputs()
  },
)

function commit() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_OUTPUT_PARAMS,
    rows.value.map((r) => ({ ...r })),
  )
}

function addRow() {
  rows.value = [...rows.value, { name: '', source: '', description: '' }]
  commit()
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index)
  commit()
}
</script>

<template>
  <div class="end-panel">
    <div class="panel-section-title">{{ t('agent.endOutputsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.endOutputsHint') }}</div>

    <div v-if="rows.length === 0" class="panel-empty">{{ t('agent.emptyOutputsHint') }}</div>

    <div v-for="(row, index) in rows" :key="index" class="param-row">
      <div class="param-row__head">
        <el-input
          v-model="row.name"
          size="small"
          :placeholder="t('agent.paramNamePlaceholder')"
          @change="commit"
        />
        <el-button
          size="small"
          type="danger"
          plain
          :aria-label="t('agent.removeParamRow')"
          @click="removeRow(index)"
        >
          ×
        </el-button>
      </div>
      <el-input
        v-model="row.source"
        size="small"
        :placeholder="t('agent.paramSourcePlaceholder')"
        @change="commit"
      />
      <el-input
        v-model="row.description"
        size="small"
        :placeholder="t('agent.paramDescription')"
        @change="commit"
      />
    </div>

    <el-button size="small" plain class="add-param-btn" @click="addRow">
      {{ t('agent.addParam') }}
    </el-button>
  </div>
</template>

<style scoped>
.panel-section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.panel-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
  line-height: 18px;
}

.panel-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px 0 12px;
}

.param-row {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-row__head {
  display: flex;
  gap: 6px;
}

.add-param-btn {
  width: 100%;
}
</style>
