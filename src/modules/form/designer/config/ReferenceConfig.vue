<script setup lang="ts">
/**
 * 引用（REFERENCE）配置面板。
 *
 * 契约键：label / name / required / targetFormId（目标表单 formKey，非 id）。
 * 基础项复用 CommonConfigRows；新增「引用表单」行：显示已选目标 +「选择」按钮
 * → 弹窗选择器（FormSelectorDialog）。
 *
 * 红线：targetFormId 存的是 formKey，不是 UUID id。
 * 不配显示字段（displayField）——引用字段渲染端将来走「点击查看」。
 */
import { ref } from 'vue'
import type { ReferenceField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'
import FormSelectorDialog from './FormSelectorDialog.vue'

const props = defineProps<{ field: ReferenceField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const selectorVisible = ref(false)
const selectedFormName = ref('')

function openSelector() {
  selectorVisible.value = true
}

function onFormSelected(formKey: string, formName: string) {
  selectedFormName.value = formName
  // 红线：回填 formKey（非 id）
  emit('update', { targetFormId: formKey })
}
</script>

<template>
  <div>
    <CommonConfigRows
      :label="props.field.label ?? ''"
      :name="props.field.name"
      :required="props.field.required ?? false"
      :other-names="props.otherNames"
      @update="(p) => emit('update', p)"
    />

    <!-- 引用表单选择 -->
    <div class="row">
      <label class="row__label">引用表单</label>
      <div class="row__target">
        <span v-if="props.field.targetFormId" class="row__target-info">
          {{ selectedFormName || props.field.targetFormId }}
          <code class="row__target-key">{{ props.field.targetFormId }}</code>
        </span>
        <span v-else class="row__target-empty">未选择</span>
        <el-button size="small" @click="openSelector">
          {{ props.field.targetFormId ? '更换' : '选择' }}
        </el-button>
      </div>
    </div>

    <!-- 清除选择（仅已选时展示） -->
    <div v-if="props.field.targetFormId" class="row row--clear">
      <el-button
        link
        type="danger"
        size="small"
        @click="emit('update', { targetFormId: undefined })"
      >
        清除选择
      </el-button>
    </div>

    <ConfigSeamNote :items="['显示字段', '自定义过滤条件']" />

    <FormSelectorDialog
      :visible="selectorVisible"
      :current-form-key="props.field.targetFormId"
      @update:visible="selectorVisible = $event"
      @select="onFormSelected"
    />
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}

.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.row__target {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}

.row__target-info {
  flex: 1;
  font-size: var(--sw-font-body);
  color: var(--sw-text-regular);
}

.row__target-key {
  margin-left: var(--sw-space-8);
  padding: 0 var(--sw-space-4);
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
  background: var(--sw-fill-base);
  border-radius: var(--sw-radius-sm);
}

.row__target-empty {
  flex: 1;
  font-size: var(--sw-font-body);
  color: var(--sw-text-placeholder);
}
</style>
