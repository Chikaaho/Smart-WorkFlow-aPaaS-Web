<script setup lang="ts">
/**
 * 单行文本（TEXT）配置面板。
 * 契约键：label / name / required / length（最大长度）。
 * 占位提示、默认值无契约键 → seam（见 ConfigSeamNote）。
 */
import type { TextField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: TextField; otherNames: string[] }>()
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

    <div class="row">
      <label class="row__label">最大长度</label>
      <el-input-number
        :model-value="props.field.length"
        :min="1"
        :controls="true"
        placeholder="不限"
        class="row__control"
        @update:model-value="(v: number | undefined) => emit('update', { length: v })"
      />
    </div>

    <ConfigSeamNote :items="['占位提示', '默认值']" />
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

.row__control {
  width: 100%;
}
</style>
