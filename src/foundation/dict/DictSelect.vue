<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { useDict } from './index'

const props = withDefaults(
  defineProps<{
    type: string
    renderAs?: 'select' | 'radio'
    size?: 'large' | 'default' | 'small'
    disabled?: boolean
  }>(),
  {
    renderAs: 'select',
    size: 'default',
    disabled: false,
  },
)

const model = defineModel<string | undefined>()
const { items } = useDict(props.type)
</script>

<template>
  <el-select
    v-if="renderAs === 'select'"
    v-model="model"
    clearable
    :placeholder="t('common.pleaseSelect')"
    :size="size"
    :disabled="disabled"
  >
    <el-option v-for="item in items" :key="item.value" :label="item.label" :value="item.value" />
  </el-select>

  <el-radio-group v-else v-model="model" :disabled="disabled">
    <el-radio v-for="item in items" :key="item.value" :value="item.value">
      {{ item.label }}
    </el-radio>
  </el-radio-group>
</template>
