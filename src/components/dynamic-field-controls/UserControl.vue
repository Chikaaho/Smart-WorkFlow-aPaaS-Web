<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 人员选择（USER）控件（I2；P63 多选）。
 * 值 = 数字型用户 ID（存 id，展示 realName/username）；候选经系统用户查询接口
 * 服务端按当前租户/启用状态过滤；存在性与越权最终由后端提交链校验。
 * P63：字段 definition multiple=true 时为多选（el-select multiple，值为 ID 字符串数组，
 * 清空上抛 null）；缺省单选语义不变。多选回显兼容 JSON 数组串 / 已解析数组
 * （normalizeIdList 归一，只影响渲染不改存储）；候选缺失的 ID 展示原始 ID。
 * readonly 语义：禁用搜索与清空。
 */
import { computed, onMounted, ref } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import { normalizeIdList } from '../dynamic-field-registry'
import { loadUserChoices } from '@/modules/form/api/i2-choices'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface Option {
  id: string
  label: string
}

const options = ref<Option[]>([])

/** 多选语义：definition multiple=true（缺省单选，行为不变）。 */
const isMultiple = computed(() => Boolean((props.field as { multiple?: boolean }).multiple))

/** 单选绑定值（缺省路径保持原语义：null/undefined → ''）。 */
const singleModelValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
)

/** 多选绑定值：归一化为 ID 串数组（JSON 数组串 / 数组 / 单值宽容兼容）。 */
const selectedIds = computed(() => (isMultiple.value ? normalizeIdList(props.modelValue) : []))

/** 只读回看：选中 ID 解析为业务名称；解析不到时不暴露内部 ID。 */
const readonlyIds = computed(() => {
  if (isMultiple.value) return selectedIds.value
  return singleModelValue.value ? [singleModelValue.value] : []
})

const resolvedLabels = computed(() =>
  readonlyIds.value
    .map((id) => options.value.find((o) => o.id === id)?.label)
    .filter((label): label is string => Boolean(label)),
)

const readonlyText = computed(() => {
  if (resolvedLabels.value.length > 0) return resolvedLabels.value.join('、')
  if (readonlyIds.value.length === 0) return ''
  return isMultiple.value
    ? t('component.selectedUserCount', { count: readonlyIds.value.length })
    : t('component.selectedUser')
})

onMounted(async () => {
  try {
    options.value = await loadUserChoices()
  } catch {
    // 只读回看不弹错误提示：无人员目录权限时按业务数量兜底。
    if (!props.readonly) ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    options.value = []
  }
  ensureSelectedLabel()
})

/** 回显：当前值不在候选（如已停用）时保留服务端语义，展示原始 ID 不伪造姓名。
 *  单选/多选同一通道（多选逐个 ID 回显）。 */
function ensureSelectedLabel() {
  const currents = isMultiple.value ? selectedIds.value : [singleModelValue.value]
  for (const current of currents) {
    if (current && !options.value.some((o) => o.id === current)) {
      options.value = [...options.value, { id: current, label: current }]
    }
  }
}

function onChange(value: unknown) {
  if (isMultiple.value) {
    const ids = Array.isArray(value) ? value.map((v) => String(v)) : []
    // 空选上抛 null，与单选「未填 = null」同语义（必填校验与提交归一同口径）
    emit('update:modelValue', ids.length ? ids : null)
    return
  }
  emit('update:modelValue', value === '' ? null : value)
}
</script>

<template>
  <!-- 只读回看：按业务名称静态展示，不再渲染成禁用下拉框 -->
  <div v-if="readonly" class="user-readonly">
    <span v-if="readonlyText">{{ readonlyText }}</span>
    <span v-else class="user-readonly__empty">{{ t('common.notSelected') }}</span>
  </div>

  <el-select
    v-else
    :size="subField ? 'small' : undefined"
    :multiple="isMultiple"
    :model-value="isMultiple ? selectedIds : singleModelValue"
    filterable
    clearable
    :placeholder="isMultiple ? t('component.selectUsers') : t('component.selectUser')"
    @change="onChange"
  >
    <el-option v-for="o in options" :key="o.id" :label="o.label" :value="o.id" />
  </el-select>
</template>

<style scoped>
.user-readonly {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
  min-height: 40px;
  color: var(--sw-text-primary);
  line-height: 22px;
  word-break: break-all;
}
.user-readonly__empty {
  color: var(--sw-text-secondary);
}
</style>
