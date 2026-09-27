<script setup lang="ts">
import { ref, watch } from 'vue'
import { searchUserOptions, type UserOption } from '@/modules/system/api/user'

/**
 * UserRemoteSelect — 用户选择器（V012-BUG-019）。
 * 远程搜索当前租户启用用户（id/username/realName 最小字段），选中值为用户 ID。
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

const options = ref<UserOption[]>([])
const loading = ref(false)

async function loadOptions(keyword: string): Promise<void> {
  loading.value = true
  try {
    options.value = await searchUserOptions(keyword, 50)
  } finally {
    loading.value = false
  }
}

async function loadEcho(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  loading.value = true
  try {
    const known = new Set(options.value.map((o) => o.id))
    const missing = ids.filter((id) => !known.has(id))
    if (missing.length > 0) {
      const hits = await searchUserOptions(undefined, 200)
      const byId = new Map(hits.map((h) => [Number(h.id), h]))
      options.value = [
        ...options.value,
        ...missing
          .map((id) => byId.get(id))
          .filter((h): h is UserOption => !!h && !options.value.some((o) => o.id === h.id)),
      ]
    }
  } finally {
    loading.value = false
  }
}

function onRemote(query: string): void {
  void loadOptions(query)
}

function onChange(value: number | number[] | null): void {
  // 后端 JacksonLongToStringConfig 会把 Long id 序列化为字符串；统一数值化后再上抛
  const normalized = Array.isArray(value)
    ? value.map((item) => Number(item))
    : value == null
      ? null
      : Number(value)
  emit('update:modelValue', normalized)
}

watch(
  () => props.modelValue,
  (value) => {
    const ids = value == null ? [] : Array.isArray(value) ? value : [value]
    void loadEcho(ids)
  },
  { immediate: true },
)

function labelOf(o: UserOption): string {
  return o.realName ? `${o.realName}（${o.username}）` : o.username
}
</script>

<template>
  <el-select
    :model-value="modelValue ?? undefined"
    :multiple="multiple"
    filterable
    remote
    :remote-method="onRemote"
    :loading="loading"
    :placeholder="placeholder"
    :disabled="disabled"
    :clearable="clearable"
    @change="onChange"
    @visible-change="(v: boolean) => v && options.length === 0 && onRemote('')"
  >
    <el-option v-for="o in options" :key="o.id" :label="labelOf(o)" :value="o.id" />
  </el-select>
</template>
