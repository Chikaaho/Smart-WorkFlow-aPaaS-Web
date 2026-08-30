<script setup lang="ts">
/**
 * 数字（NUMBER）配置面板。
 * 契约键：label / name / required。
 * 最小 / 最大 / 步长·精度 / 默认值在当前契约**无落点键** → seam（禁自造键）。
 */
import type { NumberField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: NumberField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()
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

    <ConfigSeamNote :items="['最小值', '最大值', '步长 / 精度', '默认值']" />
  </div>
</template>
