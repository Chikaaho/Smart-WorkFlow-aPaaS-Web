<script setup lang="ts">
/**
 * 通用配置行：标签 + 列名（带 UX 校验）+ 必填。
 *
 * 6 类简单字段面板共用这一块，避免每类重写。改动经 @update 抛 FieldPatch 上交，
 * 由设计器宿主就地写回选中字段（单一数据源，面板不存第二份）。
 *
 * 列名校验复用 column-name.ts（合法字符 + 同表单内不重名），**前端只做 UX 提示，
 * 真把关在后端发布**。BOOL 等无「必填」语义的类型传 :show-required="false" 隐藏该行。
 */
import { computed } from 'vue'
import { isValidColumnName, isColumnNameUnique } from '../column-name'
import type { FieldPatch } from '../field-config'

const props = withDefaults(
  defineProps<{
    label: string
    name: string
    required: boolean
    /** 同表单内**其它**字段的列名（不含本字段自身），用于重名校验。 */
    otherNames: string[]
    showRequired?: boolean
  }>(),
  { showRequired: true },
)

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/** 列名 UX 校验信息（仅提示，不拦死操作；后端发布才是真校验）。 */
const nameError = computed(() => {
  if (!isValidColumnName(props.name)) {
    return '列名须以小写字母或下划线开头，仅含小写字母 / 数字 / 下划线'
  }
  if (!isColumnNameUnique(props.name, props.otherNames)) {
    return '列名在本表单内重复'
  }
  return ''
})
</script>

<template>
  <div class="row">
    <label class="row__label">标签</label>
    <el-input
      :model-value="label"
      placeholder="字段显示名"
      @update:model-value="(v: string) => emit('update', { label: v })"
    />
  </div>

  <div class="row">
    <label class="row__label">列名</label>
    <el-input
      :model-value="name"
      placeholder="英文列名"
      @update:model-value="(v: string) => emit('update', { name: v })"
    />
    <p v-if="nameError" class="row__error">{{ nameError }}</p>
  </div>

  <div v-if="showRequired" class="row row--inline">
    <label class="row__label">必填</label>
    <el-switch
      :model-value="required"
      @update:model-value="
        (v: string | number | boolean) => emit('update', { required: Boolean(v) })
      "
    />
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}

.row--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.row--inline .row__label {
  margin-bottom: 0;
}

.row__error {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-danger);
}
</style>
