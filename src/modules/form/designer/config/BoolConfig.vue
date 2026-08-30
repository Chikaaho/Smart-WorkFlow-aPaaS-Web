<script setup lang="ts">
/**
 * 开关（BOOL）配置面板。
 * 契约键：label / name（按规格不含「必填」，故隐藏 required 行）。
 * 默认开/关无契约键 → seam（禁自造键）。
 */
import type { BoolField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: BoolField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()
</script>

<template>
  <div>
    <CommonConfigRows
      :label="props.field.label ?? ''"
      :name="props.field.name"
      :required="props.field.required ?? false"
      :other-names="props.otherNames"
      :show-required="false"
      @update="(p) => emit('update', p)"
    />

    <ConfigSeamNote :items="['默认开 / 关']" />
  </div>
</template>
