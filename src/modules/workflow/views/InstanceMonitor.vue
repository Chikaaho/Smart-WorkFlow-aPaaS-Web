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
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
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
const initiatorId = ref<number | undefined>()
const status = ref('')
const nodeKey = ref('')
const assignee = ref<number | undefined>()
const timeRange = ref<[string, string] | null>(null)

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

function filters() {
  return {
    processDefKey: processDefKey.value || undefined,
    processInstanceId: processInstanceId.value || undefined,
    initiatorId: initiatorId.value,
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
    :title="t('workflow.monitor')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-input
        v-model="processDefKey"
        :placeholder="t('common.processDefKey')"
        clearable
        style="width: 150px"
      />
      <el-input
        v-model="processInstanceId"
        :placeholder="t('common.instanceId')"
        clearable
        style="width: 150px"
      />
      <el-input-number
        v-model="initiatorId"
        :placeholder="t('workflow.initiatorId')"
        :min="1"
        controls-position="right"
        style="width: 130px"
      />
      <el-select v-model="status" :placeholder="t('common.status')" clearable style="width: 130px">
        <el-option :label="t('common.statusRunning')" value="RUNNING" />
        <el-option :label="t('common.statusApproved')" value="APPROVED" />
        <el-option :label="t('common.statusRejected')" value="REJECTED" />
        <el-option :label="t('common.statusTerminated')" value="TERMINATED" />
      </el-select>
      <el-input
        v-model="nodeKey"
        :placeholder="t('common.currentNode')"
        clearable
        style="width: 120px"
      />
      <el-input-number
        v-model="assignee"
        :placeholder="t('workflow.assigneeId')"
        :min="1"
        controls-position="right"
        style="width: 130px"
      />
      <el-date-picker
        v-model="timeRange"
        type="datetimerange"
        :start-placeholder="t('common.startTime')"
        :end-placeholder="t('common.endTime')"
        value-format="YYYY-MM-DDTHH:mm:ss"
        style="width: 340px"
      />
      <el-button type="primary" @click="search">{{ t('common.query') }}</el-button>
      <el-button @click="resetFilters">{{ t('common.reset') }}</el-button>
    </template>

    <el-table v-loading="loading" :data="list">
      <el-table-column :label="t('common.instanceId')" min-width="180">
        <template #default="{ $index }">{{ list[$index]?.instance.processInstanceId }}</template>
      </el-table-column>
      <el-table-column :label="t('common.processDef')" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.instance.processDefKey }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ $index }">
          <el-tag>{{ list[$index]?.instance.status }}</el-tag>
          <el-tag v-if="list[$index]?.suspended" type="warning" size="small">{{
            t('common.statusSuspended')
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.currentNode')" min-width="120">
        <template #default="{ $index }">{{
          rowOf(list[$index]).activeNodeIds.join(t('common.enumSeparator')) || '—'
        }}</template>
      </el-table-column>
      <el-table-column :label="t('common.startTimeShort')" min-width="160">
        <template #default="{ $index }">{{ list[$index]?.instance.createTime }}</template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :label="t('workflow.intervene')" :width="170" />
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
        <el-table-column prop="action" :label="t('common.action')" width="90" />
        <el-table-column prop="beforeState" :label="t('workflow.stateBefore')" width="100" />
        <el-table-column prop="afterState" :label="t('workflow.stateAfter')" width="100" />
        <el-table-column prop="reason" :label="t('common.reason')" min-width="140" />
        <el-table-column prop="intervenedAt" :label="t('common.time')" min-width="160" />
        <template #empty>{{ t('workflow.noInterventionRecords') }}</template>
      </el-table>
    </el-dialog>
  </StandardListTemplate>
</template>
