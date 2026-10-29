<script setup lang="ts">
/**
 * WorkspaceInspector — 全屏工作台配置右侧属性面板。
 *
 * 数据页签配置表单/字段/统计/筛选/列/排序；样式页签配置配色、系列色、
 * 图例/标签/网格、分组/堆叠与热力梯度。不适用的选项不渲染。
 */
import { computed, ref } from 'vue'
import { useI18n } from '@/locales'
import type { CatalogItem } from '@/contracts/catalog'
import type { WorkspaceField, WorkspaceFormSource } from '../api/workspace-analytics'
import WorkspaceFormPickerDialog from './WorkspaceFormPickerDialog.vue'
import WorkspaceColorDialog from './WorkspaceColorDialog.vue'
import {
  PALETTES,
  defaultChartStyle,
  paletteColors,
  type WorkspaceChartType,
} from '../utils/workspace-data'
import { chartTypeOf, kindOf, type StudioCard } from '../utils/workspace-studio'

const props = defineProps<{
  card: StudioCard
  sources: WorkspaceFormSource[]
  fields: WorkspaceField[]
  fieldsLoading: boolean
  favoriteKeys?: string[]
  catalogItems?: CatalogItem[]
}>()

const emit = defineEmits<{
  update: [card: StudioCard]
  remove: [id: string]
  'form-change': [id: string, formKey: string]
  'toggle-favorite': [itemKey: string]
  'open-metrics': []
  'open-filters': []
  'open-columns': []
  'open-chart-type': []
}>()

const { t } = useI18n()
const tab = ref<'data' | 'style'>('data')
const pickerVisible = ref(false)
const colorVisible = ref(false)
const colorIndex = ref(0)
const colorField = ref('')

const boundFormName = computed(
  () =>
    props.sources.find((source) => source.formKey === props.card.config.formKey)?.name ??
    t('workspace.inspector.noForm'),
)

const kind = computed(() => kindOf(props.card.typeCode))
const chartType = computed(() => chartTypeOf(props.card))
const hasStyle = computed(() => kind.value === 'chart')
const isCartesian = computed(() =>
  ['bar', 'hbar', 'line', 'area', 'combo'].includes(chartType.value),
)

const widthOptions = computed(() => {
  const base = [25, 33, 50, 75, 100]
  const spanRows = base.map((percent) => ({
    percent,
    span: Math.max(1, Math.round((percent / 100) * 12)),
  }))
  if (!spanRows.some((row) => row.span === props.card.span)) {
    spanRows.push({
      percent: Math.round((props.card.span / 12) * 100),
      span: props.card.span,
    })
  }
  return spanRows
})

const numericFields = computed(() =>
  props.fields.filter((field) => field.type === 'NUMBER' || field.type === 'FORMULA'),
)
const sortableFields = computed(() => props.fields)
const filterCount = computed(() => props.card.config.filters?.length ?? 0)
const metricCount = computed(() => props.card.config.metrics?.length ?? 0)

function patch(patchValue: Partial<StudioCard>): void {
  emit('update', { ...props.card, ...patchValue })
}

function patchConfig(patchValue: Partial<StudioCard['config']>): void {
  emit('update', { ...props.card, config: { ...props.card.config, ...patchValue } })
}

function patchStyle(patchValue: Partial<NonNullable<StudioCard['config']['style']>>): void {
  emit('update', {
    ...props.card,
    config: {
      ...props.card.config,
      style: { ...defaultChartStyle(), ...(props.card.config.style ?? {}), ...patchValue },
    },
  })
}

function onFormChange(formKey: string): void {
  emit('form-change', props.card.id, formKey)
}

function onMetricField(value: string): void {
  const field = value === '__count__' ? '' : value
  const agg = field
    ? props.card.config.metricAgg === 'COUNT'
      ? 'SUM'
      : props.card.config.metricAgg
    : 'COUNT'
  patchConfig({ metricField: field || undefined, metricAgg: agg })
}

function onMetricAgg(value: string): void {
  patchConfig({ metricAgg: value as StudioCard['config']['metricAgg'] })
}

function onChartType(value: WorkspaceChartType): void {
  patchConfig({ chartType: value })
}

function seriesColorValue(index: number, fieldName: string): string {
  const key = fieldName || `metric-${index}`
  const fallback = paletteColors(props.card.config.style)[
    index % paletteColors(props.card.config.style).length
  ]
  return (
    props.card.config.style?.seriesColors?.[key] ??
    props.card.config.metrics?.[index]?.color ??
    fallback
  )
}

function setSeriesColor(index: number, fieldName: string, color: string): void {
  const key = fieldName || `metric-${index}`
  patchStyle({ seriesColors: { ...(props.card.config.style?.seriesColors ?? {}), [key]: color } })
}

function openSeriesColor(index: number, fieldName: string): void {
  colorIndex.value = index
  colorField.value = fieldName
  colorVisible.value = true
}

function applySeriesColor(color: string): void {
  setSeriesColor(colorIndex.value, colorField.value, color)
}

const colorDialogName = computed(() => {
  const metric = props.card.config.metrics?.[colorIndex.value]
  return (
    props.fields.find((field) => field.name === metric?.field)?.label ||
    metric?.field ||
    t('workspace.inspector.recordCount')
  )
})

const colorDialogValue = computed(() => seriesColorValue(colorIndex.value, colorField.value))

function palette() {
  return paletteColors(props.card.config.style)
}

function setGradient(index: 0 | 1, value: string): void {
  const current = props.card.config.style?.gradient ?? ['#dbeafe', '#7c3aed']
  const next: [string, string] = [current[0], current[1]]
  next[index] = value
  patchStyle({ gradient: next })
}

function isStackable() {
  return ['bar', 'area', 'combo'].includes(chartType.value)
}
</script>

<template>
  <aside class="winsp">
    <header class="winsp__head">
      <h3>{{ t('workspace.inspector.title') }}</h3>
      <button type="button" class="winsp__delete" @click="emit('remove', card.id)">
        {{ t('workspace.inspector.remove') }}
      </button>
    </header>

    <div class="winsp__body">
      <section class="winsp__section">
        <label class="winsp__label">{{ t('workspace.inspector.titleField') }}</label>
        <el-input :model-value="card.title" @update:model-value="patch({ title: $event })" />
      </section>

      <section class="winsp__geometry">
        <label>
          <span class="winsp__label">{{ t('workspace.inspector.width') }}</span>
          <el-select :model-value="card.span" @update:model-value="patch({ span: Number($event) })">
            <el-option
              v-for="option in widthOptions"
              :key="option.span"
              :label="`${option.percent}%`"
              :value="option.span"
            />
          </el-select>
        </label>
        <label>
          <span class="winsp__label">{{ t('workspace.inspector.height') }}</span>
          <el-input-number
            :model-value="card.height"
            :min="120"
            :max="1600"
            :step="20"
            controls-position="right"
            @update:model-value="patch({ height: Number($event) })"
          />
        </label>
      </section>

      <!-- 审查23 W19-I：数据/样式 140×32 双页签铺在宽高下方 -->
      <div v-if="hasStyle" class="winsp__tabs">
        <button
          type="button"
          class="winsp__tab"
          :class="{ 'is-active': tab === 'data' }"
          @click="tab = 'data'"
        >
          {{ t('workspace.inspector.dataTab') }}
        </button>
        <button
          type="button"
          class="winsp__tab"
          :class="{ 'is-active': tab === 'style' }"
          @click="tab = 'style'"
        >
          {{ t('workspace.inspector.styleTab') }}
        </button>
      </div>

      <template v-if="tab === 'data'">
        <template v-if="kind === 'system'">
          <p class="winsp__hint">{{ t('workspace.inspector.systemHint') }}</p>
          <section v-if="card.typeCode === 'favoriteItems'" class="winsp__section">
            <label class="winsp__label">{{ t('workspace.inspector.favoriteItems') }}</label>
            <ul class="winsp__favorites">
              <li v-for="item in catalogItems ?? []" :key="item.itemKey">
                <el-checkbox
                  :model-value="(favoriteKeys ?? []).includes(item.itemKey)"
                  @change="emit('toggle-favorite', item.itemKey)"
                >
                  {{ item.name }}
                </el-checkbox>
              </li>
            </ul>
            <p class="winsp__hint">{{ t('workspace.inspector.favoriteHint') }}</p>
          </section>
        </template>

        <template v-else>
          <section class="winsp__section">
            <label class="winsp__label">{{ t('workspace.inspector.form') }}</label>
            <div class="winsp__form-row">
              <button type="button" class="winsp__form-trigger" @click="pickerVisible = true">
                <span class="winsp__form-trigger-name">{{ boundFormName }}</span>
                <span class="winsp__form-trigger-action">{{
                  card.config.formKey
                    ? t('workspace.formPicker.change')
                    : t('workspace.formPicker.title')
                }}</span>
              </button>
              <el-button v-if="card.config.formKey" text @click="onFormChange('')">
                {{ t('workspace.formPicker.clear') }}
              </el-button>
            </div>
            <WorkspaceFormPickerDialog
              v-model="pickerVisible"
              :sources="sources"
              :current-form-key="card.config.formKey ?? null"
              @select="onFormChange"
            />
            <p v-if="fieldsLoading" class="winsp__hint">{{ t('common.loading') }}</p>
            <p v-else-if="card.config.formKey && !fields.length" class="winsp__hint">
              {{ t('workspace.inspector.noFields') }}
            </p>
          </section>

          <section v-if="kind === 'metric'" class="winsp__section">
            <label class="winsp__label">{{ t('workspace.inspector.metricField') }}</label>
            <el-select
              :model-value="card.config.metricField ?? '__count__'"
              @update:model-value="onMetricField"
            >
              <el-option :label="t('workspace.inspector.recordCount')" value="__count__" />
              <el-option
                v-for="field in numericFields"
                :key="field.name"
                :label="field.label"
                :value="field.name"
              />
            </el-select>
          </section>
          <section v-if="kind === 'metric'" class="winsp__section">
            <label class="winsp__label">{{ t('workspace.inspector.agg') }}</label>
            <el-select
              :model-value="card.config.metricAgg ?? 'COUNT'"
              @update:model-value="onMetricAgg"
            >
              <el-option label="COUNT" value="COUNT" />
              <el-option label="SUM" value="SUM" />
              <el-option label="AVG" value="AVG" />
              <el-option label="MIN" value="MIN" />
              <el-option label="MAX" value="MAX" />
            </el-select>
          </section>
          <section v-if="kind === 'metric'" class="winsp__section">
            <label class="winsp__label">{{ t('workspace.inspector.numberFormat') }}</label>
            <el-select
              :model-value="card.config.metricFormat ?? 'integer'"
              @update:model-value="patchConfig({ metricFormat: $event })"
            >
              <el-option :label="t('workspace.inspector.integer')" value="integer" />
              <el-option :label="t('workspace.inspector.decimal')" value="decimal" />
              <el-option :label="t('workspace.inspector.percent')" value="percent" />
            </el-select>
          </section>

          <template v-if="kind === 'chart'">
            <section class="winsp__section">
              <label class="winsp__label">{{ t('workspace.inspector.chartType') }}</label>
              <div class="winsp__inline">
                <el-select :model-value="chartType" @update:model-value="onChartType">
                  <el-option
                    v-for="type in [
                      'bar',
                      'hbar',
                      'line',
                      'area',
                      'combo',
                      'pie',
                      'donut',
                      'scatter',
                      'radar',
                      'funnel',
                      'gauge',
                      'heatmap',
                    ]"
                    :key="type"
                    :label="t(`workspace.chartType.${type}`)"
                    :value="type"
                  />
                </el-select>
                <el-button plain @click="emit('open-chart-type')">
                  {{ t('workspace.inspector.choose') }}
                </el-button>
              </div>
            </section>
            <section class="winsp__section">
              <div class="winsp__summary">
                <span>{{ t('workspace.inspector.dimension') }}</span>
                <strong>{{ card.config.groupBy || '—' }}</strong>
              </div>
              <div class="winsp__summary">
                <span>{{ t('workspace.inspector.metrics') }}</span>
                <strong>{{ metricCount }}</strong>
              </div>
              <el-button plain @click="emit('open-metrics')">
                {{ t('workspace.inspector.editMetrics') }}
              </el-button>
            </section>
          </template>

          <template v-if="kind === 'list'">
            <section class="winsp__section">
              <div class="winsp__inline">
                <span class="winsp__label">{{ t('workspace.inspector.columns') }}</span>
                <el-button plain @click="emit('open-columns')">
                  {{ t('workspace.inspector.editColumns') }}
                </el-button>
              </div>
              <p class="winsp__hint">{{ card.config.columns?.length ?? 0 }} / 8</p>
            </section>
            <section class="winsp__section">
              <label class="winsp__label">{{ t('workspace.inspector.sortField') }}</label>
              <el-select
                :model-value="card.config.sortField ?? ''"
                clearable
                @update:model-value="patchConfig({ sortField: $event || undefined })"
              >
                <el-option
                  v-for="field in sortableFields"
                  :key="field.name"
                  :label="field.label"
                  :value="field.name"
                />
              </el-select>
            </section>
            <section class="winsp__section">
              <label class="winsp__label">{{ t('workspace.inspector.sortOrder') }}</label>
              <div class="winsp__segmented">
                <button
                  type="button"
                  :class="{ 'is-active': card.config.sortOrder !== 'ASC' }"
                  @click="patchConfig({ sortOrder: 'DESC' })"
                >
                  {{ t('workspace.inspector.desc') }}
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': card.config.sortOrder === 'ASC' }"
                  @click="patchConfig({ sortOrder: 'ASC' })"
                >
                  {{ t('workspace.inspector.asc') }}
                </button>
              </div>
            </section>
            <section class="winsp__section">
              <label class="winsp__label">{{ t('workspace.inspector.presentation') }}</label>
              <div class="winsp__segmented">
                <button
                  type="button"
                  :class="{ 'is-active': card.config.presentation !== 'auto' }"
                  @click="patchConfig({ presentation: 'paged' })"
                >
                  {{ t('workspace.inspector.paged') }}
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': card.config.presentation === 'auto' }"
                  @click="patchConfig({ presentation: 'auto' })"
                >
                  {{ t('workspace.inspector.auto') }}
                </button>
              </div>
            </section>
            <section class="winsp__section">
              <label class="winsp__label">{{ t('workspace.inspector.pageSize') }}</label>
              <el-select
                :model-value="card.config.pageSize ?? 5"
                @update:model-value="patchConfig({ pageSize: Number($event) })"
              >
                <el-option :label="'3'" :value="3" />
                <el-option :label="'5'" :value="5" />
                <el-option :label="'10'" :value="10" />
                <el-option :label="'20'" :value="20" />
              </el-select>
            </section>
          </template>

          <section class="winsp__section">
            <div class="winsp__inline">
              <span class="winsp__label">{{ t('workspace.inspector.filters') }}</span>
              <el-button plain @click="emit('open-filters')">
                {{ t('workspace.inspector.setFilters') }}
              </el-button>
            </div>
            <p class="winsp__hint">
              {{ t('workspace.inspector.filterCount', { count: filterCount }) }}
            </p>
          </section>
        </template>
      </template>

      <template v-else-if="hasStyle">
        <section class="winsp__section">
          <label class="winsp__label">{{ t('workspace.inspector.palette') }}</label>
          <el-select
            :model-value="card.config.style?.palette ?? 'classic'"
            @update:model-value="patchStyle({ palette: $event })"
          >
            <el-option
              v-for="key in Object.keys(PALETTES)"
              :key="key"
              :label="t(`workspace.palette.${key}`)"
              :value="key"
            />
          </el-select>
          <div class="winsp__swatches">
            <i v-for="(color, index) in palette()" :key="index" :style="{ background: color }" />
          </div>
        </section>

        <section class="winsp__section">
          <label class="winsp__label">{{ t('workspace.inspector.seriesColors') }}</label>
          <div
            v-for="(metric, index) in card.config.metrics ?? []"
            :key="index"
            class="winsp__color-row"
          >
            <span>{{ metric.field || t('workspace.inspector.recordCount') }}</span>
            <button
              type="button"
              class="winsp__color-btn"
              :aria-label="t('workspace.color.title')"
              @click="openSeriesColor(index, metric.field)"
            >
              <i :style="{ background: seriesColorValue(index, metric.field) }" />
              <span>{{ seriesColorValue(index, metric.field) }}</span>
            </button>
          </div>
        </section>

        <section class="winsp__section winsp__toggles">
          <label>
            <span>{{ t('workspace.inspector.legend') }}</span>
            <el-switch
              :model-value="card.config.style?.legend !== false"
              @update:model-value="patchStyle({ legend: Boolean($event) })"
            />
          </label>
          <label>
            <span>{{ t('workspace.inspector.labels') }}</span>
            <el-switch
              :model-value="card.config.style?.labels !== false"
              @update:model-value="patchStyle({ labels: Boolean($event) })"
            />
          </label>
          <label v-if="isCartesian">
            <span>{{ t('workspace.inspector.grid') }}</span>
            <el-switch
              :model-value="card.config.style?.grid !== false"
              @update:model-value="patchStyle({ grid: Boolean($event) })"
            />
          </label>
        </section>

        <section v-if="isStackable()" class="winsp__section">
          <label class="winsp__label">{{ t('workspace.inspector.seriesMode') }}</label>
          <div class="winsp__segmented">
            <button
              type="button"
              :class="{ 'is-active': card.config.style?.stack !== 'stack' }"
              @click="patchStyle({ stack: 'group' })"
            >
              {{ t('workspace.inspector.group') }}
            </button>
            <button
              type="button"
              :class="{ 'is-active': card.config.style?.stack === 'stack' }"
              @click="patchStyle({ stack: 'stack' })"
            >
              {{ t('workspace.inspector.stack') }}
            </button>
          </div>
        </section>

        <section class="winsp__section">
          <label class="winsp__label">{{ t('workspace.inspector.legendPosition') }}</label>
          <el-select
            :model-value="card.config.style?.legendPosition ?? 'top'"
            @update:model-value="patchStyle({ legendPosition: $event })"
          >
            <el-option :label="t('workspace.inspector.top')" value="top" />
            <el-option :label="t('workspace.inspector.bottom')" value="bottom" />
          </el-select>
        </section>

        <section v-if="chartType === 'heatmap'" class="winsp__section">
          <label class="winsp__label">{{ t('workspace.inspector.gradient') }}</label>
          <div class="winsp__gradient">
            <input
              type="color"
              :value="card.config.style?.gradient?.[0] ?? '#dbeafe'"
              @input="setGradient(0, ($event.target as HTMLInputElement).value)"
            />
            <input
              type="color"
              :value="card.config.style?.gradient?.[1] ?? '#7c3aed'"
              @input="setGradient(1, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </section>
      </template>
    </div>
  </aside>

  <WorkspaceColorDialog
    v-if="hasStyle"
    v-model="colorVisible"
    :name="colorDialogName"
    :color="colorDialogValue"
    @apply="applySeriesColor"
  />
</template>

<style scoped>
.winsp {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 336px;
  flex: 0 0 336px;
  height: 100%;
  border-left: 1px solid var(--sw-border-light, #eef0f4);
  background: var(--sw-bg-surface, #fff);
}

.winsp__head {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 24px 24px 8px;
}

.winsp__head h3 {
  flex: 1;
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.winsp__delete {
  border: 0;
  background: transparent;
  color: var(--sw-text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.winsp__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  box-sizing: border-box;
  width: 288px;
  height: 32px;
  margin-bottom: 12px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 4px;
  overflow: hidden;
}

.winsp__tab {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.winsp__tab.is-active {
  background: var(--sw-color-primary, #2563eb);
  color: #fff;
}

.winsp__body {
  flex: 1;
  min-height: 0;
  padding: 8px 24px 24px;
  overflow-y: auto;
}

/* 源稿控件高 32：Element Plus small 默认 24 会把属性区分组压得过密。 */
.winsp :deep(.el-input__wrapper),
.winsp :deep(.el-select__wrapper) {
  min-height: 32px;
}

.winsp :deep(.el-input__inner) {
  height: 30px;
}

.winsp__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.winsp__geometry {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.winsp__geometry label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.winsp__label {
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 22px;
}

.winsp__hint {
  margin: 0;
  color: var(--sw-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.winsp__favorites {
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.winsp__favorites li {
  padding: 2px 0;
}

.winsp__inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.winsp__inline .el-select {
  flex: 1;
}

.winsp__inline .winsp__label {
  flex: 1;
}

.winsp__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.winsp__summary strong {
  color: var(--sw-text-primary);
  font-weight: 500;
}

.winsp__segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 5px;
  overflow: hidden;
}

.winsp__segmented button {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--sw-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.winsp__segmented button.is-active {
  background: var(--sw-color-primary, #2563eb);
  color: #fff;
}

.winsp__swatches {
  display: flex;
  gap: 6px;
}

.winsp__swatches i {
  width: 22px;
  height: 12px;
  border-radius: 2px;
}

.winsp__color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 44px;
  gap: 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}

.winsp__color-row input,
.winsp__gradient input {
  width: 34px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #fff;
}

.winsp__color-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 118px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.winsp__color-btn i {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 8%);
}

.winsp__gradient {
  display: flex;
  gap: 8px;
}

.winsp__toggles {
  gap: 10px;
}

.winsp__toggles label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.winsp__form-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.winsp__form-trigger {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
  cursor: pointer;
}

.winsp__form-trigger:hover {
  border-color: var(--sw-color-primary);
}

.winsp__form-trigger-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--sw-text-primary);
  text-align: left;
}

.winsp__form-trigger-action {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--sw-color-primary);
}
</style>
