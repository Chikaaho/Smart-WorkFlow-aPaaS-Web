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
  <!-- 提示28 Q06：1072 窗口，12 图型 4 列×3 行、卡片 244×146、间距 16，卡内为对应图型的静态缩略图例 -->
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.chartType.title')"
    width="1072px"
    append-to-body
    class="wctype-dialog"
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
        <svg class="wctype__icon" viewBox="0 0 200 84" aria-hidden="true">
          <template v-if="type === 'bar'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <rect x="30" y="26" width="9" height="42" rx="1" fill="#7c3aed" />
            <rect x="41" y="36" width="9" height="32" rx="1" fill="#3b82f6" />
            <rect x="68" y="38" width="9" height="30" rx="1" fill="#7c3aed" />
            <rect x="79" y="46" width="9" height="22" rx="1" fill="#3b82f6" />
            <rect x="106" y="48" width="9" height="20" rx="1" fill="#7c3aed" />
            <rect x="117" y="54" width="9" height="14" rx="1" fill="#3b82f6" />
            <rect x="144" y="56" width="9" height="12" rx="1" fill="#7c3aed" />
            <rect x="155" y="60" width="9" height="8" rx="1" fill="#3b82f6" />
          </template>
          <template v-else-if="type === 'hbar'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <rect x="14" y="20" width="118" height="8" rx="1" fill="#7c3aed" />
            <rect x="14" y="32" width="88" height="8" rx="1" fill="#3b82f6" />
            <rect x="14" y="44" width="62" height="8" rx="1" fill="#7c3aed" />
            <rect x="14" y="56" width="40" height="8" rx="1" fill="#3b82f6" />
          </template>
          <template v-else-if="type === 'line'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <polyline
              points="14,56 46,36 78,46 110,28 142,38 176,20"
              fill="none"
              stroke="#7c3aed"
              stroke-width="2"
            />
            <polyline
              points="14,62 46,50 78,54 110,44 142,50 176,40"
              fill="none"
              stroke="#3b82f6"
              stroke-width="2"
            />
            <circle cx="46" cy="36" r="2.5" fill="#7c3aed" />
            <circle cx="110" cy="28" r="2.5" fill="#7c3aed" />
            <circle cx="176" cy="20" r="2.5" fill="#7c3aed" />
            <circle cx="46" cy="50" r="2.5" fill="#3b82f6" />
            <circle cx="110" cy="44" r="2.5" fill="#3b82f6" />
            <circle cx="176" cy="40" r="2.5" fill="#3b82f6" />
          </template>
          <template v-else-if="type === 'area'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <polygon
              points="14,60 46,38 78,46 110,28 142,36 176,20 176,68 14,68"
              fill="#7c3aed"
              opacity="0.18"
            />
            <polyline
              points="14,60 46,38 78,46 110,28 142,36 176,20"
              fill="none"
              stroke="#7c3aed"
              stroke-width="2"
            />
            <polygon
              points="14,64 46,54 78,58 110,48 142,52 176,42 176,68 14,68"
              fill="#3b82f6"
              opacity="0.15"
            />
            <polyline
              points="14,64 46,54 78,58 110,48 142,52 176,42"
              fill="none"
              stroke="#3b82f6"
              stroke-width="2"
            />
          </template>
          <template v-else-if="type === 'combo'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#10b981" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <rect x="30" y="32" width="10" height="36" rx="1" fill="#7c3aed" />
            <rect x="44" y="44" width="10" height="24" rx="1" fill="#3b82f6" />
            <rect x="78" y="38" width="10" height="30" rx="1" fill="#7c3aed" />
            <rect x="92" y="50" width="10" height="18" rx="1" fill="#3b82f6" />
            <polyline
              points="20,52 62,34 104,44 146,26 182,32"
              fill="none"
              stroke="#10b981"
              stroke-width="2"
            />
          </template>
          <template v-else-if="type === 'pie'">
            <circle cx="62" cy="44" r="26" fill="#7c3aed" />
            <path d="M62 44 L62 18 A26 26 0 0 1 87.6 48.5 Z" fill="#3b82f6" />
            <path d="M62 44 L87.6 48.5 A26 26 0 0 1 36 44 Z" fill="#10b981" />
            <circle cx="138" cy="44" r="26" fill="#7c3aed" />
            <path d="M138 44 L138 18 A26 26 0 0 1 160.5 57 Z" fill="#3b82f6" />
            <path d="M138 44 L160.5 57 A26 26 0 0 1 125 66.5 Z" fill="#f59e0b" />
            <circle cx="32" cy="79" r="3" fill="#7c3aed" />
            <rect x="38" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="72" cy="79" r="3" fill="#3b82f6" />
            <rect x="78" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="112" cy="79" r="3" fill="#10b981" />
            <rect x="118" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="152" cy="79" r="3" fill="#f59e0b" />
            <rect x="158" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
          </template>
          <template v-else-if="type === 'donut'">
            <circle cx="62" cy="44" r="17" fill="none" stroke="#7c3aed" stroke-width="11" />
            <path
              d="M62 27 A17 17 0 0 1 78.7 47 Z"
              fill="none"
              stroke="#3b82f6"
              stroke-width="11"
            />
            <circle cx="138" cy="44" r="17" fill="none" stroke="#7c3aed" stroke-width="11" />
            <path
              d="M138 27 A17 17 0 0 1 154.7 47 Z"
              fill="none"
              stroke="#3b82f6"
              stroke-width="11"
            />
            <circle cx="32" cy="79" r="3" fill="#7c3aed" />
            <rect x="38" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="72" cy="79" r="3" fill="#3b82f6" />
            <rect x="78" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="112" cy="79" r="3" fill="#10b981" />
            <rect x="118" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="152" cy="79" r="3" fill="#f59e0b" />
            <rect x="158" y="77.5" width="14" height="3" rx="1.5" fill="#cbd5e1" />
          </template>
          <template v-else-if="type === 'scatter'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <path d="M14 12 V68 H190" fill="none" stroke="#e2e8f0" />
            <circle cx="30" cy="56" r="3" fill="#7c3aed" />
            <circle cx="46" cy="50" r="3" fill="#3b82f6" />
            <circle cx="60" cy="44" r="3" fill="#10b981" />
            <circle cx="74" cy="48" r="3" fill="#f59e0b" />
            <circle cx="88" cy="36" r="3" fill="#ec4899" />
            <circle cx="102" cy="40" r="3" fill="#7c3aed" />
            <circle cx="116" cy="28" r="3" fill="#3b82f6" />
            <circle cx="130" cy="34" r="3" fill="#10b981" />
            <circle cx="144" cy="24" r="3" fill="#f59e0b" />
            <circle cx="158" cy="28" r="3" fill="#ec4899" />
            <circle cx="172" cy="20" r="3" fill="#7c3aed" />
          </template>
          <template v-else-if="type === 'radar'">
            <circle cx="56" cy="6" r="3" fill="#7c3aed" />
            <rect x="63" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <circle cx="108" cy="6" r="3" fill="#3b82f6" />
            <rect x="115" y="4.5" width="22" height="3" rx="1.5" fill="#cbd5e1" />
            <polygon
              points="100,14 128.5,34.7 117.6,68.3 82.4,68.3 71.5,34.7"
              fill="none"
              stroke="#e2e8f0"
            />
            <polygon
              points="100,29 114.3,39.4 108.8,56.1 91.2,56.1 85.7,39.4"
              fill="none"
              stroke="#e2e8f0"
            />
            <polygon
              points="100,20 122.8,36.6 114.1,63.4 85.9,63.4 77.2,36.6"
              fill="#7c3aed"
              opacity="0.25"
              stroke="#7c3aed"
              stroke-width="1.5"
            />
          </template>
          <template v-else-if="type === 'funnel'">
            <polygon points="34,16 96,16 86,28 44,28" fill="#7c3aed" />
            <polygon points="44,30 86,30 77,42 53,42" fill="#8b5cf6" />
            <polygon points="53,44 77,44 68,56 62,56" fill="#a78bfa" />
            <polygon points="104,16 166,16 156,28 114,28" fill="#6366f1" />
            <polygon points="114,30 156,30 147,42 123,42" fill="#818cf8" />
            <polygon points="123,44 147,44 138,56 132,56" fill="#a5b4fc" />
          </template>
          <template v-else-if="type === 'gauge'">
            <path
              d="M56 64 A44 44 0 0 1 144 64"
              fill="none"
              stroke="#e2e8f0"
              stroke-width="10"
              stroke-linecap="round"
            />
            <path
              d="M56 64 A44 44 0 0 1 134.8 37"
              fill="none"
              stroke="#7c3aed"
              stroke-width="10"
              stroke-linecap="round"
            />
          </template>
          <template v-else-if="type === 'heatmap'">
            <rect x="46" y="16" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.25" />
            <rect x="76" y="16" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.55" />
            <rect x="106" y="16" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.8" />
            <rect x="136" y="16" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.95" />
            <rect x="46" y="34" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.5" />
            <rect x="76" y="34" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.85" />
            <rect x="106" y="34" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.35" />
            <rect x="136" y="34" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.65" />
            <rect x="46" y="52" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.7" />
            <rect x="76" y="52" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.4" />
            <rect x="106" y="52" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.9" />
            <rect x="136" y="52" width="26" height="14" rx="2" fill="#7c3aed" opacity="0.6" />
          </template>
        </svg>
        <span class="wctype__name">{{ t(`workspace.chartType.${type}`) }}</span>
      </button>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 提示28 Q06：4 列×244 卡 + 3×16 间距，正好填满 1072-48 的内容区 */
.wctype {
  display: grid;
  grid-template-columns: repeat(4, 244px);
  gap: 16px;
  justify-content: center;
}

.wctype__item {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 244px;
  height: 146px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 8px;
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-secondary);
  cursor: pointer;
}

.wctype__item:hover,
.wctype__item.is-active {
  border-color: var(--sw-color-primary, #2563eb);
  color: var(--sw-color-primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sw-color-primary, #2563eb) 10%, transparent);
}

.wctype__icon {
  width: 200px;
  height: 84px;
}

.wctype__name {
  font-size: 13px;
  line-height: 18px;
}
</style>

<style>
/* 提示28 Q06：1072 窗口 24 内边距（与指标窗口同模式） */
.wctype-dialog.el-dialog {
  padding: 24px;
}
</style>
