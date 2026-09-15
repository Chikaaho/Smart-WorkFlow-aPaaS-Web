<script setup lang="ts">
/**
 * IotRuntimeLogs — IoT 运行记录（P21 A2/A7 可观测性）。
 *
 * 消息（含解析失败与重复）、命令（Broker 接收/设备回复/失败分离）、
 * 脚本执行、流程触发关联查询。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
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

const messages = ref<IotMessageLog[]>([])
const commands = ref<IotCommandRecord[]>([])
const scriptExecs = ref<IotScriptExec[]>([])
const triggers = ref<IotProcessTriggerRecord[]>([])

const detailVisible = ref(false)
const detailTitle = ref('对象详情')
const selectedDetail = ref<Record<string, unknown> | null>(null)
const detailJson = computed(() =>
  selectedDetail.value ? JSON.stringify(selectedDetail.value, null, 2) : '',
)

function openDetail(row: Record<string, unknown>, title: string) {
  selectedDetail.value = row
  detailTitle.value = `${title}详情`
  detailVisible.value = true
}

function openMessageDetail(row: IotMessageLog) {
  openDetail(row as unknown as Record<string, unknown>, '消息')
}

function openCommandDetail(row: IotCommandRecord) {
  openDetail(row as unknown as Record<string, unknown>, '命令')
}

function openScriptDetail(row: IotScriptExec) {
  openDetail(row as unknown as Record<string, unknown>, '脚本执行')
}

function openTriggerDetail(row: IotProcessTriggerRecord) {
  openDetail(row as unknown as Record<string, unknown>, '流程触发')
}

async function load() {
  loading.value = true
  try {
    if (activeTab.value === 'messages') messages.value = await listMessages()
    else if (activeTab.value === 'commands') commands.value = await listCommands()
    else if (activeTab.value === 'scripts') scriptExecs.value = await listScriptExecs()
    else triggers.value = await listProcessTriggers()
  } finally {
    loading.value = false
  }
}

async function handleRetry(row: IotCommandRecord) {
  const result = await retryCommand(row.id)
  ElMessage.success(`已重试：新命令 ${result.id}（${result.status}）`)
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
    ((activeTab.value === 'messages' && messages.value.length === 0) ||
      (activeTab.value === 'commands' && commands.value.length === 0) ||
      (activeTab.value === 'scripts' && scriptExecs.value.length === 0) ||
      (activeTab.value === 'triggers' && triggers.value.length === 0)),
)

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <h3 style="margin: 0 0 12px">运行记录</h3>
    <el-tabs v-model="activeTab" @tab-change="load">
      <el-tab-pane label="消息" name="messages">
        <el-table
          v-loading="loading"
          :data="messages"
          stripe
          size="small"
          @row-click="openMessageDetail"
        >
          <el-table-column prop="topic" label="主题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="payloadType" label="类型" width="110" />
          <el-table-column label="解析" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.parseStatus)" size="small">{{ row.parseStatus }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="parseError" label="错误" min-width="160" show-overflow-tooltip />
          <el-table-column prop="payload" label="载荷" min-width="200" show-overflow-tooltip />
          <el-table-column prop="qos" label="QoS" width="55" />
          <el-table-column prop="createTime" label="时间" min-width="150" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="命令" name="commands">
        <el-table
          v-loading="loading"
          :data="commands"
          stripe
          size="small"
          @row-click="openCommandDetail"
        >
          <el-table-column prop="deviceId" label="设备" width="70" />
          <el-table-column prop="capabilityType" label="能力" width="120" />
          <el-table-column prop="capabilityId" label="标识" min-width="120" show-overflow-tooltip />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sourceType" label="来源" width="90" />
          <el-table-column prop="error" label="错误" min-width="150" show-overflow-tooltip />
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="handleRetry(row as IotCommandRecord)">重试</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="时间" min-width="150" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="脚本执行" name="scripts">
        <el-table
          v-loading="loading"
          :data="scriptExecs"
          stripe
          size="small"
          @row-click="openScriptDetail"
        >
          <el-table-column prop="scriptId" label="脚本" width="70" />
          <el-table-column prop="scriptVersion" label="版本" width="60" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="durationMs" label="耗时(ms)" width="90" />
          <el-table-column
            prop="triggerRef"
            label="触发引用"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column prop="outputJson" label="输出" min-width="180" show-overflow-tooltip />
          <el-table-column prop="error" label="错误" min-width="160" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="流程触发" name="triggers">
        <el-table
          v-loading="loading"
          :data="triggers"
          stripe
          size="small"
          @row-click="openTriggerDetail"
        >
          <el-table-column prop="ruleId" label="规则" width="70" />
          <el-table-column
            prop="idempotentKey"
            label="幂等键"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="processInstanceId" label="流程实例" min-width="140" />
          <el-table-column
            prop="formSnapshot"
            label="表单快照"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column prop="error" label="失败原因" min-width="160" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="isEmpty" description="暂无记录" />
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
