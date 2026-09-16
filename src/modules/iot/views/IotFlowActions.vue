<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotFlowActions — 流程设备动作配置（P21 A6/G2a）。
 *
 * 管理员可为「已发布且允许 IoT 接入」的流程模板配置设备动作：
 * 设备来源（设计时固定 / 发起表单字段 / 流程变量）、能力、参数字段、失败策略。
 * 保存经 POST /workflow/defs/{id}/iot-device-action，重开回读恢复。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError, request } from '@/foundation/request'
import { listEligibleDevices, type IotDevice } from '../api'

interface ProcessDefRow {
  id: number
  processKey: string
  name: string
  status: string
  formKey: string | null
  iotAccessEnabled?: boolean
  iotDeviceActionJson?: string | null
}

const loading = ref(false)
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
const defs = ref<ProcessDefRow[]>([])
const devices = ref<IotDevice[]>([])

const dialogVisible = ref(false)
const editingDef = ref<ProcessDefRow | null>(null)
const form = reactive({
  enabled: true,
  deviceSource: 'FIXED',
  deviceId: undefined as number | undefined,
  deviceField: 'deviceKey',
  variableName: 'deviceKey',
  commandKey: 'iot_action',
  paramField: 'temperature',
  failurePolicy: 'BLOCK',
})

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && defs.value.length === 0,
)

interface ActionConfig {
  enabled: boolean
  deviceSource: string
  deviceId?: number
  deviceField?: string
  variableName?: string
  commandKey?: string
  paramField?: string
  failurePolicy?: string
}

function parseAction(row: ProcessDefRow): ActionConfig | null {
  if (!row.iotDeviceActionJson) return null
  try {
    return JSON.parse(row.iotDeviceActionJson) as ActionConfig
  } catch {
    return null
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const page = await request<{ records: ProcessDefRow[] }>({
      method: 'GET',
      url: '/workflow/defs',
      params: { pageNum: '1', pageSize: '50' },
    })
    defs.value = page.records
    devices.value = await listEligibleDevices()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

function deviceName(deviceId?: number): string {
  if (!deviceId) return '—'
  const d = devices.value.find((x) => x.id === deviceId)
  return d ? `${d.name} (${d.deviceKey})` : String(deviceId)
}

function sourceLabel(config: ActionConfig | null): string {
  if (!config || !config.enabled) return t('iot.notEnabled')
  const map: Record<string, string> = {
    get FIXED() {
      return t('iot.deviceSourceFixed')
    },
    get FORM_FIELD() {
      return t('iot.deviceSourceFormField')
    },
    get VARIABLE() {
      return t('common.processVariable')
    },
  }
  return map[config.deviceSource] ?? config.deviceSource
}

function openEdit(row: ProcessDefRow) {
  editingDef.value = row
  const existing = parseAction(row as ProcessDefRow)
  Object.assign(form, {
    enabled: existing?.enabled ?? true,
    deviceSource: existing?.deviceSource ?? 'FIXED',
    deviceId: existing?.deviceId,
    deviceField: existing?.deviceField ?? 'deviceKey',
    variableName: existing?.variableName ?? 'deviceKey',
    commandKey: existing?.commandKey ?? 'iot_action',
    paramField: existing?.paramField ?? 'temperature',
    failurePolicy: existing?.failurePolicy ?? 'BLOCK',
  })
  dialogVisible.value = true
}

async function save() {
  if (!editingDef.value) return
  if (form.deviceSource === 'FIXED' && !form.deviceId) {
    ElMessage.warning(t('iot.fixedSourceNeedsDevice'))
    return
  }
  const action: Record<string, unknown> = {
    enabled: form.enabled,
    deviceSource: form.deviceSource,
    commandKey: form.commandKey,
    failurePolicy: form.failurePolicy,
  }
  if (form.deviceSource === 'FIXED') action.deviceId = form.deviceId
  if (form.deviceSource === 'FORM_FIELD') action.deviceField = form.deviceField
  if (form.deviceSource === 'VARIABLE') action.variableName = form.variableName
  if (form.paramField) action.paramField = form.paramField
  const result = await request<ProcessDefRow>({
    method: 'POST',
    url: `/workflow/defs/${editingDef.value.id}/iot-device-action`,
    data: { action },
  })
  ElMessage.success(t('iot.deviceActionSaved'))
  const target = defs.value.find((d) => d.id === result.id)
  if (target) target.iotDeviceActionJson = result.iotDeviceActionJson
  dialogVisible.value = false
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.processDeviceActions') }}</h3>
      <p style="color: var(--el-text-color-secondary); font-size: 12px; margin: 4px 0 0">
        {{ t('iot.flowActionHelp') }}
      </p>
    </div>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-error"
    >
      <template #default>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="defs" stripe>
      <el-table-column
        prop="processKey"
        :label="t('iot.processTemplate')"
        min-width="170"
        show-overflow-tooltip
      />
      <el-table-column prop="name" :label="t('common.name')" min-width="140" />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">{{
            enumLabel('IOT_RELEASE_STATE', row.status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.access')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.iotAccessEnabled ? 'success' : 'info'" size="small">
            {{ row.iotAccessEnabled ? t('iot.accessEnabled') : t('iot.accessDisabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.deviceAction')" min-width="220">
        <template #default="{ row }">
          <template
            v-if="parseAction(row as ProcessDefRow) && parseAction(row as ProcessDefRow)!.enabled"
          >
            <el-tag size="small" style="margin-right: 6px">{{
              sourceLabel(parseAction(row as ProcessDefRow))
            }}</el-tag>
            <span style="font-size: 12px">
              {{
                parseAction(row as ProcessDefRow)!.deviceSource === 'FIXED'
                  ? deviceName(parseAction(row as ProcessDefRow)!.deviceId)
                  : ''
              }}
              {{ parseAction(row as ProcessDefRow)!.commandKey }}
              / {{ parseAction(row as ProcessDefRow)!.failurePolicy }}
            </span>
          </template>
          <span v-else style="color: var(--el-text-color-secondary)">{{
            t('iot.notConfigured')
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="110" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            :disabled="row.status !== 'PUBLISHED'"
            @click="openEdit(row as ProcessDefRow)"
            >{{ t('common.configure') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" :description="t('iot.noProcessTemplates')" />

    <el-dialog
      v-model="dialogVisible"
      :title="t('iot.deviceActionDialogTitle', { name: editingDef?.name ?? '' })"
      width="560px"
    >
      <el-form label-width="110px">
        <el-form-item :label="t('common.enable')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item :label="t('iot.deviceSource')" required>
          <el-radio-group v-model="form.deviceSource">
            <el-radio value="FIXED">{{ t('iot.deviceSourceFixed') }}</el-radio>
            <el-radio value="FORM_FIELD">{{ t('iot.deviceSourceFormField') }}</el-radio>
            <el-radio value="VARIABLE">{{ t('common.processVariable') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.deviceSource === 'FIXED'" :label="t('iot.targetDevice')" required>
          <el-select v-model="form.deviceId" :placeholder="t('iot.eligibleDevicesOnly')">
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name} (${d.deviceKey})`"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="form.deviceSource === 'FORM_FIELD'"
          :label="t('iot.formField')"
          required
        >
          <el-input v-model="form.deviceField" :placeholder="t('iot.deviceFieldPlaceholder')" />
        </el-form-item>
        <el-form-item
          v-if="form.deviceSource === 'VARIABLE'"
          :label="t('common.processVariable')"
          required
        >
          <el-input v-model="form.variableName" :placeholder="t('iot.variableNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('iot.capabilityKey')" required>
          <el-input v-model="form.commandKey" :placeholder="t('iot.capabilityKeyPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('iot.paramField')">
          <el-input v-model="form.paramField" :placeholder="t('iot.paramFieldPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('notify.failurePolicy')" required>
          <el-select v-model="form.failurePolicy">
            <el-option :label="t('iot.failurePolicyBlock')" value="BLOCK" />
            <el-option :label="t('iot.failurePolicyContinue')" value="CONTINUE" />
            <el-option :label="t('iot.failurePolicyManual')" value="MANUAL" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
