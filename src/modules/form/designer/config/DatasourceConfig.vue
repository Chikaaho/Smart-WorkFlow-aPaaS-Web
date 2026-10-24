<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import type { DatasourceField, FormSchemaField } from '@/contracts/form-schema'
import {
  listExtQueryContracts,
  type ExtQueryContract,
  type ExtQueryContractField,
} from '../../api/datasource'

/**
 * DatasourceConfig — I2 DATASOURCE 字段配置面板。
 * 查询标识从当前账号可引用的契约中选择；SQL/密钥只存服务端契约注册表。
 * 绑定版本与输出字段来自契约清单，保存后由服务端发布门校验。
 */
const { t } = useI18n()

const props = defineProps<{
  field: FormSchemaField
  /** 同表单内**其它**字段的列名（重名校验用）。 */
  otherNames: string[]
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const contracts = ref<ExtQueryContract[]>([])
const contractsLoading = ref(false)
const contractsError = ref('')

const currentContract = computed(() =>
  contracts.value.find((contract) => contract.queryKey === binding().queryKey),
)

const bindingVersionMatchesLatest = computed(
  () =>
    binding().version === undefined || binding().version === currentContract.value?.queryVersion,
)

const outputFields = computed<ExtQueryContractField[]>(() =>
  bindingVersionMatchesLatest.value ? (currentContract.value?.outputFields ?? []) : [],
)

const currentContractUnavailable = computed(
  () =>
    Boolean(binding().queryKey) &&
    !currentContract.value &&
    !contractsLoading.value &&
    !contractsError.value,
)

function binding(): DatasourceField['dsBinding'] {
  return (
    (props.field as DatasourceField).dsBinding ?? { queryKey: '', valueField: '', displayField: '' }
  )
}

function contractEnabled(contract: ExtQueryContract): boolean {
  return contract.enabled === true || Number(contract.enabled) === 1
}

function contractLabel(contract: ExtQueryContract): string {
  const disabled = contractEnabled(contract) ? '' : ` · ${t('common.statusDisabled')}`
  return `${contract.queryKey} · v${contract.queryVersion}${disabled}`
}

function patchBinding(part: Partial<DatasourceField['dsBinding']>) {
  emit('update', { dsBinding: { ...binding(), ...part } })
}

async function loadContracts() {
  contractsLoading.value = true
  contractsError.value = ''
  try {
    contracts.value = await listExtQueryContracts()
  } catch (err) {
    contracts.value = []
    contractsError.value = err instanceof ApiError ? err.msg : '读取查询契约失败'
  } finally {
    contractsLoading.value = false
  }
}

function onQueryKeyChange(queryKey: string) {
  const contract = contracts.value.find((item) => item.queryKey === queryKey)
  if (!contract) {
    patchBinding({ queryKey: '', version: undefined, valueField: '', displayField: '' })
    return
  }
  if (!contractEnabled(contract)) return
  const available = new Set((contract.outputFields ?? []).map((field) => field.name))
  const current = binding()
  patchBinding({
    queryKey: contract.queryKey,
    version: contract.queryVersion,
    valueField: available.has(current.valueField) ? current.valueField : '',
    displayField: available.has(current.displayField) ? current.displayField : '',
  })
}

function onVersion(value: string) {
  const n = Number(value)
  patchBinding({ version: value !== '' && Number.isInteger(n) ? n : undefined })
}

function onValueFieldChange(value: string) {
  patchBinding({ valueField: value })
}

function onDisplayFieldChange(value: string) {
  patchBinding({ displayField: value })
}

onMounted(loadContracts)
</script>

<template>
  <CommonConfigRows
    :field-type="field.type"
    :default-value="field.defaultValue"
    @update="(p) => emit('update', p)"
  />

  <div class="row">
    <label class="row__label">{{ t('form.queryContractKeyLabel') }}</label>
    <el-select
      :model-value="binding().queryKey"
      filterable
      clearable
      :loading="contractsLoading"
      :placeholder="t('form.queryKeyPlaceholder')"
      @update:model-value="onQueryKeyChange"
    >
      <el-option
        v-for="contract in contracts"
        :key="contract.queryKey"
        :value="contract.queryKey"
        :label="contractLabel(contract)"
        :disabled="!contractEnabled(contract)"
      />
    </el-select>
    <p v-if="contractsError" class="row__hint row__hint--error">{{ contractsError }}</p>
    <p v-else-if="!contractsLoading && contracts.length === 0" class="row__hint">
      暂无已授权查询契约，请联系数据源管理员授权。
    </p>
    <p v-else-if="currentContractUnavailable" class="row__hint row__hint--error">
      当前查询标识不在可引用清单中，请重新选择。
    </p>
    <p v-else-if="currentContract && !bindingVersionMatchesLatest" class="row__hint">
      字段清单来自最新版本 v{{ currentContract.queryVersion }}；当前绑定版本为 v{{
        binding().version
      }}。
    </p>
    <p
      v-else-if="currentContract && !contractEnabled(currentContract)"
      class="row__hint row__hint--error"
    >
      该查询契约已停用，发布和运行读取将不可用。
    </p>
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.contractVersionLabel') }}</label>
    <el-input
      :model-value="binding().version === undefined ? '' : String(binding().version)"
      :disabled="Boolean(currentContract) && bindingVersionMatchesLatest"
      :placeholder="t('form.contractVersionPlaceholder')"
      @update:model-value="onVersion"
    />
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.valueFieldLabel') }}</label>
    <el-select
      v-if="outputFields.length"
      :model-value="binding().valueField"
      @update:model-value="onValueFieldChange"
    >
      <el-option
        v-for="item in outputFields"
        :key="item.name"
        :value="item.name"
        :label="`${item.name} (${item.type})`"
      />
    </el-select>
    <el-input
      v-else
      :model-value="binding().valueField"
      :placeholder="t('form.valueFieldPlaceholder')"
      @update:model-value="onValueFieldChange"
    />
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.displayFieldLabel') }}</label>
    <el-select
      v-if="outputFields.length"
      :model-value="binding().displayField"
      @update:model-value="onDisplayFieldChange"
    >
      <el-option
        v-for="item in outputFields"
        :key="item.name"
        :value="item.name"
        :label="`${item.name} (${item.type})`"
      />
    </el-select>
    <el-input
      v-else
      :model-value="binding().displayField"
      :placeholder="t('form.displayFieldPlaceholder')"
      @update:model-value="onDisplayFieldChange"
    />
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}
.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}
.row__hint {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
.row__hint--error {
  color: var(--sw-danger);
}
</style>
