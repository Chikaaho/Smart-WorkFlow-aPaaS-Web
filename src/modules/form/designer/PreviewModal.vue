<script setup lang="ts">
/**
 * PreviewModal — 全屏预览（填写态真表单）。
 *
 * 取代旧的底部常驻预览块：由设计器顶栏「预览」按钮触发，全屏 el-dialog 内渲染**填写态**
 * 真表单（可交互、无设计态干扰项），退出回设计器。
 *
 * 数据同源不脱钩：schema 由设计器从同一份 items 派生传入，与画布共享单一数据源。
 * 走 form-create 防腐层：FormSchema → toFormCreateRule → <FormPreview mode="fill">。
 * 本组件落在 modules/ 内，只调 adapters 暴露的 FormPreview，绝不直引 @form-create/*。
 */
import { computed } from 'vue'
import type { FormSchema } from '@/contracts/form-schema'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'

const props = defineProps<{ schema: FormSchema }>()
const visible = defineModel<boolean>('visible', { required: true })

const hasFields = computed(() => props.schema.fields.length > 0)
</script>

<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :title="schema.title || '表单预览'"
    class="preview-modal"
    append-to-body
  >
    <div class="preview-modal__stage">
      <div v-if="hasFields" class="preview-modal__form">
        <p class="preview-modal__hint">带 <span class="preview-modal__star">*</span> 为必填项</p>
        <!-- 填写态：可交互真表单（仅 fill 入口用，子 app 隔离） -->
        <FormPreview :schema="schema" mode="fill" />
      </div>
      <p v-else class="preview-modal__empty">尚无字段，先在设计器拖入字段再预览</p>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-modal__stage {
  min-height: 60vh;
  background: var(--sw-fill-base);
  padding: var(--sw-space-24);
}

.preview-modal__form {
  max-width: 920px;
  margin: 0 auto;
  background: #fff;
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  padding: var(--sw-space-24);
}

.preview-modal__hint {
  margin: 0 0 var(--sw-space-16);
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}

.preview-modal__star {
  color: var(--sw-color-danger, #f56c6c);
}

.preview-modal__empty {
  max-width: 920px;
  margin: 0 auto;
  padding: var(--sw-space-32);
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-body);
  text-align: center;
  background: #fff;
}
</style>
