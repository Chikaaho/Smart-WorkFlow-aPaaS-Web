<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * InstanceMonitor — 流程实例监控与受控干预（I4 §3.3）。
 * 七类条件检索（定义/实例/发起人/状态/节点/办理人/时间范围）；挂起/恢复/终止/迁移
 * 办理人逐项授权（v-perm + 服务端）；干预历史可回读。无权身份接口层拒绝。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ListFilterItem, ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import UserFilterSelect from '@/components/UserFilterSelect.vue'
import { enumLabel } from '@/foundation/i18n/enum-label'
import {
  pageMonitorInstances,
  interveneInstance,
  queryInterventions,
  type MonitorInstance,
  type InterventionRecord,
} from '@/modules/workflow/api/i4'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const list = ref<MonitorInstance[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// 七类条件
const processDefKey = ref('')
const processInstanceId = ref('')
// 用户 ID 以字符串承载（64 位 ID 不过 Number）；系统发起人固定为 0
const initiatorId = ref<string | number | undefined>()
const status = ref('')
const nodeKey = ref('')
const assignee = ref<number | undefined>()
const timeRange = ref<[string, string] | null>(null)

const initiatorFixedOptions = computed(() => [
  { value: 0, label: t('workflow.initiatorSystemIot') },
])

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

function filters() {
  return {
    processDefKey: processDefKey.value || undefined,
    processInstanceId: processInstanceId.value || undefined,
    initiatorId: initiatorId.value === '' ? undefined : (initiatorId.value ?? undefined),
    status: status.value || undefined,
    nodeKey: nodeKey.value || undefined,
    assignee: assignee.value,
    timeFrom: timeRange.value?.[0],
    timeTo: timeRange.value?.[1],
  }
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageMonitorInstances(pageQuery, filters())
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.monitorLoadFailed')
  } finally {
    loading.value = false
  }
}

/** 展示层时间：yyyy-MM-dd HH:mm:ss，不带 T 与微秒（列表与干预历史统一）。 */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const text = String(value)
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return text.replace('T', ' ').slice(0, 19)
  const pad = (part: number) => String(part).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** P70/B5：当前节点优先展示名称（服务端按部署模型解析），名称取不到回退节点编码。 */
function displayActiveNodes(row: MonitorInstance | undefined): string {
  if (!row) return ''
  const names = row.activeNodeNames ?? {}
  return (row.activeNodeIds ?? []).map((id) => names[id] ?? id).join(t('common.enumSeparator'))
}

function search() {
  pageNum.value = 1
  void loadList()
}

function resetFilters() {
  processDefKey.value = ''
  processInstanceId.value = ''
  initiatorId.value = undefined
  status.value = ''
  nodeKey.value = ''
  assignee.value = undefined
  timeRange.value = null
  pageNum.value = 1
  void loadList()
}

// ─── 干预 ───
const interveneVisible = ref(false)
const interveneAction = ref<'SUSPEND' | 'RESUME' | 'TERMINATE' | 'TRANSFER'>('SUSPEND')
const interveneTarget = ref('')
const interveneReason = ref('')
const interveneToUser = ref<number | undefined>()
const submitting = ref(false)

const ACTION_LABELS: Record<string, string> = {
  get SUSPEND() {
    return t('workflow.suspend')
  },
  get RESUME() {
    return t('common.resume')
  },
  get TERMINATE() {
    return t('workflow.terminate')
  },
  get TRANSFER() {
    return t('workflow.transferAssignee')
  },
}

function openIntervene(row: MonitorInstance, action: typeof interveneAction.value) {
  interveneTarget.value = row.instance.processInstanceId
  interveneAction.value = action
  interveneReason.value = ''
  interveneToUser.value = undefined
  interveneVisible.value = true
}

async function submitIntervene() {
  submitting.value = true
  try {
    await interveneInstance(
      interveneTarget.value,
      interveneAction.value,
      interveneReason.value || undefined,
      interveneToUser.value,
    )
    ElMessage.success(
      t('workflow.interventionExecuted', { action: ACTION_LABELS[interveneAction.value] }),
    )
    interveneVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.interveneFailed'))
  } finally {
    submitting.value = false
  }
}

// ─── 干预历史 ───
const historyVisible = ref(false)
const historyList = ref<InterventionRecord[]>([])

async function openHistory(row: MonitorInstance) {
  try {
    historyList.value = await queryInterventions(row.instance.processInstanceId)
    historyVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.interveneHistoryLoadFailed'))
  }
}

function rowOf(r: unknown) {
  return r as MonitorInstance
}

/**
 * 操作列（V012-BUG-002）：挂起/恢复直显，终止/迁移/历史收进「更多」，
 * 全部干预动作显隐与授权保持原有口径（服务端逐项鉴权）。
 */
function rowActions(row: unknown): ListAction[] {
  const item = rowOf(row)
  return [
    {
      key: 'suspend',
      label: t('workflow.suspend'),
      type: 'primary',
      onClick: () => openIntervene(item, 'SUSPEND'),
    },
    {
      key: 'resume',
      label: t('common.resume'),
      type: 'primary',
      onClick: () => openIntervene(item, 'RESUME'),
    },
    {
      key: 'terminate',
      label: t('workflow.terminate'),
      type: 'danger',
      onClick: () => openIntervene(item, 'TERMINATE'),
    },
    {
      key: 'transfer',
      label: t('workflow.transferAction'),
      type: 'primary',
      onClick: () => openIntervene(item, 'TRANSFER'),
    },
    {
      key: 'history',
      label: t('common.history'),
      onClick: () => void openHistory(item),
    },
  ]
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <ListFilterItem :label="t('common.processDef')">
        <el-input v-model="processDefKey" :placeholder="t('common.pleaseInput')" clearable />
      </ListFilterItem>
      <ListFilterItem :label="t('common.instanceId')">
        <el-input v-model="processInstanceId" :placeholder="t('common.pleaseInput')" clearable />
      </ListFilterItem>
      <ListFilterItem :label="t('common.initiator')">
        <UserFilterSelect
          v-model="initiatorId"
          :fixed-options="initiatorFixedOptions"
          :placeholder="t('common.all')"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.status')">
        <el-select v-model="status" :placeholder="t('common.all')" clearable>
          <el-option :label="t('common.statusRunning')" value="RUNNING" />
          <el-option :label="t('common.statusApproved')" value="APPROVED" />
          <el-option :label="t('common.statusRejected')" value="REJECTED" />
          <el-option :label="t('common.statusTerminated')" value="TERMINATED" />
        </el-select>
      </ListFilterItem>
      <ListFilterItem :label="t('common.currentNode')">
        <el-input v-model="nodeKey" :placeholder="t('common.pleaseInput')" clearable />
      </ListFilterItem>
      <ListFilterItem :label="t('workflow.assigneeId')">
        <el-input-number
          v-model="assignee"
          :placeholder="t('common.pleaseInput')"
          :min="1"
          controls-position="right"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.startTimeShort')">
        <el-date-picker
          v-model="timeRange"
          type="datetimerange"
          :start-placeholder="t('common.startTime')"
          :end-placeholder="t('common.endTime')"
          value-format="YYYY-MM-DDTHH:mm:ss"
        />
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="search">{{ t('common.query') }}</el-button>
      <el-button @click="resetFilters">{{ t('common.reset') }}</el-button>
    </template>

    <el-table v-loading="loading" :data="list">
      <el-table-column :label="t('common.instanceId')" min-width="180">
        <template #default="{ $index }">{{ list[$index]?.instance.processInstanceId }}</template>
      </el-table-column>
      <el-table-column :label="t('common.processDef')" min-width="140">
        <template #default="{ $index }">{{
          list[$index]?.instance.processDefName ?? list[$index]?.instance.processDefKey
        }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ $index }">
          <el-tag>{{ enumLabel('WORKFLOW_INSTANCE', list[$index]?.instance.status) }}</el-tag>
          <el-tag v-if="list[$index]?.suspended" type="warning" size="small">{{
            t('common.statusSuspended')
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.currentNode')" min-width="120">
        <template #default="{ $index }">{{ displayActiveNodes(list[$index]) || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.startTimeShort')" min-width="160">
        <template #default="{ $index }">{{
          formatDateTime(list[$index]?.instance.createTime)
        }}</template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :label="t('workflow.intervene')" :width="160" />
      <template #empty>{{ t('workflow.noInstances') }}</template>
    </el-table>

    <el-dialog
      v-model="interveneVisible"
      :title="t('workflow.interventionDialogTitle', { action: ACTION_LABELS[interveneAction] })"
      width="460px"
    >
      <el-form label-width="90px">
        <el-form-item :label="t('common.instanceId')">{{ interveneTarget }}</el-form-item>
        <el-form-item v-if="interveneAction === 'TRANSFER'" :label="t('workflow.targetAssignee')">
          <el-input-number v-model="interveneToUser" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('common.reason')">
          <el-input
            v-model="interveneReason"
            type="textarea"
            :rows="2"
            :placeholder="t('workflow.interveneReasonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="interveneVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitIntervene">{{
          t('common.confirmExecute')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyVisible" :title="t('workflow.interveneHistory')" width="640px">
      <el-table :data="historyList" size="small">
        <!-- X4：动作显示中文（挂起/恢复/终止/转办），未知动作回退原值 -->
        <el-table-column :label="t('common.action')" width="90">
          <template #default="{ $index }">{{
            ACTION_LABELS[historyList[$index]?.action ?? ''] || historyList[$index]?.action
          }}</template>
        </el-table-column>
        <el-table-column :label="t('workflow.stateBefore')" width="100">
          <template #default="{ $index }">{{
            enumLabel('WORKFLOW_INSTANCE', historyList[$index]?.beforeState)
          }}</template>
        </el-table-column>
        <el-table-column :label="t('workflow.stateAfter')" width="100">
          <template #default="{ $index }">{{
            enumLabel('WORKFLOW_INSTANCE', historyList[$index]?.afterState)
          }}</template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('common.reason')" min-width="140" />
        <el-table-column :label="t('common.time')" min-width="160">
          <template #default="{ $index }">{{
            formatDateTime(historyList[$index]?.intervenedAt)
          }}</template>
        </el-table-column>
        <template #empty>{{ t('workflow.noInterventionRecords') }}</template>
      </el-table>
    </el-dialog>
  </StandardListTemplate>
</template>
