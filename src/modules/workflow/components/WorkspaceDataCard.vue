<script setup lang="ts">
/**
 * WorkspaceDataCard — 指标卡 / 12 类图表 / 数据列表的真实数据消费端。
 *
 * 所有数据来自服务端受控查询：当前账号可见表单 + 字段查看权 + 记录数据范围。
 * 未配置表单、接口拒绝或空结果分别呈现，不伪造演示数据。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import {
  aggregateWorkspace,
  getWorkspaceFields,
  queryWorkspaceRows,
  type WorkspaceAggregateGroup,
  type WorkspaceAggregateResp,
  type WorkspaceField,
  type WorkspaceRowsResp,
} from '../api/workspace-analytics'
import {
  formatMetricValue,
  type WorkspaceDataConfig,
  type WorkspaceMetricConfig,
} from '../utils/workspace-data'
import WorkspaceChart from './WorkspaceChart.vue'

const props = defineProps<{
  kind: 'metric' | 'chart' | 'list'
  config: WorkspaceDataConfig
}>()

const { t } = useI18n()

const loading = ref(false)
const error = ref('')
const fields = ref<WorkspaceField[]>([])
const aggregate = ref<WorkspaceAggregateResp | null>(null)
const rows = ref<Array<Record<string, unknown>>>([])
const total = ref(0)
const page = ref(1)
let fieldsFormKey = ''
let autoTimer: ReturnType<typeof globalThis.setInterval> | null = null
let requestSeq = 0

const formKey = computed(() => props.config.formKey ?? '')
const chartType = computed(() => props.config.chartType ?? 'bar')

const queryKey = computed(() =>
  JSON.stringify({
    formKey: formKey.value,
    kind: props.kind,
    chartType: chartType.value,
    groupBy: props.config.groupBy,
    groupBy2: props.config.groupBy2,
    metrics: props.config.metrics?.map((metric) => [metric.field, metric.agg, metric.axis]),
    metricField: props.config.metricField,
    metricAgg: props.config.metricAgg,
    xField: props.config.xField,
    yField: props.config.yField,
    filters: props.config.filters,
    columns: props.config.columns,
    sortField: props.config.sortField,
    sortOrder: props.config.sortOrder,
    pageSize: props.config.pageSize,
    page: page.value,
  }),
)

const groupField = computed(() => fields.value.find((field) => field.name === props.config.groupBy))
const groupField2 = computed(() =>
  fields.value.find((field) => field.name === props.config.groupBy2),
)

function labelOf(field: WorkspaceField | undefined, value: unknown): string {
  if (value == null || value === '') return t('workspace.data.uncategorized')
  const text = String(value)
  const option = field?.options?.find((item) => item.value === text)
  if (option) return option.label
  if (field?.type === 'BOOL') return text === '1' || text === 'true' ? '是' : '否'
  return text
}

const displayGroups = computed<WorkspaceAggregateGroup[]>(() => {
  const groups = aggregate.value?.groups ?? []
  return groups.map((group) => ({
    ...group,
    key: labelOf(groupField.value, group.key),
    key2: groupField2.value ? labelOf(groupField2.value, group.key2) : group.key2,
  }))
})

const metricValue = computed(() => {
  const first = aggregate.value?.groups?.[0]?.values?.[0]
  return formatMetricValue(first, props.config.metricFormat ?? 'integer', '')
})

const activeMetrics = computed<WorkspaceMetricConfig[]>(() => {
  const configured = props.config.metrics?.filter(
    (metric) => metric.agg === 'COUNT' || Boolean(metric.field),
  )
  if (configured?.length) return configured
  return [
    {
      field: '',
      agg: 'COUNT',
      axis: 'left',
      presentation: 'bar',
      unit: '条',
      color: '',
    },
  ]
})

const scatterPoints = computed(() =>
  rows.value
    .map((row) => ({
      x: Number(row[props.config.xField ?? '']),
      y: Number(row[props.config.yField ?? '']),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
)

const chartMetrics = computed(() =>
  activeMetrics.value.map((metric) => ({
    ...metric,
    label: fields.value.find((field) => field.name === metric.field)?.label,
  })),
)

const columns = computed(() => props.config.columns ?? [])
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / Math.max(1, props.config.pageSize ?? 10))),
)

function cellText(fieldName: string, value: unknown): string {
  const field = fields.value.find((item) => item.name === fieldName)
  if (value == null || value === '') return '—'
  if (field?.options?.length) {
    const option = field.options.find((item) => item.value === String(value))
    if (option) return option.label
  }
  if (field?.type === 'BOOL') return String(value) === '1' || String(value) === 'true' ? '是' : '否'
  if (field?.type === 'DATE' && typeof value === 'string') return value.slice(0, 10)
  return String(value)
}

async function ensureFields(key: string): Promise<void> {
  if (fieldsFormKey === key) return
  fieldsFormKey = key
  fields.value = []
  if (!key) return
  try {
    const resp = await getWorkspaceFields(key)
    fields.value = resp.fields
    // 配置里的字段已失效时保持显式空态，不静默换成别的字段。
  } catch (err) {
    fields.value = []
    throw err
  }
}

function buildMetrics(): Array<{ field: string | null; agg: WorkspaceMetricConfig['agg'] }> {
  return activeMetrics.value.map((metric) => ({
    field: metric.field || null,
    agg: metric.agg,
  }))
}

async function loadData(): Promise<void> {
  const seq = ++requestSeq
  if (autoTimer) {
    globalThis.clearInterval(autoTimer)
    autoTimer = null
  }
  if (!formKey.value) {
    aggregate.value = null
    rows.value = []
    total.value = 0
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    await ensureFields(formKey.value)
    if (seq !== requestSeq) return
    if (props.kind === 'list') {
      const response = await queryWorkspaceRows({
        formKey: formKey.value,
        columns: columns.value.map((column) => column.field),
        filters: props.config.filters,
        sortField: props.config.sortField,
        sortOrder: props.config.sortOrder,
        pageNum: page.value,
        pageSize: props.config.pageSize ?? 10,
      })
      if (seq !== requestSeq) return
      applyRows(response)
      scheduleAutoScroll()
    } else if (props.kind === 'chart' && chartType.value === 'scatter') {
      const response = await queryWorkspaceRows({
        formKey: formKey.value,
        columns: [props.config.xField ?? '', props.config.yField ?? ''].filter(Boolean),
        filters: props.config.filters,
        pageNum: 1,
        pageSize: 50,
      })
      if (seq !== requestSeq) return
      rows.value = response.records
      total.value = response.total
    } else {
      const response = await aggregateWorkspace({
        formKey: formKey.value,
        groupBy: props.kind === 'metric' ? null : props.config.groupBy || null,
        groupBy2:
          props.kind === 'chart' && chartType.value === 'heatmap'
            ? props.config.groupBy2 || null
            : null,
        metrics:
          props.kind === 'metric'
            ? [{ field: props.config.metricField || null, agg: props.config.metricAgg ?? 'COUNT' }]
            : buildMetrics(),
        filters: props.config.filters,
        limit: 100,
      })
      if (seq !== requestSeq) return
      aggregate.value = response
      total.value = response.totalRecords
    }
  } catch (err) {
    if (seq !== requestSeq) return
    aggregate.value = null
    rows.value = []
    total.value = 0
    error.value = err instanceof ApiError ? err.msg : t('workspace.data.loadFailed')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function applyRows(response: WorkspaceRowsResp): void {
  rows.value = response.records
  total.value = response.total
  if (page.value > pageCount.value) page.value = pageCount.value
}

function scheduleAutoScroll(): void {
  if (props.config.presentation !== 'auto' || pageCount.value <= 1) return
  autoTimer = globalThis.setInterval(() => {
    if (loading.value) return
    page.value = page.value >= pageCount.value ? 1 : page.value + 1
  }, 3000)
}

function goPage(next: number): void {
  page.value = Math.min(pageCount.value, Math.max(1, next))
}

watch(
  () => props.config.formKey,
  () => {
    fieldsFormKey = ''
    page.value = 1
  },
)

watch(
  queryKey,
  () => {
    void loadData()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (autoTimer) globalThis.clearInterval(autoTimer)
})

/** 图表配置变化时保持当前页；列表列配置变化也不重置到第一页以外。 */
function chartStyle() {
  return props.config.style
}
</script>

<template>
  <div class="wdata" :class="`wdata--${kind}`">
    <template v-if="!formKey">
      <div class="wdata__placeholder">
        {{ t('workspace.data.configureForm') }}
      </div>
    </template>
    <template v-else-if="error">
      <div class="wdata__error">
        <span>{{ error }}</span>
        <button type="button" class="wdata__retry" @click="loadData">
          {{ t('common.retry') }}
        </button>
      </div>
    </template>
    <template v-else-if="kind === 'metric'">
      <div class="wdata__metric">
        <strong>{{ metricValue }}</strong>
        <span>{{ t('workspace.data.totalRecords', { count: total }) }}</span>
      </div>
    </template>
    <template v-else-if="kind === 'chart'">
      <WorkspaceChart
        :chart-type="chartType"
        :groups="displayGroups"
        :metrics="chartMetrics"
        :style="chartStyle()"
        :points="scatterPoints"
        :target="config.target ?? 100"
        :loading="loading"
      />
    </template>
    <template v-else>
      <div class="wdata__list" :class="{ 'wdata__list--auto': config.presentation === 'auto' }">
        <div
          class="wdata__list-head"
          :style="{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))` }"
        >
          <span v-for="column in columns" :key="column.field">{{ column.label }}</span>
        </div>
        <div class="wdata__list-body">
          <div
            v-for="(row, index) in rows"
            :key="String(row.id ?? index)"
            class="wdata__list-row"
            :style="{
              gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
            }"
          >
            <span v-for="column in columns" :key="column.field">
              {{ cellText(column.field, row[column.field]) }}
            </span>
          </div>
          <div v-if="!rows.length && !loading" class="wdata__list-empty">
            {{ t('workspace.data.empty') }}
          </div>
        </div>
        <div v-if="config.presentation !== 'auto' && pageCount > 1" class="wdata__pager">
          <button type="button" :disabled="page <= 1" @click="goPage(page - 1)">‹</button>
          <span>{{ page }} / {{ pageCount }}</span>
          <button type="button" :disabled="page >= pageCount" @click="goPage(page + 1)">›</button>
        </div>
      </div>
    </template>
    <div v-if="loading && kind !== 'chart'" class="wdata__loading">{{ t('common.loading') }}</div>
  </div>
</template>

<style scoped>
.wdata {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.wdata__placeholder,
.wdata__error,
.wdata__list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 96px;
  color: var(--sw-text-tertiary, #98a2b3);
  font-size: 12px;
  text-align: center;
}

.wdata__error {
  color: var(--sw-danger, #d92d20);
}

.wdata__retry {
  padding: 2px 10px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.wdata__metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  height: 100%;
  padding: 4px 2px;
}

.wdata__metric strong {
  color: var(--sw-color-primary, #2563eb);
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
}

.wdata__metric span {
  color: var(--sw-text-tertiary, #98a2b3);
  font-size: 11px;
  white-space: nowrap;
}

.wdata__list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  overflow: hidden;
}

.wdata__list-head,
.wdata__list-row {
  display: grid;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
}

.wdata__list-head {
  color: var(--sw-text-tertiary, #98a2b3);
  background: var(--sw-bg-muted, #fafbfc);
  border-bottom: 1px solid var(--sw-border-light, #eef0f4);
}

.wdata__list-body {
  flex: 1;
  overflow: hidden;
}

.wdata__list-row {
  color: var(--sw-text-primary, #1f2937);
  border-bottom: 1px solid var(--sw-border-light, #f1f3f7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wdata__list-row:last-child {
  border-bottom: 0;
}

.wdata__list-row span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.wdata__list--auto .wdata__list-body {
  max-height: calc(100% - 34px);
}

.wdata__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 10px;
  color: var(--sw-text-tertiary, #98a2b3);
  font-size: 11px;
  border-top: 1px solid var(--sw-border-light, #eef0f4);
}

.wdata__pager button {
  width: 22px;
  height: 22px;
  border: 1px solid var(--sw-border, #d9dde6);
  border-radius: 4px;
  background: var(--sw-bg-surface, #fff);
  color: inherit;
  cursor: pointer;
}

.wdata__pager button:disabled {
  opacity: 0.4;
  cursor: default;
}

.wdata__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sw-text-secondary);
  background: color-mix(in srgb, var(--sw-bg-surface) 65%, transparent);
  font-size: 12px;
}
</style>
