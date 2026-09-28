<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 部门选择（DEPT）控件（I2；V012-BUG-019 复开：系统弹窗选择，不再下拉）。
 * 值 = 数字型部门 ID（存 id，展示部门名）；候选经系统部门树接口加载
 * （服务端按当前租户/正常状态过滤）；存在性与越权最终由后端提交链校验。
 * 触发框为只读输入框，点击弹出部门选择对话框。
 */
import { computed, onMounted, ref } from 'vue'
import { Search, CircleClose } from '@element-plus/icons-vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import { loadDeptChoices } from '@/modules/form/api/i2-choices'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface Option {
  id: string
  label: string
}

const options = ref<Option[]>([])
const dialogVisible = ref(false)
const keyword = ref('')
const pendingId = ref<string | null>(null)

const currentValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
)

const displayLabel = computed(() => {
  if (!currentValue.value) return ''
  const hit = options.value.find((o) => o.id === currentValue.value)
  return hit ? hit.label.replace(/^[\u3000\s]+/, '') : currentValue.value
})

onMounted(async () => {
  try {
    options.value = await loadDeptChoices()
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    options.value = []
  }
})

function openDialog(): void {
  if (props.readonly) return
  pendingId.value = currentValue.value || null
  keyword.value = ''
  dialogVisible.value = true
}

const filteredOptions = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return options.value
  return options.value.filter((o) => o.label.includes(kw))
})

function toggleRow(option: Option): void {
  pendingId.value = pendingId.value === option.id ? null : option.id
}

function confirmPick(): void {
  emit('update:modelValue', pendingId.value ?? null)
  dialogVisible.value = false
}

function clearValue(): void {
  emit('update:modelValue', null)
}
</script>

<template>
  <el-input
    class="dept-picker__trigger"
    :size="subField ? 'small' : undefined"
    :model-value="displayLabel"
    :placeholder="t('component.selectDept')"
    readonly
    :disabled="readonly"
    @click="openDialog"
  >
    <template #suffix>
      <el-icon v-if="currentValue && !readonly" class="dept-picker__clear" @click.stop="clearValue"
        ><CircleClose
      /></el-icon>
      <el-icon aria-hidden="true"><Search /></el-icon>
    </template>
  </el-input>

  <el-dialog v-model="dialogVisible" :title="t('common.selectDept')" width="560px" append-to-body>
    <el-input v-model="keyword" :placeholder="t('common.pickerSearchPlaceholder')" clearable>
      <template #append>
        <el-icon aria-hidden="true"><Search /></el-icon>
      </template>
    </el-input>
    <el-table
      :data="filteredOptions"
      height="360"
      class="dept-picker__table"
      @row-click="toggleRow"
    >
      <el-table-column width="46" align="center">
        <template #default="{ row }">
          <span class="dept-picker__check" :class="{ 'is-checked': pendingId === row.id }">✓</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.pickerDeptName')">
        <template #default="{ row }">{{ row.label }}</template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmPick">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dept-picker__trigger {
  cursor: pointer;
}
.dept-picker__trigger :deep(input) {
  cursor: pointer;
}
.dept-picker__clear {
  cursor: pointer;
  color: var(--sw-text-secondary);
}
.dept-picker__check {
  visibility: hidden;
  color: var(--sw-color-primary);
  font-weight: 600;
}
.dept-picker__check.is-checked {
  visibility: visible;
}
.dept-picker__table :deep(tbody tr) {
  cursor: pointer;
}
</style>
