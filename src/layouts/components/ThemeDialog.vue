<script setup lang="ts">
/* global window, HTMLElement, PointerEvent */
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import DetailDialog from '@/components/DetailDialog.vue'
import {
  applyTheme,
  DEFAULT_THEME,
  isReadableThemeColor,
  previewThemeCssVariables,
  readTheme,
  resetTheme,
  type ThemeName,
} from '@/foundation/theme'
import blueIcon from '@/assets/theme/blue.svg'
import tealIcon from '@/assets/theme/teal.svg'
import customIcon from '@/assets/theme/custom.svg'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { t } = useI18n()
const draft = reactive(readTheme())
const colorInput = ref(draft.customColor)
const error = ref('')
const resetPending = ref(false)
/** 全局蓝色主色方向：紫色预设退出，面板收敛为 默认蓝/青色/自定义 三项。 */
const options: { name: ThemeName; icon: string }[] = [
  { name: 'blue', icon: blueIcon },
  { name: 'teal', icon: tealIcon },
  { name: 'custom', icon: customIcon },
]
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    Object.assign(draft, readTheme())
    colorInput.value = draft.customColor
    syncHsvFrom(draft.customColor)
    error.value = ''
    resetPending.value = false
  },
)
const previewStyle = computed(() => previewThemeCssVariables(draft))

/* ── 自定义展开（355:6575）：渐变面/色相条只做本地取色 ── */
const gradientRef = ref<HTMLElement | null>(null)
const hueRef = ref<HTMLElement | null>(null)
const hsv = reactive({ h: 220, s: 90, v: 90 })
const isCustom = computed(() => draft.name === 'custom')

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : Math.round((delta / max) * 100), v: Math.round(max * 100) }
}

function hsvToHex(h: number, s: number, v: number): string {
  const sat = s / 100
  const val = v / 100
  const channel = (n: number): number => {
    const k = (n + h / 60) % 6
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[channel(5), channel(3), channel(1)]
    .map((part) =>
      Math.round(part * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`
}

function syncHsvFrom(hex: string) {
  const parsed = hexToHsv(hex)
  if (parsed) Object.assign(hsv, parsed)
}

const hueColor = computed(() => hsvToHex(hsv.h, 100, 100))
const gradientBackground = computed(
  () =>
    `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${hueColor.value})`,
)
const gradientCursorStyle = computed(() => ({
  left: `${hsv.s}%`,
  top: `${100 - hsv.v}%`,
}))
const hueCursorStyle = computed(() => ({ left: `${(hsv.h / 359.9) * 100}%` }))

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function startAreaDrag(
  event: PointerEvent,
  area: HTMLElement | null,
  apply: (xPercent: number, yPercent: number) => void,
) {
  if (!area) return
  event.preventDefault()
  const rect = area.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const move = (pointer: PointerEvent) => {
    apply(
      clampPercent(((pointer.clientX - rect.left) / rect.width) * 100),
      clampPercent(((pointer.clientY - rect.top) / rect.height) * 100),
    )
  }
  move(event)
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function updateCustomFromHsv() {
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase()
  draft.customColor = hex
  colorInput.value = hex
}

function onGradientPointerDown(event: PointerEvent) {
  startAreaDrag(event, gradientRef.value, (x, y) => {
    hsv.s = Math.round(x)
    hsv.v = Math.round(100 - y)
    updateCustomFromHsv()
  })
}

function onHuePointerDown(event: PointerEvent) {
  startAreaDrag(event, hueRef.value, (x) => {
    hsv.h = Math.round(clampPercent(x) * 3.599)
    updateCustomFromHsv()
  })
}

watch(colorInput, (value) => {
  if (!isCustom.value || !/^#[0-9a-f]{6}$/i.test(value)) return
  draft.customColor = value.toLowerCase()
  syncHsvFrom(value)
})

function selectPreset(name: ThemeName) {
  draft.name = name
  error.value = ''
  resetPending.value = false
  if (name === 'custom') {
    const hex = /^#[0-9a-f]{6}$/i.test(colorInput.value) ? colorInput.value : draft.customColor
    colorInput.value = hex
    syncHsvFrom(hex)
  }
}
function changeCustom() {
  if (!/^#[0-9a-f]{6}$/i.test(colorInput.value)) {
    error.value = t('appearance.invalidColor')
    return false
  }
  if (!isReadableThemeColor(colorInput.value)) {
    error.value = t('appearance.invalidContrast')
    return false
  }
  draft.customColor = colorInput.value.toLowerCase()
  draft.name = 'custom'
  error.value = ''
  resetPending.value = false
  return true
}
function save() {
  if (draft.name === 'custom' && !changeCustom()) return
  if (resetPending.value) resetTheme()
  else applyTheme(draft)
  emit('update:modelValue', false)
}
function reset() {
  Object.assign(draft, DEFAULT_THEME)
  colorInput.value = draft.customColor
  error.value = ''
  resetPending.value = true
}
</script>

<template>
  <DetailDialog
    :model-value="modelValue"
    appearance="design"
    class="theme-dialog"
    width="560px"
    :title="t('appearance.title')"
    :error="error"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="theme-dialog__content">
      <span>{{ t('appearance.color') }}</span>
      <div class="theme-dialog__presets" role="group" :aria-label="t('appearance.color')">
        <button
          v-for="option in options"
          :key="option.name"
          type="button"
          :aria-pressed="draft.name === option.name"
          @click="selectPreset(option.name)"
        >
          <img :src="option.icon" alt="" width="18" height="18" />{{
            t(`appearance.${option.name}`)
          }}
        </button>
      </div>
      <div v-if="isCustom" class="theme-dialog__custom-panel">
        <div
          ref="gradientRef"
          class="theme-dialog__gradient"
          :style="{ background: gradientBackground }"
          :aria-label="t('appearance.custom')"
          @pointerdown="onGradientPointerDown"
        >
          <span class="theme-dialog__cursor" :style="gradientCursorStyle" />
        </div>
        <div ref="hueRef" class="theme-dialog__hue" @pointerdown="onHuePointerDown">
          <span class="theme-dialog__cursor theme-dialog__cursor--hue" :style="hueCursorStyle" />
        </div>
        <label class="theme-dialog__hex-label" for="theme-custom-color">HEX</label>
        <el-input
          id="theme-custom-color"
          v-model="colorInput"
          class="theme-dialog__hex-input"
          maxlength="7"
          @keyup.enter="changeCustom"
        />
      </div>
      <div v-else class="theme-dialog__custom">
        <label for="theme-custom-color">{{ t('appearance.custom') }}</label>
        <el-input
          id="theme-custom-color"
          v-model="colorInput"
          maxlength="7"
          @keyup.enter="changeCustom"
        />
        <el-button @click="changeCustom">{{ t('appearance.modify') }}</el-button>
      </div>
      <div
        class="theme-dialog__preview"
        :style="previewStyle"
        :aria-label="t('appearance.preview')"
      >
        <div class="theme-dialog__nav">
          CH-aPaaS <span>{{ t('common.workspace') }}</span>
        </div>
        <div class="theme-dialog__controls">
          <el-button type="primary">{{ t('common.submit') }}</el-button>
          <el-tag>{{ t('appearance.selected') }}</el-tag
          ><el-button link type="primary">{{ t('common.view') }}</el-button>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button link type="primary" class="theme-dialog__reset" @click="reset">{{
        t('appearance.reset')
      }}</el-button>
      <el-button type="primary" @click="save">{{ t('appearance.done') }}</el-button>
    </template>
  </DetailDialog>
</template>

<style>
.theme-dialog.el-dialog {
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  padding: var(--sw-space-24);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
}
.theme-dialog .el-dialog__header {
  box-sizing: border-box;
  width: calc(100% + 2px);
  height: 32px;
  padding: 4px 32px 4px 0;
  margin-bottom: var(--sw-space-20);
}
.theme-dialog .el-dialog__title {
  font-size: var(--sw-font-h2);
  font-weight: 500;
  line-height: 24px;
}
.theme-dialog .el-dialog__headerbtn {
  top: 24px;
  right: 24px;
  width: 32px;
  height: 32px;
}
.theme-dialog .el-dialog__body {
  width: calc(100% + 2px);
  padding: 0;
  overflow-x: hidden;
}
.theme-dialog .el-dialog__footer {
  display: flex;
  width: calc(100% + 2px);
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 36px;
  padding: 0;
  margin-top: 20px;
}
.theme-dialog .el-dialog__footer .el-button {
  width: 80px;
  margin: 0;
}
.theme-dialog .el-dialog__footer .theme-dialog__reset {
  width: 96px;
  margin-right: auto;
}
</style>
<style scoped>
.theme-dialog__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  line-height: 22px;
}
.theme-dialog__presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  height: 48px;
  align-items: center;
}
.theme-dialog__presets button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 12px;
  font: inherit;
  color: inherit;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  cursor: pointer;
}
.theme-dialog__presets button:focus-visible {
  outline: 2px solid var(--sw-color-primary);
  outline-offset: 2px;
}
.theme-dialog__custom {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
}
.theme-dialog__custom label {
  margin-right: auto;
}
.theme-dialog__custom .el-input {
  width: 150px;
}
.theme-dialog__custom .el-button {
  width: 80px;
  margin: 0;
}
/* 自定义展开（355:6575）：渐变面 512×180、色相条 512×16、HEX 输入 510×32，
   面板内部间距 16，弹窗总高随内容自然增至约 706。 */
.theme-dialog__custom-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}
.theme-dialog__gradient {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 2px;
  cursor: crosshair;
}
.theme-dialog__hue {
  position: relative;
  width: 100%;
  height: 16px;
  border-radius: 8px;
  background: linear-gradient(
    to right,
    #f00 0%,
    #ff0 17%,
    #0f0 33%,
    #0ff 50%,
    #00f 67%,
    #f0f 83%,
    #f00 100%
  );
  cursor: pointer;
}
.theme-dialog__cursor {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 2px rgb(0 0 0 / 45%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.theme-dialog__cursor--hue {
  top: 50%;
  width: 10px;
  height: 10px;
}
.theme-dialog__hex-label {
  line-height: 20px;
}
.theme-dialog__hex-input {
  width: 510px;
  max-width: 100%;
}
.theme-dialog__preview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 122px;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
}
.theme-dialog__nav {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 32px;
  padding: 0 8px;
  color: var(--sw-nav-topbar-text);
  background: var(--sw-nav-topbar-admin-bg);
}
.theme-dialog__controls {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 32px;
}
.theme-dialog__controls .el-button:not(.is-link) {
  width: 72px;
}
.theme-dialog__controls .el-tag {
  width: 54px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
  border: none;
}
@media (max-width: 500px) {
  .theme-dialog__presets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    height: 100px;
  }
  .theme-dialog__custom {
    gap: var(--sw-space-8);
  }
  .theme-dialog__custom .el-input {
    width: 130px;
  }
}
</style>
