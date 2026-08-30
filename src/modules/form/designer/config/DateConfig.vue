<script setup lang="ts">
/**
 * 日期（DATE）配置面板。
 * 契约键：label / name / required。
 * 日期格式 v1 锁定「年-月-日（YYYY-MM-DD）」——只读展示、不让乱填，也无契约键可存。
 * 默认值无契约键 → seam（禁自造键）。
 */
import type { DateField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: DateField; otherNames: string[] }>()
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
      <label class="row__label">日期格式</label>
      <!-- v1 锁定 YYYY-MM-DD：只读展示，禁止乱填（亦无契约键承载，仅信息提示）。 -->
      <el-input :model-value="'年-月-日（YYYY-MM-DD）'" disabled class="row__control" />
      <p class="row__hint">v1 固定为年-月-日，暂不支持自定义。</p>
    </div>

    <ConfigSeamNote :items="['默认值']" />
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

.row__hint {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-placeholder);
}
</style>
