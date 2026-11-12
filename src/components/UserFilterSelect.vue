<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { searchUserOptions } from '@/modules/system/api/user'

/**
 * UserFilterSelect — 列表筛选栏的用户远程选择（按姓名/账号搜索，值为用户 ID）。
 * UserRemoteSelect 是弹窗选择器，不适合作为内联筛选框；本组件复用同一搜索接口，
 * 并以 fixedOptions 承载「系统」等非用户固定项（如 initiatorId=0）。
 */
interface UserFilterOption {
  value: string | number
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    placeholder?: string
    fixedOptions?: UserFilterOption[]
  }>(),
  { modelValue: undefined, placeholder: '', fixedOptions: () => [] },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | number | null | undefined] }>()

const options = ref<UserFilterOption[]>([])
const loading = ref(false)

function labelOf(realName: string | null, username: string): string {
  return realName ? `${realName}（${username}）` : username
}

async function remoteSearch(keyword: string): Promise<void> {
  const current = options.value.find((option) => option.value === props.modelValue)
  loading.value = true
  try {
    const users = await searchUserOptions(keyword.trim() || undefined, 20)
    const next: UserFilterOption[] = [
      ...props.fixedOptions,
      ...users.map((user) => ({
        value: user.id,
        label: labelOf(user.realName, user.username),
      })),
    ]
    if (current && !next.some((option) => option.value === current.value)) next.unshift(current)
    options.value = next
  } catch {
    options.value = current ? [current, ...props.fixedOptions] : [...props.fixedOptions]
  } finally {
    loading.value = false
  }
}

function onSelect(value: string | number | null | undefined): void {
  emit('update:modelValue', value)
}

onMounted(() => {
  void remoteSearch('')
})
</script>

<template>
  <el-select
    :model-value="modelValue"
    filterable
    remote
    clearable
    :remote-method="remoteSearch"
    :loading="loading"
    :placeholder="placeholder"
    class="user-filter-select"
    @update:model-value="onSelect"
  >
    <el-option
      v-for="option in options"
      :key="option.value"
      :label="option.label"
      :value="option.value"
    />
  </el-select>
</template>
