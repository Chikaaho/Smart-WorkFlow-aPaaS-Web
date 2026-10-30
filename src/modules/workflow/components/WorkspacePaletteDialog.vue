<script setup lang="ts">
/**
 * WorkspacePaletteDialog — 工作台「配色方案」弹窗（设计 675:37049）。
 *
 * 760 宽弹层：四个方案行 64 高（border-box），每行带该方案既有色块，
 * 当前选中高亮反馈。仅本地选择/取消；色值、持久化与图表统计不改。
 * 「自定义」行沿用既有 palette='custom' 行为，不是自定义颜色编辑窗。
 */
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { PALETTES, type WorkspacePaletteKey } from '../utils/workspace-data'

const props = defineProps<{
  modelValue: boolean
  /** 当前方案键（config.style.palette）。 */
  currentPalette: WorkspacePaletteKey
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [palette: WorkspacePaletteKey]
}>()

const { t } = useI18n()
const picked = ref<WorkspacePaletteKey>('classic')

const paletteKeys = Object.keys(PALETTES) as WorkspacePaletteKey[]

function pick(key: WorkspacePaletteKey): void {
  picked.value = key
  emit('select', key)
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) picked.value = props.currentPalette
  },
)
</script>

<template>
  <!-- 提示30 Q07：760 配色方案弹层，方案行 64 高（border-box） -->
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.paletteDialog.title')"
    width="760px"
    append-to-body
    class="wpal-dialog"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wpal">
      <div class="wpal__list">
        <button
          v-for="key in paletteKeys"
          :key="key"
          type="button"
          class="wpal__row"
          :class="{ 'is-selected': picked === key }"
          @click="pick(key)"
        >
          <span class="wpal__name">{{ t(`workspace.palette.${key}`) }}</span>
          <span class="wpal__swatches">
            <i
              v-for="color in PALETTES[key]"
              :key="color"
              :style="{ background: color }"
              aria-hidden="true"
            />
          </span>
          <span v-if="picked === key" class="wpal__check" aria-hidden="true">✓</span>
        </button>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wpal {
  display: flex;
  flex-direction: column;
}

.wpal__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 方案行 64 高 border-box：名称左对齐、该方案色块排开、选中勾靠右 */
.wpal__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  height: 64px;
  padding: 0 36px 0 16px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  background: var(--sw-surface-card, #fff);
  cursor: pointer;
  text-align: left;
}

.wpal__row:hover {
  border-color: var(--sw-color-primary, #2563eb);
}

.wpal__row.is-selected {
  border-color: var(--sw-color-primary, #2563eb);
  background: var(--sw-color-primary-soft, #eff6ff);
}

.wpal__name {
  flex: 0 0 64px;
  color: var(--sw-text-primary, #1f2937);
  font-size: 13px;
  font-weight: 500;
}

.wpal__swatches {
  display: flex;
  gap: 10px;
}

.wpal__swatches i {
  width: 40px;
  height: 20px;
  border-radius: 4px;
}

.wpal__check {
  position: absolute;
  right: 12px;
  color: var(--sw-color-primary, #2563eb);
  font-size: 13px;
}
</style>

<style>
/* teleport 到 body 的弹窗体：沿用 wcolumns-dialog 的 :global 落根模式 */
.wpal-dialog.el-dialog {
  padding: 24px;
}
</style>
