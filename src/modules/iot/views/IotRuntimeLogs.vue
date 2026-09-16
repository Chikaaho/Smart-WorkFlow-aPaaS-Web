<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotRuntimeLogs — IoT 运行记录（P21 A2/A7 可观测性）。
 *
 * 消息（含解析失败与重复）、命令（Broker 接收/设备回复/失败分离）、
 * 脚本执行、流程触发关联查询。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  listMessages,
  listCommands,
  listScriptExecs,
  listProcessTriggers,
  retryCommand,
  type IotMessageLog,
  type IotCommandRecord,
  type IotScriptExec,
  type IotProcessTriggerRecord,
} from '../api'

const activeTab = ref('messages')
const loading = ref(false)
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')

const messages = ref<IotMessageLog[]>([])
const commands = ref<IotCommandRecord[]>([])
const scriptExecs = ref<IotScriptExec[]>([])
const triggers = ref<IotProcessTriggerRecord[]>([])

const detailVisible = ref(false)
const detailTitle = ref(t('iot.objectDetail'))
const selectedDetail = ref<Record<string, unknown> | null>(null)
const detailJson = computed(() =>
  selectedDetail.value ? JSON.stringify(selectedDetail.value, null, 2) : '',
)

function openDetail(row: Record<string, unknown>, title: string) {
  selectedDetail.value = row
  detailTitle.value = t('iot.detailDialogTitle', { title })
  detailVisible.value = true
}

function openMessageDetail(row: IotMessageLog) {
  openDetail(row as unknown as Record<string, unknown>, t('common.message'))
}

function openCommandDetail(row: IotCommandRecord) {
  openDetail(row as unknown as Record<string, unknown>, t('iot.commandsTab'))
}

function openScriptDetail(row: IotScriptExec) {
  openDetail(row as unknown as Record<string, unknown>, t('iot.scriptExecutionsTab'))
}

function openTriggerDetail(row: IotProcessTriggerRecord) {
  openDetail(row as unknown as Record<string, unknown>, t('iot.processTriggersTab'))
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (activeTab.value === 'messages') messages.value = await listMessages()
    else if (activeTab.value === 'commands') commands.value = await listCommands()
    else if (activeTab.value === 'scripts') scriptExecs.value = await listScriptExecs()
    else triggers.value = await listProcessTriggers()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

async function handleRetry(row: IotCommandRecord) {
  const result = await retryCommand(row.id)
  ElMessage.success(t('iot.retrySuccess', { id: result.id, status: result.status }))
  await load()
}

function statusTag(status: string): 'success' | 'danger' | 'warning' | 'info' {
  if (
    status === 'PARSED' ||
    status === 'SUCCESS' ||
    status === 'BROKER_ACK' ||
    status === 'DEVICE_REPLY'
  )
    return 'success'
  if (status === 'FAILED' || status === 'TIMEOUT') return 'danger'
  if (status === 'PENDING' || status === 'DUPLICATED') return 'warning'
  return 'info'
}

const isEmpty = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    ((activeTab.value === 'messages' && messages.value.length === 0) ||
      (activeTab.value === 'commands' && commands.value.length === 0) ||
      (activeTab.value === 'scripts' && scriptExecs.value.length === 0) ||
      (activeTab.value === 'triggers' && triggers.value.length === 0)),
)

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <h3 style="margin: 0 0 12px">{{ t('iot.runtimeLogsTitle') }}</h3>
    <el-tabs v-model="activeTab" @tab-change="load">
      <el-tab-pane :label="t('common.message')" name="messages">
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

        <el-table
          v-loading="loading"
          :data="messages"
          stripe
          size="small"
          @row-click="openMessageDetail"
        >
          <el-table-column
            prop="topic"
            :label="t('common.subject')"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column prop="payloadType" :label="t('common.type')" width="110" />
          <el-table-column :label="t('iot.parsedResult')" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.parseStatus)" size="small">{{
                enumLabel('IOT_TASK_STATE', row.parseStatus)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="parseError"
            :label="t('common.error')"
            min-width="160"
            show-overflow-tooltip
          />
          <el-table-column
            prop="payload"
            :label="t('iot.payload')"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column prop="qos" label="QoS" width="55" />
          <el-table-column prop="createTime" :label="t('common.time')" min-width="150" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('iot.commandsTab')" name="commands">
        <el-table
          v-loading="loading"
          :data="commands"
          stripe
          size="small"
          @row-click="openCommandDetail"
        >
          <el-table-column prop="deviceId" :label="t('common.device')" width="70" />
          <el-table-column prop="capabilityType" :label="t('iot.capability')" width="120" />
          <el-table-column
            prop="capabilityId"
            :label="t('common.identifier')"
            min-width="120"
            show-overflow-tooltip
          />
          <el-table-column :label="t('common.status')" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{
                enumLabel('IOT_TASK_STATE', row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sourceType" :label="t('common.source')" width="90" />
          <el-table-column
            prop="error"
            :label="t('common.error')"
            min-width="150"
            show-overflow-tooltip
          />
          <el-table-column :label="t('common.actions')" width="90" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="handleRetry(row as IotCommandRecord)">{{
                t('common.retry')
              }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" :label="t('common.time')" min-width="150" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('iot.scriptExecutionsTab')" name="scripts">
        <el-table
          v-loading="loading"
          :data="scriptExecs"
          stripe
          size="small"
          @row-click="openScriptDetail"
        >
          <el-table-column prop="scriptId" :label="t('iot.script')" width="70" />
          <el-table-column prop="scriptVersion" :label="t('common.version')" width="60" />
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{
                enumLabel('IOT_TASK_STATE', row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="durationMs" :label="t('common.durationMs')" width="90" />
          <el-table-column
            prop="triggerRef"
            :label="t('iot.triggerRef')"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="outputJson"
            :label="t('iot.output')"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column
            prop="error"
            :label="t('common.error')"
            min-width="160"
            show-overflow-tooltip
          />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('iot.processTriggersTab')" name="triggers">
        <el-table
          v-loading="loading"
          :data="triggers"
          stripe
          size="small"
          @row-click="openTriggerDetail"
        >
          <el-table-column prop="ruleId" :label="t('iot.rule')" width="70" />
          <el-table-column
            prop="idempotentKey"
            :label="t('iot.idempotencyKey')"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{
                enumLabel('IOT_TASK_STATE', row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="processInstanceId"
            :label="t('common.processInstance')"
            min-width="140"
          />
          <el-table-column
            prop="formSnapshot"
            :label="t('iot.formSnapshot')"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column
            prop="error"
            :label="t('common.failureReason')"
            min-width="160"
            show-overflow-tooltip
          />
        </el-table>
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="isEmpty" :description="t('common.noRecords')" />
    <el-dialog v-model="detailVisible" :title="detailTitle" width="760px">
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
        >{{ detailJson }}</pre
      >
    </el-dialog>
  </div>
</template>
