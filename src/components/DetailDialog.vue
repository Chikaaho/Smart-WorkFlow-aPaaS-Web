<script setup lang="ts">
/**
 * DetailDialog — 只读详情弹窗外壳。
 *
 * 统一标题、宽度、正文滚动、加载遮罩、错误提示与「关闭」footer；
 * 正文内容由宿主插槽决定（描述列表、尝试流水、JSON 等）。
 */
import { useI18n } from '@/locales'

const { t } = useI18n()

withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
    loading?: boolean
    error?: string
    destroyOnClose?: boolean
    /** 是否渲染默认「关闭」按钮；无 footer 的只读弹窗可关掉 */
    showFooter?: boolean
    /** 嵌在滚动/裁剪容器内时挂到 body，避免被父级 overflow 裁切 */
    appendToBody?: boolean
    appearance?: 'default' | 'design'
    /** 全屏外壳（0.2.0 G14 发布快照查看器）：el-dialog fullscreen，正文接管整屏 */
    fullscreen?: boolean
  }>(),
  {
    title: '',
    width: '720px',
    loading: false,
    error: '',
    destroyOnClose: true,
    showFooter: true,
    appendToBody: false,
    appearance: 'default',
    fullscreen: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  closed: []
}>()
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title || t('common.detail')"
    :width="width"
    :top="appearance === 'design' ? undefined : '6vh'"
    :align-center="appearance === 'design'"
    class="sw-detail-dialog"
    :class="{ 'sw-detail-dialog--design': appearance === 'design' }"
    :destroy-on-close="destroyOnClose"
    :append-to-body="appendToBody"
    :fullscreen="fullscreen"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="emit('closed')"
  >
    <div v-loading="loading" class="sw-detail-dialog__body">
      <el-alert
        v-if="error"
        class="sw-detail-dialog__alert"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <slot />
    </div>
    <template v-if="showFooter || $slots.footer" #footer>
      <slot name="footer">
        <el-button @click="emit('update:modelValue', false)">{{ t('common.close') }}</el-button>
      </slot>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 正文单独滚动；el-dialog 经 Teleport 渲染，需用 :global 穿透作用域。 */
:global(.sw-detail-dialog .el-dialog__body) {
  max-height: 72vh;
  overflow-y: auto;
}

.sw-detail-dialog__body {
  min-height: 80px;
}

.sw-detail-dialog__alert {
  margin-bottom: 12px;
}
.sw-detail-dialog--design .sw-detail-dialog__body {
  min-height: 0;
}
:global(.sw-detail-dialog--design.el-dialog) {
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  padding: var(--sw-space-24);
  border: 1px solid var(--sw-border-light);
}
:global(.sw-detail-dialog--design .el-dialog__header) {
  box-sizing: border-box;
  height: 32px;
  padding: 4px 32px 4px 0;
  margin: 0 0 var(--sw-space-16);
}
:global(.sw-detail-dialog--design .el-dialog__title) {
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 24px;
}
:global(.sw-detail-dialog--design .el-dialog__headerbtn) {
  top: var(--sw-space-24);
  right: var(--sw-space-24);
  width: 32px;
  height: 32px;
}
:global(.sw-detail-dialog--design .el-dialog__close) {
  color: var(--sw-text-secondary);
}
:global(.sw-detail-dialog--design .el-dialog__body) {
  padding: 0;
}
:global(.sw-detail-dialog--design .el-dialog__footer) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sw-space-8);
  height: 36px;
  padding: 0;
  margin-top: var(--sw-space-16);
}
:global(.sw-detail-dialog--design .el-dialog__footer .el-button) {
  width: 80px;
  margin: 0;
}
</style>
