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
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'

const props = withDefaults(defineProps<{ schema: FormSchema; badge?: string }>(), { badge: '' })
const visible = defineModel<boolean>('visible', { required: true })

const hasFields = computed(() => props.schema.fields.length > 0)

function schemaForField(field: FormSchemaField): FormSchema {
  return { title: props.schema.title, fields: [field] }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :title="schema.title || '表单预览'"
    class="preview-modal"
    append-to-body
  >
    <!-- 历史版本等特殊预览的明确标识（只读语义由数据侧保证：零回写路径） -->
    <div v-if="badge" class="preview-modal__badge-bar">
      <el-tag type="warning" size="large">{{ badge }}</el-tag>
    </div>
    <div class="preview-modal__stage">
      <div v-if="hasFields" class="preview-modal__form">
        <p class="preview-modal__hint">带 <span class="preview-modal__star">*</span> 为必填项</p>
        <!-- 每个字段独立进入防腐层，外层网格统一解释 colSpan；字段顺序仍来自同一 schema。 -->
        <div class="preview-modal__grid">
          <div
            v-for="field in schema.fields"
            :key="field.name"
            class="preview-modal__field"
            :style="{ gridColumn: `span ${getFormFieldColSpan(field)}` }"
            :data-col-span="getFormFieldColSpan(field)"
          >
            <FormPreview :schema="schemaForField(field)" mode="fill" />
          </div>
        </div>
      </div>
      <p v-else class="preview-modal__empty">尚无字段，先在设计器拖入字段再预览</p>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-modal__badge-bar {
  max-width: 920px;
  margin: 0 auto;
  padding: var(--sw-space-8) var(--sw-space-24) 0;
}

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

.preview-modal__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-flow: row;
  row-gap: var(--sw-form-row-gap);
}

.preview-modal__field {
  min-width: 0;
  padding-inline: var(--sw-space-8);
  box-sizing: border-box;
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
