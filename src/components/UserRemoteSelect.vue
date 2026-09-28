<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search, CircleClose } from '@element-plus/icons-vue'
import { searchUserOptions, type UserOption } from '@/modules/system/api/user'
import { useI18n } from '@/locales'

/**
 * UserRemoteSelect — 用户选择器（V012-BUG-019 复开：系统弹窗选择，不再下拉）。
 * 触发框为只读输入框，点击弹出人员选择对话框：关键词搜索当前租户启用用户，
 * 单选行选即确认语义由「确认」统一提交；选中值为用户 ID。
 * 单选/多选由 multiple 控制；回显：已选 ID 变化时按 ids 精确加载展示名。
 */
const props = withDefaults(
  defineProps<{
    modelValue: number | number[] | null | undefined
    multiple?: boolean
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
  }>(),
  { multiple: false, placeholder: '', disabled: false, clearable: true },
)

const emit = defineEmits<{ 'update:modelValue': [value: number | number[] | null] }>()

const { t } = useI18n()

const dialogVisible = ref(false)
const keyword = ref('')
const options = ref<UserOption[]>([])
const loading = ref(false)
/** 弹窗内暂存选择，确认后才上抛 */
const pendingIds = ref<number[]>([])

const selectedIds = computed<number[]>(() => {
  const value = props.modelValue
  if (value == null) return []
  return Array.isArray(value) ? value.map(Number) : [Number(value)]
})

const displayLabel = computed(() => {
  if (selectedIds.value.length === 0) return ''
  const labels = selectedIds.value
    .map((id) => options.value.find((o) => Number(o.id) === id))
    .filter((o): o is UserOption => !!o)
    .map(labelOf)
  // 已选但展示名未加载完成时保持空显，待 loadEcho 回填
  if (labels.length !== selectedIds.value.length) return props.multiple ? '' : (labels[0] ?? '')
  return labels.join('、')
})

async function loadOptions(kw: string): Promise<void> {
  loading.value = true
  try {
    options.value = await searchUserOptions(kw, 50)
  } finally {
    loading.value = false
  }
}

async function loadEcho(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const known = new Set(options.value.map((o) => Number(o.id)))
  const missing = ids.filter((id) => !known.has(id))
  if (missing.length === 0) return
  try {
    const hits = await searchUserOptions(undefined, 200)
    const byId = new Map(hits.map((h) => [Number(h.id), h]))
    options.value = [
      ...options.value,
      ...missing
        .map((id) => byId.get(id))
        .filter(
          (h): h is UserOption => !!h && !options.value.some((o) => Number(o.id) === Number(h.id)),
        ),
    ]
  } catch {
    // 回显失败不阻塞页面；已选值仍保留（显示为空由提交链校验兜底）
  }
}

watch(
  () => props.modelValue,
  (value) => {
    const ids = value == null ? [] : Array.isArray(value) ? value : [value]
    void loadEcho(ids.map(Number))
  },
  { immediate: true },
)

function labelOf(o: UserOption): string {
  return o.realName ? `${o.realName}（${o.username}）` : o.username
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function userRow(r: unknown): UserOption {
  return r as UserOption
}

function openDialog(): void {
  if (props.disabled) return
  pendingIds.value = [...selectedIds.value]
  keyword.value = ''
  void loadOptions('')
  dialogVisible.value = true
}

function onSearch(): void {
  void loadOptions(keyword.value.trim())
}

function isPending(o: UserOption): boolean {
  return pendingIds.value.includes(Number(o.id))
}

function toggleRow(o: UserOption): void {
  const id = Number(o.id)
  if (props.multiple) {
    pendingIds.value = isPending(o)
      ? pendingIds.value.filter((v) => v !== id)
      : [...pendingIds.value, id]
  } else {
    pendingIds.value = [id]
  }
}

function confirmPick(): void {
  if (props.multiple) {
    emit('update:modelValue', pendingIds.value.length > 0 ? [...pendingIds.value] : [])
  } else {
    emit('update:modelValue', pendingIds.value[0] ?? null)
  }
  dialogVisible.value = false
}

function clearValue(): void {
  emit('update:modelValue', props.multiple ? [] : null)
}
</script>

<template>
  <el-input
    class="user-picker__trigger"
    :model-value="displayLabel"
    :placeholder="placeholder || t('common.pickerTriggerPlaceholder')"
    readonly
    :disabled="disabled"
    @click="openDialog"
  >
    <template #suffix>
      <el-icon
        v-if="clearable && selectedIds.length > 0 && !disabled"
        class="user-picker__clear"
        @click.stop="clearValue"
        ><CircleClose
      /></el-icon>
      <el-icon aria-hidden="true"><Search /></el-icon>
    </template>
  </el-input>

  <el-dialog
    v-model="dialogVisible"
    :title="multiple ? t('common.selectUsers') : t('common.selectUser')"
    width="560px"
    append-to-body
  >
    <el-input
      v-model="keyword"
      :placeholder="t('common.pickerSearchPlaceholder')"
      clearable
      @keyup.enter="onSearch"
      @clear="onSearch"
    >
      <template #append>
        <el-button @click="onSearch">{{ t('common.query') }}</el-button>
      </template>
    </el-input>
    <el-table
      v-loading="loading"
      :data="options"
      height="360"
      class="user-picker__table"
      @row-click="toggleRow"
    >
      <el-table-column width="46" align="center">
        <template #default="{ row }">
          <span class="user-picker__check" :class="{ 'is-checked': isPending(userRow(row)) }"
            >✓</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="t('common.pickerUserName')">
        <template #default="{ row }">{{ userRow(row).realName || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.pickerUserAccount')" prop="username" />
    </el-table>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmPick">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.user-picker__trigger {
  cursor: pointer;
}
.user-picker__trigger :deep(input) {
  cursor: pointer;
}
.user-picker__clear {
  cursor: pointer;
  color: var(--sw-text-secondary);
}
.user-picker__check {
  visibility: hidden;
  color: var(--sw-color-primary);
  font-weight: 600;
}
.user-picker__check.is-checked {
  visibility: visible;
}
.user-picker__table :deep(tbody tr) {
  cursor: pointer;
}
</style>
