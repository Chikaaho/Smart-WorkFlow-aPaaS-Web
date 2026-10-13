<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 字典类型选择器（BF20261013-009 自 DictConfig 抽取，供下拉/单选/多选共用）。
 * 走 foundation/dict.listDictTypes() 单一请求层；取不到时留空不阻塞（作者可稍后重开面板重试）。
 */
import { listDictTypes, type DictTypeItem } from '@/foundation/dict'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const dictTypes = ref<DictTypeItem[]>([])

onMounted(async () => {
  try {
    dictTypes.value = await listDictTypes()
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // 请求层只抛 ApiError、不做全局提示；非阻塞：取不到则留空，作者可重开面板重试。
  }
})
</script>

<template>
  <el-select
    :model-value="props.modelValue"
    :placeholder="t('form.selectDictType')"
    clearable
    class="dict-type-select"
    @update:model-value="(v: string | undefined) => emit('update:modelValue', v ?? '')"
  >
    <el-option
      v-for="dt in dictTypes"
      :key="dt.code"
      :label="t('common.nameWithCode', { name: dt.name, code: dt.code })"
      :value="dt.code"
    />
  </el-select>
</template>

<style scoped>
.dict-type-select {
  width: 100%;
}
</style>
