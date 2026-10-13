<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { parseFormFieldOptions, type FormFieldOption } from '@/contracts/form-schema'

const { t } = useI18n()
/**
 * 候选选项键值对编辑器（BF20261013-008 自 OaFieldConfig 抽取，009 供下拉/多选共用）。
 *
 * 一行两输入框：左键右值；键输入即剔除全部空白；重复键/已填值缺键给出 UX 提示；
 * 「新增」加一行、「×」删行。行状态保留空行（增量输入中间态），随 options 变化重播种。
 * 改动经 update:options 上交（宿主原样写回字段定义，面板不存第二份业务态）。
 */
interface OptionRow {
  key: string
  value: string
}

const props = defineProps<{
  options: FormFieldOption[]
}>()

const emit = defineEmits<{ 'update:options': [options: OptionRow[]] }>()

const rows = ref<OptionRow[]>([])

watch(
  () => props.options,
  (next) => {
    // 兼容历史 string[] 定义（key=value=原串）；保留空行（增量输入中间态）
    rows.value = parseFormFieldOptions(next).map((o) => ({ key: o.key, value: o.value }))
  },
  { immediate: true },
)

function emitOptions() {
  emit(
    'update:options',
    rows.value.map((r) => ({ ...r })),
  )
}

/** 键不允许任何空白字符（空格/制表符），输入即剔除；值保留原文（展示名可含空格）。 */
function onOptionKey(index: number, raw: string) {
  rows.value[index].key = raw.replace(/\s+/g, '')
  emitOptions()
}

function onOptionValue(index: number, raw: string) {
  rows.value[index].value = raw
  emitOptions()
}

function addOptionRow() {
  rows.value.push({ key: '', value: '' })
  emitOptions()
}

function removeOptionRow(index: number) {
  rows.value.splice(index, 1)
  emitOptions()
}

/** UX 提示（不拦输入）：已填值的行缺键、或键重复。真把关在后端发布/运行时过滤。 */
const optionKeyError = computed(() => {
  if (rows.value.some((r) => r.key === '' && r.value !== '')) {
    return t('form.optionKeyEmpty')
  }
  const keys = rows.value.filter((r) => r.key !== '').map((r) => r.key)
  const duplicated = keys.find((k, i) => keys.indexOf(k) !== i)
  return duplicated ? t('form.optionKeyDuplicate') : ''
})
</script>

<template>
  <div class="kv-editor">
    <div v-for="(row, i) in rows" :key="i" class="row__kv">
      <el-input
        :model-value="row.key"
        :placeholder="t('form.optionKeyPlaceholder')"
        @update:model-value="(v: string) => onOptionKey(i, v)"
      />
      <el-input
        :model-value="row.value"
        :placeholder="t('form.optionValuePlaceholder')"
        @update:model-value="(v: string) => onOptionValue(i, v)"
      />
      <button
        type="button"
        class="row__kv-del"
        :aria-label="t('form.optionRemoveRow')"
        @click="removeOptionRow(i)"
      >
        ×
      </button>
    </div>
    <el-button class="row__kv-add" size="small" @click="addOptionRow">
      {{ t('form.optionAddRow') }}
    </el-button>
    <p v-if="optionKeyError" class="row__error">{{ optionKeyError }}</p>
  </div>
</template>

<style scoped>
/* 键值对行：左键右值 + 删除；新增加行按钮 */
.row__kv {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  margin-bottom: var(--sw-space-8);
}

.row__kv :deep(.el-input) {
  flex: 1 1 0;
  min-width: 0;
}

.row__kv-del {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: #f1f4fa;
  color: #8a96ae;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.row__kv-del:hover {
  color: var(--sw-danger);
  background: #fdecec;
}

.row__kv-add {
  margin-top: 2px;
}

.row__error {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-danger);
}
</style>
