<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { tenantContextOptions } from '@/modules/system/api/tenant-context'
import type { TenantContextOption } from '@/modules/system/types/tenant'

const props = withDefaults(
  defineProps<{
    modelValue: TenantContextOption | null
    allowAll?: boolean
    creatable?: boolean
  }>(),
  { allowAll: true, creatable: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: TenantContextOption | null] }>()
const { t } = useI18n()
const options = ref<TenantContextOption[]>([])
const loading = ref(false)
const error = ref('')
let generation = 0

async function search(keyword = '') {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await tenantContextOptions(keyword, props.creatable)
    if (current !== generation) return
    const selected = props.modelValue
    options.value =
      selected && !result.some((item) => item.id === selected.id) ? [selected, ...result] : result
  } catch (err) {
    if (current === generation) {
      options.value = props.modelValue ? [props.modelValue] : []
      error.value = err instanceof ApiError ? err.msg : t('tenantContext.loadFailed')
    }
  } finally {
    if (current === generation) loading.value = false
  }
}

function select(id: string) {
  emit('update:modelValue', options.value.find((item) => item.id === id) ?? null)
}
watch(
  () => props.creatable,
  () => {
    void search()
  },
)
onMounted(() => {
  void search()
})
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <div class="tenant-select">
    <el-select
      :model-value="modelValue?.id ?? ''"
      :aria-label="t('tenantContext.label')"
      :placeholder="allowAll ? t('tenantContext.all') : t('tenantContext.choose')"
      :clearable="allowAll"
      filterable
      remote
      :remote-method="search"
      :loading="loading"
      popper-class="tenant-select-popper"
      @update:model-value="select"
    >
      <el-option v-if="allowAll" value="" :label="t('tenantContext.all')" />
      <el-option
        v-for="option in options"
        :key="option.id"
        :value="option.id"
        :label="`${option.name} (${option.code})`"
        :disabled="creatable && !option.writable"
      />
    </el-select>
    <span v-if="error" class="tenant-select__error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.tenant-select,
.tenant-select :deep(.el-select) {
  width: 100%;
}
.tenant-select__error {
  display: block;
  margin-top: var(--sw-space-4);
  color: var(--sw-danger);
  font-size: var(--sw-font-caption);
}
</style>

<style>
/* Q41（460:14918）：仅超管用户页租户选择器的候选行 34→32；wrapper 32、候选来源与过滤不变。
   弹层 teleport 到 body，用本组件专属 popper-class 限定作用域，不改全局 select。 */
.tenant-select-popper .el-select-dropdown__item {
  box-sizing: border-box;
  height: 32px;
  line-height: 32px;
}
</style>
