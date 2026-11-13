<script setup lang="ts">
/**
 * START 节点面板（G1-4）：声明输入参数（名称/类型/必填/说明）。
 * 未声明任何参数时沿用旧契约（单个文本参数 input），执行接口向后兼容。
 * 写回 config.params 数组；空行保留在本地编辑态，发布校验时判空。
 */
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { NODE_CONFIG_KEY_INPUT_PARAMS, type StartParam } from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
}>()

const { t } = useI18n()

const PARAM_TYPES: Array<{ value: StartParam['type']; labelKey: string }> = [
  { value: 'text', labelKey: 'agent.paramTypeText' },
  { value: 'number', labelKey: 'agent.paramTypeNumber' },
  { value: 'boolean', labelKey: 'agent.paramTypeBoolean' },
  { value: 'json', labelKey: 'agent.paramTypeJson' },
]

function readParams(): StartParam[] {
  const raw = props.node.data?.[NODE_CONFIG_KEY_INPUT_PARAMS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      name: String(p.name ?? ''),
      type: (['text', 'number', 'boolean', 'json'] as const).includes(p.type as StartParam['type'])
        ? (p.type as StartParam['type'])
        : 'text',
      required: p.required === true,
      description: typeof p.description === 'string' ? p.description : '',
    }))
}

const rows = ref<StartParam[]>(readParams())

watch(
  () => props.node.id,
  () => {
    rows.value = readParams()
  },
)

function commit() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_INPUT_PARAMS,
    rows.value.map((r) => ({ ...r })),
  )
}

function addRow() {
  rows.value = [...rows.value, { name: '', type: 'text', required: false, description: '' }]
  commit()
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index)
  commit()
}
</script>

<template>
  <div class="start-panel">
    <div class="panel-section-title">{{ t('agent.startParamsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.startParamsHint') }}</div>

    <div v-if="rows.length === 0" class="panel-empty">{{ t('agent.emptyParamsHint') }}</div>

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
      <div class="param-row__grid">
        <el-select v-model="row.type" size="small" @change="commit">
          <el-option
            v-for="opt in PARAM_TYPES"
            :key="opt.value"
            :label="t(opt.labelKey)"
            :value="opt.value"
          />
        </el-select>
        <el-checkbox v-model="row.required" size="small" @change="commit">
          {{ t('agent.paramRequired') }}
        </el-checkbox>
      </div>
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

.param-row__grid {
  display: flex;
  align-items: center;
  gap: 10px;
}

.param-row__grid :deep(.el-select) {
  flex: 1;
}

.add-param-btn {
  width: 100%;
}
</style>
