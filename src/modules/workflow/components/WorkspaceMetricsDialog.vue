<script setup lang="ts">
/** 图表数据配置：维度、第二维度、多指标/左右轴/呈现/单位/颜色、散点 X/Y 与仪表盘目标。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField } from '../api/workspace-analytics'
import {
  defaultMetrics,
  isNumericType,
  pickDefaultGroupField,
  pickDefaultNumericField,
  seriesColor,
  type WorkspaceChartType,
  type WorkspaceDataConfig,
  type WorkspaceMetricConfig,
} from '../utils/workspace-data'
import WorkspaceColorDialog from './WorkspaceColorDialog.vue'

const props = defineProps<{
  modelValue: boolean
  fields: WorkspaceField[]
  chartType: WorkspaceChartType
  config: WorkspaceDataConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [patch: Partial<WorkspaceDataConfig>]
}>()

const { t } = useI18n()

const groupBy = ref('')
const groupBy2 = ref('')
const metrics = ref<WorkspaceMetricConfig[]>([])
const xField = ref('')
const yField = ref('')
const target = ref(100)
const axisLeftMax = ref(0)
const axisRightMax = ref(0)
const colorIndex = ref<number | null>(null)
const colorVisible = ref(false)

const isCartesian = computed(() =>
  ['bar', 'hbar', 'line', 'area', 'combo'].includes(props.chartType),
)
const numericFields = computed(() => props.fields.filter((field) => isNumericType(field.type)))
const groupFields = computed(() => props.fields)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const cfg = props.config
    groupBy.value = cfg.groupBy ?? pickDefaultGroupField(props.fields)
    groupBy2.value = cfg.groupBy2 ?? ''
    metrics.value = (cfg.metrics?.length ? cfg.metrics : defaultMetrics(cfg.style)).map(
      (metric) => ({
        ...metric,
        color: metric.color || seriesColor(cfg.style, 0),
      }),
    )
    xField.value = cfg.xField ?? pickDefaultNumericField(props.fields)
    yField.value = cfg.yField ?? pickDefaultNumericField(props.fields)
    target.value = cfg.target ?? 100
    axisLeftMax.value = cfg.axisScale?.left ?? 0
    axisRightMax.value = cfg.axisScale?.right ?? 0
  },
)

/** 轴单位取该轴第一个指标的配置，与参考弹窗“0 至自动 · 次”一致。 */
function axisUnit(axis: 'left' | 'right'): string {
  return metrics.value.find((metric) => metric.axis === axis && metric.unit)?.unit ?? ''
}

function axisLabel(axis: 'left' | 'right', max: number): string {
  const unit = axisUnit(axis)
  const text =
    max === 0 ? t('workspace.metrics.axisAuto') : t('workspace.metrics.axisFixed', { max })
  return unit ? `${text} · ${unit}` : text
}

function openColor(index: number): void {
  colorIndex.value = index
  colorVisible.value = true
}

function applyColor(color: string): void {
  const index = colorIndex.value
  if (index == null || !metrics.value[index]) return
  metrics.value[index].color = color
}

function addMetric(): void {
  const numeric = numericFields.value[0]?.name ?? ''
  metrics.value.push({
    field: numeric,
    agg: numeric ? 'SUM' : 'COUNT',
    axis: metrics.value.length % 2 === 0 ? 'left' : 'right',
    presentation: props.chartType === 'combo' && metrics.value.length > 0 ? 'line' : 'bar',
    unit: '条',
    color: seriesColor(props.config.style, metrics.value.length),
  })
}

function removeMetric(index: number): void {
  metrics.value.splice(index, 1)
}

/** COUNT 可不选字段；SUM/AVG/MIN/MAX 必须是数值字段。 */
function fieldOptions(metric: WorkspaceMetricConfig) {
  return metric.agg === 'COUNT' ? props.fields : numericFields.value
}

function onAggChange(metric: WorkspaceMetricConfig): void {
  if (
    metric.agg !== 'COUNT' &&
    !isNumericType(props.fields.find((field) => field.name === metric.field)?.type ?? '')
  ) {
    metric.field = numericFields.value[0]?.name ?? ''
  }
}

function confirm(): void {
  const patch: Partial<WorkspaceDataConfig> = {
    groupBy: groupBy.value || undefined,
    groupBy2: groupBy2.value || undefined,
    metrics: metrics.value.filter((metric) => metric.agg === 'COUNT' || Boolean(metric.field)),
  }
  if (isCartesian.value) {
    patch.axisScale = {
      left: axisLeftMax.value || null,
      right: axisRightMax.value || null,
    }
  }
  if (props.chartType === 'scatter') {
    patch.xField = xField.value || undefined
    patch.yField = yField.value || undefined
  }
  if (props.chartType === 'gauge') {
    patch.target = Number(target.value) || 100
  }
  emit('apply', patch)
  emit('update:modelValue', false)
}

const colorName = computed(() => {
  const index = colorIndex.value
  if (index == null) return ''
  const metric = metrics.value[index]
  return (
    props.fields.find((field) => field.name === metric?.field)?.label ||
    metric?.field ||
    t('workspace.inspector.recordCount')
  )
})

const colorValue = computed(() => {
  const index = colorIndex.value
  return index == null ? undefined : metrics.value[index]?.color
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.metrics.title')"
    width="820px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wmetrics">
      <template v-if="chartType === 'scatter'">
        <div class="wmetrics__axis-row">
          <label>
            <span>{{ t('workspace.metrics.xField') }}</span>
            <el-select v-model="xField" size="small">
              <el-option
                v-for="field in numericFields"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
          </label>
          <label>
            <span>{{ t('workspace.metrics.yField') }}</span>
            <el-select v-model="yField" size="small">
              <el-option
                v-for="field in numericFields"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
          </label>
        </div>
      </template>
      <template v-else>
        <div class="wmetrics__axis-row">
          <label>
            <span>{{ t('workspace.metrics.dimension') }}</span>
            <el-select v-model="groupBy" size="small">
              <el-option
                v-for="field in groupFields"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
          </label>
          <label v-if="['line', 'area', 'bar', 'hbar', 'combo', 'heatmap'].includes(chartType)">
            <span>{{ t('workspace.metrics.groupSeries') }}</span>
            <el-select v-model="groupBy2" size="small" clearable>
              <el-option :label="t('workspace.metrics.none')" value="" />
              <el-option
                v-for="field in groupFields"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
          </label>
          <label v-if="chartType === 'gauge'">
            <span>{{ t('workspace.metrics.target') }}</span>
            <el-input-number v-model="target" size="small" :min="1" :max="1000000" />
          </label>
        </div>

        <div class="wmetrics__table">
          <div class="wmetrics__head">
            <span>{{ t('workspace.metrics.field') }}</span>
            <span>{{ t('workspace.metrics.agg') }}</span>
            <span v-if="isCartesian">{{ t('workspace.metrics.axis') }}</span>
            <span v-if="isCartesian">{{ t('workspace.metrics.presentation') }}</span>
            <span>{{ t('workspace.metrics.unit') }}</span>
            <span>{{ t('workspace.metrics.color') }}</span>
            <span />
          </div>
          <div v-for="(metric, index) in metrics" :key="index" class="wmetrics__row">
            <el-select v-model="metric.field" size="small" clearable>
              <el-option
                v-for="field in fieldOptions(metric)"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
            <el-select v-model="metric.agg" size="small" @change="onAggChange(metric)">
              <el-option label="COUNT" value="COUNT" />
              <el-option label="SUM" value="SUM" />
              <el-option label="AVG" value="AVG" />
              <el-option label="MIN" value="MIN" />
              <el-option label="MAX" value="MAX" />
            </el-select>
            <el-select v-if="isCartesian" v-model="metric.axis" size="small">
              <el-option :label="t('workspace.metrics.leftAxis')" value="left" />
              <el-option :label="t('workspace.metrics.rightAxis')" value="right" />
            </el-select>
            <el-select v-if="isCartesian" v-model="metric.presentation" size="small">
              <el-option :label="t('workspace.metrics.bar')" value="bar" />
              <el-option :label="t('workspace.metrics.line')" value="line" />
              <el-option :label="t('workspace.metrics.area')" value="area" />
            </el-select>
            <el-input v-model="metric.unit" size="small" />
            <button
              type="button"
              class="wmetrics__color"
              :style="{ background: metric.color }"
              :aria-label="t('workspace.metrics.color')"
              @click="openColor(index)"
            />
            <button type="button" class="wmetrics__remove" @click="removeMetric(index)">×</button>
          </div>
          <el-button size="small" plain @click="addMetric">{{
            t('workspace.metrics.add')
          }}</el-button>
        </div>

        <div v-if="isCartesian" class="wmetrics__bounds">
          <label>
            <span>{{ t('workspace.metrics.leftAxis') }}</span>
            <el-select v-model="axisLeftMax" size="small">
              <el-option :label="axisLabel('left', 0)" :value="0" />
              <el-option :label="axisLabel('left', 100)" :value="100" />
            </el-select>
          </label>
          <label>
            <span>{{ t('workspace.metrics.rightAxis') }}</span>
            <el-select v-model="axisRightMax" size="small">
              <el-option :label="axisLabel('right', 0)" :value="0" />
              <el-option :label="axisLabel('right', 100)" :value="100" />
            </el-select>
          </label>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>

  <WorkspaceColorDialog
    v-model="colorVisible"
    :name="colorName"
    :color="colorValue"
    @apply="applyColor"
  />
</template>

<style scoped>
.wmetrics {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wmetrics__axis-row {
  display: flex;
  gap: 16px;
}

.wmetrics__axis-row label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.wmetrics__table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wmetrics__head,
.wmetrics__row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.7fr 0.8fr 0.7fr 44px 24px;
  gap: 8px;
  align-items: center;
}

.wmetrics__head {
  color: var(--sw-text-tertiary);
  font-size: 11px;
}

.wmetrics__color {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.wmetrics__bounds {
  display: flex;
  gap: 16px;
}

.wmetrics__bounds label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.wmetrics__remove {
  border: 0;
  background: transparent;
  color: var(--sw-text-tertiary);
  font-size: 16px;
  cursor: pointer;
}
</style>
