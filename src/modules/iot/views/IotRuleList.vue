<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotRuleList — 事件规则管理（P21 A5）。
 *
 * 属性变化/阈值/事件/上下线规则配置（条件、防抖、冷却、连续次数）、
 * 流程模板绑定与表单字段映射（JSON）、发布/停用、触发记录回查。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  listRules,
  createRule,
  publishRule,
  disableRule,
  listRuleTriggers,
  listEligibleDevices,
  type IotEventRule,
  type IotDevice,
  type IotProcessTriggerRecord,
} from '../api'

const loading = ref(false)
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
const list = ref<IotEventRule[]>([])
const devices = ref<IotDevice[]>([])

const dialogVisible = ref(false)
const form = reactive({
  code: '',
  name: '',
  deviceId: undefined as number | undefined,
  ruleType: 'THRESHOLD',
  conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
  debounceMs: 0,
  cooldownMs: 0,
  continuousCount: 1,
  processEnabled: 1,
  processTemplateKey: '',
  formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
})

const triggerVisible = ref(false)
const triggers = ref<IotProcessTriggerRecord[]>([])
const triggerLoading = ref(false)
const triggerDetailVisible = ref(false)
const selectedTrigger = ref<IotProcessTriggerRecord | null>(null)
const triggerDetailJson = computed(() =>
  selectedTrigger.value ? JSON.stringify(selectedTrigger.value, null, 2) : '',
)

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    list.value = await listRules()
    devices.value = await listEligibleDevices()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

function deviceName(deviceId: number): string {
  const d = devices.value.find((x) => x.id === deviceId)
  return d ? d.name : String(deviceId)
}

function openCreate() {
  Object.assign(form, {
    code: '',
    name: '',
    deviceId: undefined,
    ruleType: 'THRESHOLD',
    conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
    debounceMs: 0,
    cooldownMs: 0,
    continuousCount: 1,
    processEnabled: 1,
    processTemplateKey: '',
    formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
  })
  dialogVisible.value = true
}

async function save() {
  await createRule({ ...form })
  ElMessage.success(t('iot.ruleCreatedDraft'))
  dialogVisible.value = false
  void load()
}

async function handlePublish(row: IotEventRule) {
  await publishRule(row.id)
  ElMessage.success(t('common.statusPublished'))
  void load()
}

async function handleDisable(row: IotEventRule) {
  await disableRule(row.id)
  ElMessage.success(t('common.statusDisabled'))
  void load()
}

async function openTriggers(row: IotEventRule) {
  triggerLoading.value = true
  triggerVisible.value = true
  try {
    triggers.value = await listRuleTriggers(row.id)
  } finally {
    triggerLoading.value = false
  }
}

function openTriggerDetail(row: IotProcessTriggerRecord) {
  selectedTrigger.value = row
  triggerDetailVisible.value = true
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.eventRules') }}</h3>
      <div>
        <span style="color: var(--el-text-color-secondary); font-size: 12px; margin-right: 8px">
          {{ t('iot.ruleEligibleNote') }}
        </span>
        <el-button type="primary" @click="openCreate">{{ t('common.newRule') }}</el-button>
      </div>
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

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" :label="t('common.code')" min-width="110" />
      <el-table-column prop="name" :label="t('common.name')" min-width="130" />
      <el-table-column :label="t('common.device')" min-width="120">
        <template #default="{ row }">{{ deviceName(row.deviceId) }}</template>
      </el-table-column>
      <el-table-column prop="ruleType" :label="t('common.type')" width="150" />
      <el-table-column
        prop="conditionJson"
        :label="t('common.condition')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('iot.processLinkage')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.processEnabled === 1 ? 'success' : 'info'" size="small">
            {{ row.processEnabled === 1 ? row.processTemplateKey : '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'danger' : 'info'
            "
            size="small"
            >{{ enumLabel('IOT_RELEASE_STATE', row.status) }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as IotEventRule)"
            >{{ t('common.publish') }}</el-button
          >
          <el-button
            v-if="row.status === 'PUBLISHED'"
            size="small"
            type="danger"
            @click="handleDisable(row as IotEventRule)"
            >{{ t('common.disable') }}</el-button
          >
          <el-button size="small" @click="openTriggers(row as IotEventRule)">{{
            t('iot.triggerRecords')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" :description="t('iot.noRules')" />

    <el-dialog v-model="dialogVisible" :title="t('common.newRule')" width="640px">
      <el-form label-width="100px">
        <el-form-item :label="t('common.code')" required
          ><el-input v-model="form.code"
        /></el-form-item>
        <el-form-item :label="t('common.name')" required
          ><el-input v-model="form.name"
        /></el-form-item>
        <el-form-item :label="t('common.device')" required>
          <el-select v-model="form.deviceId" :placeholder="t('iot.eligibleDevicesPlaceholder')">
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name} (${d.deviceKey})`"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('iot.ruleType')">
          <el-select v-model="form.ruleType">
            <el-option :label="t('iot.ruleTypeThreshold')" value="THRESHOLD" />
            <el-option :label="t('iot.ruleTypePropertyChanged')" value="PROPERTY_CHANGED" />
            <el-option :label="t('iot.ruleTypeEventOccur')" value="EVENT_OCCUR" />
            <el-option :label="t('iot.ruleTypeOnline')" value="ONLINE" />
            <el-option :label="t('iot.ruleTypeOffline')" value="OFFLINE" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('iot.conditionJson')" required>
          <el-input v-model="form.conditionJson" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('iot.debounceMs')"
          ><el-input-number v-model="form.debounceMs" :min="0" :step="500"
        /></el-form-item>
        <el-form-item :label="t('iot.cooldownMs')"
          ><el-input-number v-model="form.cooldownMs" :min="0" :step="1000"
        /></el-form-item>
        <el-form-item :label="t('iot.consecutiveCount')"
          ><el-input-number v-model="form.continuousCount" :min="1" :max="100"
        /></el-form-item>
        <el-form-item :label="t('iot.processLinkage')">
          <el-switch v-model="form.processEnabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item v-if="form.processEnabled === 1" :label="t('iot.processTemplate')" required>
          <el-input
            v-model="form.processTemplateKey"
            :placeholder="t('iot.processTemplateKeyPlaceholder')"
          />
        </el-form-item>
        <el-form-item v-if="form.processEnabled === 1" :label="t('iot.formMapping')">
          <el-input v-model="form.formMappingJson" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="triggerVisible" :title="t('iot.triggerRecordsTitle')" width="760px">
      <el-table
        v-loading="triggerLoading"
        :data="triggers"
        stripe
        size="small"
        @row-click="openTriggerDetail"
      >
        <el-table-column
          prop="idempotentKey"
          :label="t('iot.idempotencyKey')"
          min-width="200"
          show-overflow-tooltip
        />
        <el-table-column prop="status" :label="t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'SUCCESS'
                  ? 'success'
                  : row.status === 'FAILED'
                    ? 'danger'
                    : 'warning'
              "
              size="small"
            >
              {{ enumLabel('IOT_RELEASE_STATE', row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="processInstanceId"
          :label="t('common.processInstance')"
          min-width="140"
        />
        <el-table-column
          prop="error"
          :label="t('common.failureReason')"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column prop="triggerTime" :label="t('iot.triggeredAt')" min-width="150" />
      </el-table>
    </el-dialog>
    <el-dialog v-model="triggerDetailVisible" :title="t('iot.triggerRecordDetail')" width="680px">
      <pre
        style="
          max-height: 55vh;
          overflow: auto;
          margin: 0;
          padding: 12px;
          background: var(--el-fill-color-light);
          white-space: pre-wrap;
          word-break: break-word;
        "
        >{{ triggerDetailJson }}</pre
      >
    </el-dialog>
  </div>
</template>
