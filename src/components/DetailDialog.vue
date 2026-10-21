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
  }>(),
  {
    title: '',
    width: '720px',
    loading: false,
    error: '',
    destroyOnClose: true,
    showFooter: true,
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
    top="6vh"
    class="sw-detail-dialog"
    :destroy-on-close="destroyOnClose"
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
</style>
