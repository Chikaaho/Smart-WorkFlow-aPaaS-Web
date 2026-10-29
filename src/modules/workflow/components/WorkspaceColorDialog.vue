<script setup lang="ts">
/* global MouseEvent, HTMLElement */
/** 图表系列自定义颜色：HEX + 不透明度，输出 6/8 位 HEX。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { PALETTES, composeHexColor, parseHexColor } from '../utils/workspace-data'

const props = defineProps<{
  modelValue: boolean
  /** 当前指标名，用于弹窗内的归属提示。 */
  name?: string
  color?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [value: string]
}>()

const { t } = useI18n()

const hex = ref('#7c3aed')
const opacity = ref(100)
const common = [...PALETTES.classic, '#14b8a6', '#f97316', '#0f172a', '#64748b', '#cbd5e1']

const valid = computed(() => /^#[0-9a-f]{6}$/i.test(hex.value))
const preview = computed(() => composeHexColor(hex.value, opacity.value))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const parsed = parseHexColor(props.color)
    hex.value = parsed.hex
    opacity.value = parsed.opacity
  },
)

function onHexInput(value: string): void {
  hex.value = value.startsWith('#') ? value : `#${value}`
}

/* 审查23 W19-C：430×156 渐变取色（白→当前色→黑），点击仅改当前色与 HEX */
function channelAt(c: number, t: number): string {
  const v = t < 0.5 ? Math.round(255 + (c - 255) * (t * 2)) : Math.round(c * (1 - (t - 0.5) * 2))
  return v.toString(16).padStart(2, '0')
}

function onGradientClick(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const r = parseInt(hex.value.slice(1, 3), 16)
  const g = parseInt(hex.value.slice(3, 5), 16)
  const b = parseInt(hex.value.slice(5, 7), 16)
  hex.value = `#${channelAt(r, t)}${channelAt(g, t)}${channelAt(b, t)}`
}

function choose(color: string): void {
  hex.value = color
}

function confirm(): void {
  if (!valid.value) return
  emit('apply', composeHexColor(hex.value, opacity.value))
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.color.title')"
    width="480px"
    append-to-body
    class="wcolor-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wcolor">
      <p v-if="name" class="wcolor__name">{{ name }}</p>
      <div
        class="wcolor__gradient"
        :style="{
          background: `linear-gradient(90deg, #ffffff 0%, ${valid ? hex : '#7c3aed'} 50%, #000000 100%)`,
        }"
        @click="onGradientClick"
      />
      <div class="wcolor__preview">
        <i :style="{ background: preview }" />
      </div>
      <div class="wcolor__row">
        <span class="wcolor__label">{{ t('workspace.color.hex') }}</span>
        <el-input :model-value="hex" maxlength="7" @update:model-value="onHexInput" />
        <el-input-number v-model="opacity" :min="0" :max="100" :step="1" />
        <span class="wcolor__percent">%</span>
      </div>
      <p v-if="!valid" class="wcolor__error">{{ t('workspace.color.invalid') }}</p>
      <div class="wcolor__common">
        <span class="wcolor__label">{{ t('workspace.color.common') }}</span>
        <button
          v-for="item in common"
          :key="item"
          type="button"
          class="wcolor__swatch"
          :class="{ 'is-active': item.toLowerCase() === hex.toLowerCase() }"
          :style="{ background: item }"
          :aria-label="item"
          @click="choose(item)"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!valid" @click="confirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wcolor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wcolor__name {
  margin: 0;
  font-size: 13px;
  color: var(--sw-text-primary, #1f2937);
}

.wcolor__gradient {
  box-sizing: content-box;
  width: 430px;
  height: 156px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 8px;
  cursor: crosshair;
}

.wcolor__preview {
  position: relative;
  box-sizing: border-box;
  height: 36px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
    linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
  background-size: 12px 12px;
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
}

.wcolor__preview i {
  display: block;
  width: 100%;
  height: 100%;
}

.wcolor__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wcolor__row :deep(.el-input) {
  width: 120px;
}
.wcolor__row :deep(.el-input__wrapper),
.wcolor__row :deep(.el-input-number .el-input__wrapper) {
  box-sizing: border-box;
  height: 32px;
}

.wcolor__row :deep(.el-input-number) {
  width: 110px;
}

.wcolor__picker {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  background: none;
}

.wcolor__label {
  font-size: 12px;
  color: var(--sw-text-tertiary, #6b7280);
}

.wcolor__percent {
  font-size: 12px;
  color: var(--sw-text-tertiary, #6b7280);
}

.wcolor__error {
  margin: -6px 0 0;
  font-size: 12px;
  color: #dc2626;
}

.wcolor__common {
  display: grid;
  grid-template-columns: repeat(6, 26px);
  align-items: center;
  gap: 8px;
}

.wcolor__common .wcolor__label {
  grid-column: 1 / -1;
}

.wcolor__swatch {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  cursor: pointer;
}

.wcolor__swatch.is-active {
  outline: 2px solid var(--sw-color-primary, #2563eb);
  outline-offset: 1px;
}
</style>

<style>
/* 审查23 W19-C：480 窗口、72×32 底栏 */
.wcolor-dialog.el-dialog {
  padding: 20px;
}
.wcolor-dialog .el-dialog__footer .el-button {
  width: 72px;
  height: 32px;
  margin: 0;
  padding: 0;
}
</style>
