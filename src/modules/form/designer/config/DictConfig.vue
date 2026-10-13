<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 下拉选择（DICT）配置面板。
 * 契约键：label / name / required / dictType / renderAs / source / options / multiple。
 * BF20261013-009：数据来源可选 字典（dictType）/ 自定义（键值对 options）；
 * 下拉形态再分 下拉单选 / 下拉多选（multiple，提交值为 key/code 数组）。
 * 默认值无契约键 → seam（禁自造键）。
 */
import { computed } from 'vue'
import type { DictField, FieldOptionSource } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import DictTypeSelect from './DictTypeSelect.vue'
import OptionsKvEditor from './OptionsKvEditor.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: DictField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/** 数据来源：缺省 dict（历史定义兼容）。 */
const source = computed<FieldOptionSource>(() => props.field.source ?? 'dict')

const renderAs = computed(() => props.field.renderAs ?? 'select')

function onSource(value: string | number | boolean | undefined) {
  emit('update', { source: value === 'custom' ? 'custom' : 'dict' })
}

function onSelectMode(value: string | number | boolean | undefined) {
  emit('update', { multiple: value === 'multiple' })
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

    <div class="row">
      <label class="row__label">{{ t('form.optionSource') }}</label>
      <el-radio-group :model-value="source" @update:model-value="onSource">
        <el-radio value="dict">{{ t('form.optionSourceDict') }}</el-radio>
        <el-radio value="custom">{{ t('form.optionSourceCustom') }}</el-radio>
      </el-radio-group>
    </div>

    <div v-if="source === 'dict'" class="row">
      <label class="row__label">{{ t('form.bindDict') }}</label>
      <DictTypeSelect
        :model-value="props.field.dictType"
        @update:model-value="(v: string) => emit('update', { dictType: v })"
      />
    </div>
    <div v-else class="row">
      <label class="row__label">{{ t('form.multiselectOptions') }}</label>
      <OptionsKvEditor
        :options="props.field.options ?? []"
        @update:options="(opts) => emit('update', { options: opts })"
      />
    </div>

    <div class="row">
      <label class="row__label">{{ t('form.displayMode') }}</label>
      <el-radio-group
        :model-value="renderAs"
        @update:model-value="
          (v: string | number | boolean | undefined) =>
            emit('update', { renderAs: v === 'radio' ? 'radio' : 'select' })
        "
      >
        <el-radio value="select">{{ t('form.renderSelect') }}</el-radio>
        <el-radio value="radio">{{ t('form.renderRadio') }}</el-radio>
      </el-radio-group>
    </div>

    <div v-if="renderAs === 'select'" class="row">
      <label class="row__label">{{ t('form.selectMode') }}</label>
      <el-radio-group
        :model-value="props.field.multiple ? 'multiple' : 'single'"
        @update:model-value="onSelectMode"
      >
        <el-radio value="single">{{ t('form.selectModeSingle') }}</el-radio>
        <el-radio value="multiple">{{ t('form.selectModeMulti') }}</el-radio>
      </el-radio-group>
    </div>

    <ConfigSeamNote :items="[t('form.defaultValue')]" />
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
</style>
