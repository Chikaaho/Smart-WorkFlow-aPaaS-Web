<script setup lang="ts">
/**
 * 富文本（RICH_TEXT）配置面板。
 * BF20261013-012：身份行（标签/列名/必填/占位提示）上收 FieldConfigPanel，默认值由通用行承载。
 */
import type { RichTextField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'

const props = defineProps<{ field: RichTextField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()
</script>

<template>
  <div>
    <CommonConfigRows
      :field-type="props.field.type"
      :default-value="props.field.defaultValue"
      @update="(p) => emit('update', p)"
    />
  </div>
</template>
