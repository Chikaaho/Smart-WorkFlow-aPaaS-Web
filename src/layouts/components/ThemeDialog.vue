<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import DetailDialog from '@/components/DetailDialog.vue'
import { applyTheme, readTheme, themeColor, type ThemeName } from '@/foundation/theme'
import purpleIcon from '@/assets/theme/purple.svg'
import blueIcon from '@/assets/theme/blue.svg'
import tealIcon from '@/assets/theme/teal.svg'
import customIcon from '@/assets/theme/custom.svg'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { t } = useI18n()
const draft = reactive(readTheme())
const colorInput = ref(draft.customColor)
const error = ref('')
const options: { name: ThemeName; icon: string }[] = [
  { name: 'purple', icon: purpleIcon },
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
    error.value = ''
  },
)
const previewStyle = computed(() => ({
  '--sw-color-primary': themeColor(draft),
  '--sw-color-primary-soft':
    draft.name === 'purple' ? '#ece9ff' : `color-mix(in srgb, ${themeColor(draft)} 10%, white)`,
}))
function changeCustom() {
  if (!/^#[0-9a-f]{6}$/i.test(colorInput.value)) {
    error.value = t('appearance.invalidColor')
    return false
  }
  draft.customColor = colorInput.value.toLowerCase()
  draft.name = 'custom'
  error.value = ''
  return true
}
function save() {
  if (draft.name === 'custom' && !changeCustom()) return
  applyTheme(draft)
  emit('update:modelValue', false)
}
function reset() {
  Object.assign(draft, { name: 'purple', customColor: '#b45309' })
  colorInput.value = draft.customColor
  error.value = ''
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
          @click="draft.name = option.name"
        >
          <img :src="option.icon" alt="" width="18" height="18" />{{
            t(`appearance.${option.name}`)
          }}
        </button>
      </div>
      <div class="theme-dialog__custom">
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
