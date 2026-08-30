<script setup lang="ts">
/**
 * 多行文本（RICH_TEXT）配置面板。
 * 契约键：label / name / required。占位提示、默认值无契约键 → seam。
 */
import type { RichTextField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: RichTextField; otherNames: string[] }>()
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

    <ConfigSeamNote :items="['占位提示', '默认值']" />
  </div>
</template>
