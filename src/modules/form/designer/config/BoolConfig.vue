<script setup lang="ts">
/**
 * 开关（BOOL）配置面板。
 * BF20261013-012：身份行上收 FieldConfigPanel；默认值按 BOOL 布尔下拉（契约 BaseField.defaultValue）。
 */
import type { BoolField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'

const props = defineProps<{ field: BoolField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()
</script>

<template>
  <div>
    <CommonConfigRows
      field-type="BOOL"
      :default-value="props.field.defaultValue"
      @update="(p) => emit('update', p)"
    />
  </div>
</template>
