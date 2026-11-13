<script setup lang="ts">
/**
 * SUBGRAPH 节点面板（G3-4）：选择已发布 Graph + 固定版本，配置入/出参映射。
 *
 * 入参映射：name = 子图开始节点参数名，source = 父执行变量名；
 * 出参映射：name = 父执行变量名，source = 子图输出名。
 * 版本选项来自父级加载的版本快照列表（面板自身不发起请求）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import {
  NODE_CONFIG_KEY_SUBGRAPH_DEF_ID,
  NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION,
  NODE_CONFIG_KEY_SUBGRAPH_INPUTS,
  NODE_CONFIG_KEY_SUBGRAPH_OUTPUTS,
  type SubgraphMapping,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
  subgraphGraphChange: [graphDefId: string]
}>()

const { t } = useI18n()

function readMappings(key: string): SubgraphMapping[] {
  const raw = props.node.data?.[key]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({ name: String(m.name ?? ''), source: String(m.source ?? '') }))
}

const graphDefId = computed(() => {
  const raw = props.node.data?.[NODE_CONFIG_KEY_SUBGRAPH_DEF_ID]
  return raw === undefined || raw === null ? '' : String(raw)
})

const graphDefVersion = computed(() => {
  const raw = props.node.data?.[NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION]
  return typeof raw === 'number' ? raw : ''
})

const inputRows = ref<SubgraphMapping[]>(readMappings(NODE_CONFIG_KEY_SUBGRAPH_INPUTS))
const outputRows = ref<SubgraphMapping[]>(readMappings(NODE_CONFIG_KEY_SUBGRAPH_OUTPUTS))

watch(
  () => props.node.id,
  () => {
    inputRows.value = readMappings(NODE_CONFIG_KEY_SUBGRAPH_INPUTS)
    outputRows.value = readMappings(NODE_CONFIG_KEY_SUBGRAPH_OUTPUTS)
  },
)

const selectedGraph = computed(() =>
  (props.graphOptions ?? []).find((g) => String(g.id) === graphDefId.value),
)

function onGraphChange(value: string) {
  emit('updateNodeData', NODE_CONFIG_KEY_SUBGRAPH_DEF_ID, value || undefined)
  emit('updateNodeData', NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION, undefined)
  emit('subgraphGraphChange', value)
}

function onVersionChange(value: number | undefined) {
  emit('updateNodeData', NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION, value)
}

function commitInputs() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_SUBGRAPH_INPUTS,
    inputRows.value.map((row) => ({ ...row })),
  )
}

function addInput() {
  inputRows.value = [...inputRows.value, { name: '', source: '' }]
  commitInputs()
}

function removeInput(index: number) {
  inputRows.value = inputRows.value.filter((_, i) => i !== index)
  commitInputs()
}

function commitOutputs() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_SUBGRAPH_OUTPUTS,
    outputRows.value.map((row) => ({ ...row })),
  )
}

function addOutput() {
  outputRows.value = [...outputRows.value, { name: '', source: '' }]
  commitOutputs()
}

function removeOutput(index: number) {
  outputRows.value = outputRows.value.filter((_, i) => i !== index)
  commitOutputs()
}
</script>

<template>
  <div class="subgraph-panel">
    <div class="field-row">
      <div class="field-label">{{ t('agent.subgraphGraphTitle') }}</div>
      <div class="panel-hint">{{ t('agent.subgraphGraphHint') }}</div>
      <el-select
        :model-value="graphDefId"
        filterable
        size="small"
        :placeholder="t('agent.subgraphGraphPlaceholder')"
        style="width: 100%"
        @change="(v) => onGraphChange(String(v ?? ''))"
      >
        <el-option
          v-for="g in graphOptions ?? []"
          :key="g.id"
          :label="g.name"
          :value="String(g.id)"
        />
      </el-select>
    </div>

    <div class="field-row">
      <div class="field-label">{{ t('agent.subgraphVersionTitle') }}</div>
      <div class="panel-hint">{{ t('agent.subgraphVersionHint') }}</div>
      <el-select
        :model-value="graphDefVersion === '' ? undefined : graphDefVersion"
        size="small"
        :disabled="!graphDefId"
        :placeholder="t('agent.subgraphVersionPlaceholder')"
        style="width: 100%"
        @change="(v) => onVersionChange(typeof v === 'number' ? v : undefined)"
      >
        <el-option
          v-for="v in subgraphVersions ?? []"
          :key="v.defVersion"
          :label="`v${v.defVersion}`"
          :value="v.defVersion"
        />
      </el-select>
      <div v-if="selectedGraph && graphDefVersion === ''" class="panel-hint">
        {{ t('agent.subgraphVersionUnset') }}
      </div>
    </div>

    <div class="panel-section-title">{{ t('agent.subgraphInputsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.subgraphInputsHint') }}</div>
    <div v-if="inputRows.length === 0" class="panel-empty">
      {{ t('agent.subgraphMappingsEmpty') }}
    </div>
    <div v-for="(row, index) in inputRows" :key="index" class="mapping-row">
      <el-input
        v-model="row.name"
        size="small"
        :placeholder="t('agent.subgraphInputName')"
        @change="commitInputs"
      />
      <span class="mapping-arrow">←</span>
      <el-input
        v-model="row.source"
        size="small"
        :placeholder="t('agent.subgraphInputSource')"
        @change="commitInputs"
      />
      <el-button
        size="small"
        type="danger"
        plain
        :aria-label="t('agent.removeParamRow')"
        @click="removeInput(index)"
      >
        ×
      </el-button>
    </div>
    <el-button size="small" plain class="add-param-btn" @click="addInput">
      {{ t('agent.subgraphAddInput') }}
    </el-button>

    <div class="panel-section-title">{{ t('agent.subgraphOutputsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.subgraphOutputsHint') }}</div>
    <div v-if="outputRows.length === 0" class="panel-empty">
      {{ t('agent.subgraphMappingsEmpty') }}
    </div>
    <div v-for="(row, index) in outputRows" :key="index" class="mapping-row">
      <el-input
        v-model="row.name"
        size="small"
        :placeholder="t('agent.subgraphOutputName')"
        @change="commitOutputs"
      />
      <span class="mapping-arrow">←</span>
      <el-input
        v-model="row.source"
        size="small"
        :placeholder="t('agent.subgraphOutputSource')"
        @change="commitOutputs"
      />
      <el-button
        size="small"
        type="danger"
        plain
        :aria-label="t('agent.removeParamRow')"
        @click="removeOutput(index)"
      >
        ×
      </el-button>
    </div>
    <el-button size="small" plain class="add-param-btn" @click="addOutput">
      {{ t('agent.subgraphAddOutput') }}
    </el-button>
  </div>
</template>

<style scoped>
.panel-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 4px;
}

.panel-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  line-height: 18px;
}

.panel-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px 0 12px;
}

.field-row {
  margin-bottom: 12px;
}

.field-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.mapping-arrow {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.add-param-btn {
  margin-bottom: 8px;
}
</style>
