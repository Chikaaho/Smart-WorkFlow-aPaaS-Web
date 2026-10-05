<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 部门选择（DEPT）控件（I2；V012-BUG-019 复开：系统弹窗选择，不再下拉）。
 * 值 = 数字型部门 ID（存 id，展示部门名）；候选经系统部门树接口加载
 * （服务端按当前租户/正常状态过滤）；存在性与越权最终由后端提交链校验。
 * P63：字段 definition multiple=true 时为多选——弹窗内可复选（行点击切换勾选），
 * 确认上抛 ID 字符串数组（清空上抛 null）；缺省单选语义不变。
 * 多选回显兼容 JSON 数组串 / 已解析数组（normalizeIdList 归一，只影响渲染不改存储），
 * 显示名复用单选回显通道（候选命中取部门名，未命中保留原始 ID）。
 * 触发框为只读输入框，点击弹出部门选择对话框。
 */
import { computed, onMounted, ref } from 'vue'
import { Search, CircleClose } from '@element-plus/icons-vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import { normalizeIdList } from '../dynamic-field-registry'
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
/** 弹窗内待确认的选中 ID（单选时至多一个元素，与多选共用同一数组状态）。 */
const pendingIds = ref<string[]>([])

/** 多选语义：definition multiple=true（缺省单选，行为不变）。 */
const isMultiple = computed(() => Boolean((props.field as { multiple?: boolean }).multiple))

const currentValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
)

/** 多选当前值：归一化为 ID 串数组（JSON 数组串 / 数组 / 单值宽容兼容）。 */
const selectedIds = computed(() => (isMultiple.value ? normalizeIdList(props.modelValue) : []))

/** 是否已选（控制清除按钮显隐；单选/多选同口径）。 */
const hasValue = computed(() =>
  isMultiple.value ? selectedIds.value.length > 0 : Boolean(currentValue.value),
)

/** 单选回显通道：候选命中取部门名（剥树层级缩进），未命中保留原始 ID 不伪造。 */
function labelOf(id: string): string {
  const hit = options.value.find((o) => o.id === id)
  return hit ? hit.label.replace(/^[\u3000\s]+/, '') : id
}

const displayLabel = computed(() => {
  if (isMultiple.value) return selectedIds.value.map(labelOf).join('、')
  if (!currentValue.value) return ''
  return labelOf(currentValue.value)
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
  // 待确认选中 = 当前值（多选整组带入；单选带入单个，未选为空）
  pendingIds.value = isMultiple.value
    ? [...selectedIds.value]
    : currentValue.value
      ? [currentValue.value]
      : []
  keyword.value = ''
  dialogVisible.value = true
}

const filteredOptions = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return options.value
  return options.value.filter((o) => o.label.includes(kw))
})

function toggleRow(option: Option): void {
  if (isMultiple.value) {
    // 多选：行点击切换勾选（可复选）
    pendingIds.value = pendingIds.value.includes(option.id)
      ? pendingIds.value.filter((id) => id !== option.id)
      : [...pendingIds.value, option.id]
    return
  }
  // 单选：再次点击取消（保持原行为）
  pendingIds.value = pendingIds.value[0] === option.id ? [] : [option.id]
}

function confirmPick(): void {
  if (isMultiple.value) {
    // 空选上抛 null，与单选「未填 = null」同语义（必填校验与提交归一同口径）
    emit('update:modelValue', pendingIds.value.length ? [...pendingIds.value] : null)
  } else {
    emit('update:modelValue', pendingIds.value[0] ?? null)
  }
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
    :placeholder="t('common.selectDept')"
    readonly
    :disabled="readonly"
    @click="openDialog"
  >
    <template #suffix>
      <el-icon v-if="hasValue && !readonly" class="dept-picker__clear" @click.stop="clearValue"
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
          <span class="dept-picker__check" :class="{ 'is-checked': pendingIds.includes(row.id) }"
            >✓</span
          >
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
