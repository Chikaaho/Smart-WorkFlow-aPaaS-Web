<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ColorPickerPanelInstance } from 'element-plus'
import { useI18n } from '@/locales'
import DetailDialog from '@/components/DetailDialog.vue'
import AppIcon from './AppIcon.vue'
import {
  ICON_ASSETS,
  iconMask,
  APP_ICON_KEYS,
  APP_COLOR_PRESETS,
  resolveAppColor,
} from '../utils/app-icons'

const props = defineProps<{ icon?: string | null; color?: string | null }>()
const emit = defineEmits<{
  'update:icon': [value: string]
  'update:color': [value: string]
  active: [value: boolean]
}>()
const { t } = useI18n()
const mode = ref<'icon' | 'color' | null>(null)
const closing = ref(false)
const lastMode = ref<'icon' | 'color'>('icon')
const draftIcon = ref('Grid')
const draftColor = ref('#6f2dff')
const panelColor = ref('#6f2dff')
const keyword = ref('')
const error = ref('')
const colorPanel = ref<ColorPickerPanelInstance>()
const hue = computed({
  get: () => Number(colorPanel.value?.color?.get('hue') ?? 0),
  set: (value: number) => colorPanel.value?.color?.set('hue', value),
})
const iconKeys = [...Object.keys(ICON_ASSETS), ...APP_ICON_KEYS.filter((key) => !ICON_ASSETS[key])]
const filteredIcons = computed(() =>
  (keyword.value.trim() ? iconKeys : Object.keys(ICON_ASSETS)).filter((key) =>
    `${key} ${iconLabel(key)}`.toLowerCase().includes(keyword.value.toLowerCase().trim()),
  ),
)
function iconLabel(key: string) {
  return ICON_ASSETS[key] ? t(`appearance.icons.${key}`) : key
}
function open(value: 'icon' | 'color') {
  if (closing.value) return
  lastMode.value = value
  draftIcon.value = props.icon || 'Grid'
  draftColor.value = resolveAppColor(props.color)
  panelColor.value = draftColor.value
  keyword.value = ''
  error.value = ''
  mode.value = value
}
function confirm() {
  if (mode.value === 'icon') emit('update:icon', draftIcon.value)
  else {
    if (!/^#[0-9a-f]{6}$/i.test(draftColor.value)) {
      error.value = t('appearance.invalidColor')
      return
    }
    emit('update:color', draftColor.value.toLowerCase())
  }
  closePicker()
}
function closePicker() {
  closing.value = true
  mode.value = null
}
function onClosed() {
  mode.value = null
  closing.value = false
}
const active = computed(() => mode.value !== null || closing.value)
watch(active, (value) => emit('active', value), { flush: 'sync' })
onBeforeUnmount(() => emit('active', false))
watch(draftColor, (value) => {
  if (/^#[0-9a-f]{6}$/i.test(value)) panelColor.value = value
})
function onPanelColor(value: string | null) {
  if (value && /^#[0-9a-f]{6}$/i.test(value)) {
    panelColor.value = value
    draftColor.value = value
  }
}
</script>

<template>
  <div class="app-appearance">
    <div class="app-appearance__field">
      <span>{{ t('appearance.appIcon') }}</span>
      <button type="button" class="app-appearance__control" @click="open('icon')">
        <AppIcon :icon="icon || 'Grid'" :color="color" :size="24" :box-size="24" soft />
        {{ t('appearance.chooseIcon') }}
      </button>
    </div>
    <div class="app-appearance__field">
      <span>{{ t('appearance.appColor') }}</span>
      <button type="button" class="app-appearance__control" @click="open('color')">
        <span class="app-appearance__swatch" :style="{ background: resolveAppColor(color) }" />
        {{ t('appearance.chooseColor') }}
      </button>
    </div>
  </div>
  <DetailDialog
    :model-value="mode !== null"
    appearance="design"
    append-to-body
    class="app-appearance-dialog"
    :class="{ 'app-appearance-dialog--icons': lastMode === 'icon' }"
    :width="lastMode === 'icon' ? '600px' : '480px'"
    :title="t(lastMode === 'icon' ? 'appearance.chooseIcon' : 'appearance.chooseColor')"
    :error="error"
    @closed="onClosed"
    @update:model-value="onClosed"
  >
    <div v-if="lastMode === 'icon'" class="app-appearance-icons">
      <el-input
        v-model="keyword"
        :placeholder="t('appearance.searchIcons')"
        :aria-label="t('appearance.searchIcons')"
        clearable
      />
      <div class="app-appearance-icons__grid" role="group" :aria-label="t('appearance.chooseIcon')">
        <button
          v-for="key in filteredIcons"
          :key="key"
          type="button"
          :aria-label="iconLabel(key)"
          :title="iconLabel(key)"
          :aria-pressed="draftIcon === key"
          @click="draftIcon = key"
        >
          <span
            v-if="ICON_ASSETS[key]"
            class="app-appearance-icons__asset"
            :style="{ maskImage: iconMask(key) }"
          />
          <AppIcon v-else :icon="key" :size="24" :box-size="24" soft />
        </button>
      </div>
      <p v-if="!filteredIcons.length">{{ t('common.noData') }}</p>
    </div>
    <div v-else class="app-appearance-colors">
      <span>{{ t('appearance.presetColors') }}</span>
      <div
        class="app-appearance-colors__presets"
        role="group"
        :aria-label="t('appearance.presetColors')"
      >
        <button
          v-for="value in APP_COLOR_PRESETS"
          :key="value"
          type="button"
          :aria-label="value"
          :aria-pressed="draftColor.toLowerCase() === value"
          @click="draftColor = value"
        >
          <span :style="{ background: value }" />
        </button>
      </div>
      <el-color-picker-panel
        ref="colorPanel"
        :model-value="panelColor"
        color-format="hex"
        :border="false"
        @update:model-value="onPanelColor"
      />
      <input
        v-model.number="hue"
        class="app-appearance-colors__hue"
        type="range"
        min="0"
        max="360"
        :aria-label="t('appearance.color')"
      />
      <div class="app-appearance-colors__value">
        <label for="app-color-hex">HEX</label
        ><el-input id="app-color-hex" v-model="draftColor" maxlength="7" /><span
          :style="{ background: /^#[0-9a-f]{6}$/i.test(draftColor) ? draftColor : 'transparent' }"
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="closePicker">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('common.confirm') }}</el-button>
    </template>
  </DetailDialog>
</template>

<style scoped>
.app-appearance {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sw-space-24);
}
.app-appearance__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--sw-font-body);
  line-height: 22px;
  color: var(--sw-text-primary);
}
.app-appearance__control {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  height: 44px;
  padding: var(--sw-space-8);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-sm);
  background: var(--sw-surface-card);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.app-appearance__swatch {
  width: 24px;
  height: 24px;
  border-radius: var(--sw-radius-sm);
}
.app-appearance-icons {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}
.app-appearance-icons__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--sw-space-16) var(--sw-space-12);
  max-height: 188px;
  overflow-y: auto;
}
.app-appearance-icons__grid button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-sm);
  background: var(--sw-surface-card);
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.app-appearance-icons__grid button[aria-pressed='true'] {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}
.app-appearance-icons__asset {
  width: 24px;
  height: 24px;
  background: currentColor;
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
}
.app-appearance-colors {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  line-height: 22px;
}
.app-appearance-colors__presets {
  display: flex;
  gap: var(--sw-space-16);
}
.app-appearance-colors__presets button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: transparent;
  cursor: pointer;
}
.app-appearance-colors__presets button span {
  width: 28px;
  height: 28px;
  border-radius: var(--sw-radius-sm);
}
.app-appearance-colors :deep(.el-color-picker-panel) {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
  width: 100%;
  padding: 0;
}
.app-appearance-colors :deep(.el-color-picker-panel__wrapper) {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--sw-space-16);
  margin: 0;
}
.app-appearance-colors :deep(.el-color-svpanel) {
  width: 100%;
  height: 120px;
}
.app-appearance-colors :deep(.el-color-hue-slider) {
  display: none;
}
.app-appearance-colors__hue {
  appearance: none;
  width: 100%;
  height: 12px;
  padding: 0;
  margin: 0;
  border-radius: var(--sw-radius-base);
  background: linear-gradient(
    90deg,
    red 0%,
    yellow 17%,
    lime 34%,
    cyan 50%,
    blue 67%,
    magenta 84%,
    red 100%
  );
  cursor: pointer;
}
.app-appearance-colors__hue::-webkit-slider-thumb {
  appearance: none;
  width: 4px;
  height: 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: 2px;
  background: white;
}
.app-appearance-colors :deep(.el-color-picker-panel__footer) {
  display: none;
}
.app-appearance-colors__value {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  height: 32px;
}
.app-appearance-colors__value .el-input {
  width: 180px;
}
.app-appearance-colors__value > span {
  width: 32px;
  height: 32px;
  margin-left: auto;
  border-radius: var(--sw-radius-sm);
}
@media (max-width: 500px) {
  .app-appearance {
    grid-template-columns: 1fr;
  }
  .app-appearance-colors__presets {
    gap: var(--sw-space-8);
    flex-wrap: wrap;
  }
  .app-appearance-icons__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
