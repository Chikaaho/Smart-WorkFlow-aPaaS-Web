<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import DetailDialog from '@/components/DetailDialog.vue'
import TenantSelect from './TenantSelect.vue'
import type { TenantContextOption } from '@/modules/system/types/tenant'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  selected: [value: TenantContextOption]
}>()
const { t } = useI18n()
const selected = ref<TenantContextOption | null>(null)
watch(
  () => props.modelValue,
  () => {
    selected.value = null
  },
)
function confirm() {
  if (selected.value?.writable) emit('selected', selected.value)
}
</script>

<template>
  <DetailDialog
    :model-value="modelValue"
    :title="t('tenantContext.chooseTitle')"
    width="560px"
    appearance="design"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top">
      <el-form-item :label="t('tenantContext.label')" required>
        <TenantSelect v-if="modelValue" v-model="selected" :allow-all="false" creatable />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!selected?.writable" @click="confirm">{{
        t('common.confirm')
      }}</el-button>
    </template>
  </DetailDialog>
</template>
