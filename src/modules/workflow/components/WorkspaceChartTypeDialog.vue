<script setup lang="ts">
/** 12 种图表类型选择：切换后保留已配置维度和指标，只改变呈现。 */
import { useI18n } from '@/locales'
import type { WorkspaceChartType } from '../utils/workspace-data'

defineProps<{
  modelValue: boolean
  value: WorkspaceChartType
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [type: WorkspaceChartType]
}>()

const { t } = useI18n()

const types: WorkspaceChartType[] = [
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
]

function choose(type: WorkspaceChartType): void {
  emit('select', type)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.chartType.title')"
    width="760px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wctype">
      <button
        v-for="type in types"
        :key="type"
        type="button"
        class="wctype__item"
        :class="{ 'is-active': value === type }"
        :data-chart-type="type"
        @click="choose(type)"
      >
        <svg class="wctype__icon" viewBox="0 0 48 32" aria-hidden="true">
          <template v-if="type === 'bar'">
            <rect x="7" y="16" width="7" height="12" rx="1" fill="#7c3aed" />
            <rect x="20" y="8" width="7" height="20" rx="1" fill="#3b82f6" />
            <rect x="33" y="12" width="7" height="16" rx="1" fill="#10b981" />
          </template>
          <template v-else-if="type === 'hbar'">
            <rect x="6" y="6" width="30" height="5" rx="1" fill="#7c3aed" />
            <rect x="6" y="14" width="22" height="5" rx="1" fill="#3b82f6" />
            <rect x="6" y="22" width="14" height="5" rx="1" fill="#10b981" />
          </template>
          <template v-else-if="type === 'line'">
            <polyline
              points="6,24 16,12 26,18 40,6"
              fill="none"
              stroke="#7c3aed"
              stroke-width="2.5"
            />
          </template>
          <template v-else-if="type === 'area'">
            <polygon points="6,26 14,14 24,19 40,7 40,26" fill="#7c3aed" opacity="0.25" />
            <polyline
              points="6,26 14,14 24,19 40,7"
              fill="none"
              stroke="#7c3aed"
              stroke-width="2.5"
            />
          </template>
          <template v-else-if="type === 'combo'">
            <rect x="8" y="16" width="7" height="12" fill="#7c3aed" />
            <rect x="24" y="10" width="7" height="18" fill="#3b82f6" />
            <polyline
              points="6,22 16,12 28,16 42,6"
              fill="none"
              stroke="#10b981"
              stroke-width="2"
            />
          </template>
          <template v-else-if="type === 'pie'">
            <circle cx="24" cy="16" r="12" fill="#7c3aed" />
            <path d="M24 16 L24 4 A12 12 0 0 1 35 22 Z" fill="#3b82f6" />
          </template>
          <template v-else-if="type === 'donut'">
            <circle cx="24" cy="16" r="9" fill="none" stroke="#7c3aed" stroke-width="6" />
            <path d="M24 7 A9 9 0 0 1 31 22" fill="none" stroke="#3b82f6" stroke-width="6" />
          </template>
          <template v-else-if="type === 'scatter'">
            <circle cx="10" cy="22" r="2.5" fill="#7c3aed" />
            <circle cx="17" cy="17" r="2.5" fill="#3b82f6" />
            <circle cx="24" cy="20" r="2.5" fill="#10b981" />
            <circle cx="31" cy="10" r="2.5" fill="#f59e0b" />
            <circle cx="39" cy="7" r="2.5" fill="#ec4899" />
          </template>
          <template v-else-if="type === 'radar'">
            <polygon
              points="24,4 38,13 33,28 15,28 10,13"
              fill="none"
              stroke="#7c3aed"
              stroke-width="2"
            />
            <polygon points="24,9 33,15 29,24 19,24 15,15" fill="#7c3aed" opacity="0.22" />
          </template>
          <template v-else-if="type === 'funnel'">
            <rect x="10" y="5" width="28" height="6" fill="#7c3aed" />
            <rect x="14" y="14" width="20" height="6" fill="#3b82f6" />
            <rect x="18" y="23" width="12" height="5" fill="#10b981" />
          </template>
          <template v-else-if="type === 'gauge'">
            <path d="M9 25 A15 15 0 0 1 39 25" fill="none" stroke="#e5e7eb" stroke-width="6" />
            <path d="M9 25 A15 15 0 0 1 31 12" fill="none" stroke="#7c3aed" stroke-width="6" />
          </template>
          <template v-else-if="type === 'heatmap'">
            <rect x="7" y="6" width="9" height="8" fill="#7c3aed" opacity="0.25" />
            <rect x="19" y="6" width="9" height="8" fill="#7c3aed" opacity="0.55" />
            <rect x="31" y="6" width="9" height="8" fill="#7c3aed" opacity="0.9" />
            <rect x="7" y="17" width="9" height="8" fill="#7c3aed" opacity="0.65" />
            <rect x="19" y="17" width="9" height="8" fill="#7c3aed" opacity="0.35" />
            <rect x="31" y="17" width="9" height="8" fill="#7c3aed" opacity="0.75" />
          </template>
        </svg>
        <span>{{ t(`workspace.chartType.${type}`) }}</span>
      </button>
    </div>
  </el-dialog>
</template>

<style scoped>
.wctype {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.wctype__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 8px;
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.wctype__item:hover,
.wctype__item.is-active {
  border-color: var(--sw-color-primary, #2563eb);
  color: var(--sw-color-primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sw-color-primary, #2563eb) 10%, transparent);
}

.wctype__icon {
  width: 54px;
  height: 36px;
}
</style>
