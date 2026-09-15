<script setup lang="ts">
/**
 * InstanceMonitor — 流程实例监控与受控干预（I4 §3.3）。
 * 七类条件检索（定义/实例/发起人/状态/节点/办理人/时间范围）；挂起/恢复/终止/迁移
 * 办理人逐项授权（v-perm + 服务端）；干预历史可回读。无权身份接口层拒绝。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
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
    errorMsg.value = err instanceof ApiError ? err.msg : '加载监控列表失败'
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
  SUSPEND: '挂起',
  RESUME: '恢复',
  TERMINATE: '终止',
  TRANSFER: '迁移办理人',
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
    ElMessage.success(`${ACTION_LABELS[interveneAction.value]}已执行`)
    interveneVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '干预执行失败')
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
    ElMessage.error(err instanceof ApiError ? err.msg : '干预历史加载失败')
  }
}

function rowOf(r: unknown) {
  return r as MonitorInstance
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
    title="流程监控"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-input v-model="processDefKey" placeholder="流程定义 Key" clearable style="width: 150px" />
      <el-input v-model="processInstanceId" placeholder="实例 ID" clearable style="width: 150px" />
      <el-input-number
        v-model="initiatorId"
        placeholder="发起人 ID"
        :min="1"
        controls-position="right"
        style="width: 130px"
      />
      <el-select v-model="status" placeholder="状态" clearable style="width: 130px">
        <el-option label="运行中" value="RUNNING" />
        <el-option label="已通过" value="APPROVED" />
        <el-option label="已驳回" value="REJECTED" />
        <el-option label="已终止" value="TERMINATED" />
      </el-select>
      <el-input v-model="nodeKey" placeholder="当前节点" clearable style="width: 120px" />
      <el-input-number
        v-model="assignee"
        placeholder="办理人 ID"
        :min="1"
        controls-position="right"
        style="width: 130px"
      />
      <el-date-picker
        v-model="timeRange"
        type="datetimerange"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        value-format="YYYY-MM-DDTHH:mm:ss"
        style="width: 340px"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </template>

    <el-table v-loading="loading" :data="list">
      <el-table-column label="实例 ID" min-width="180">
        <template #default="{ $index }">{{ list[$index]?.instance.processInstanceId }}</template>
      </el-table-column>
      <el-table-column label="流程定义" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.instance.processDefKey }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ $index }">
          <el-tag>{{ list[$index]?.instance.status }}</el-tag>
          <el-tag v-if="list[$index]?.suspended" type="warning" size="small">已挂起</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前节点" min-width="120">
        <template #default="{ $index }">{{
          rowOf(list[$index]).activeNodeIds.join('、') || '—'
        }}</template>
      </el-table-column>
      <el-table-column label="发起时间" min-width="160">
        <template #default="{ $index }">{{ list[$index]?.instance.createTime }}</template>
      </el-table-column>
      <el-table-column label="干预" width="270" fixed="right">
        <template #default="{ $index }">
          <el-button link type="primary" @click="openIntervene(rowOf(list[$index]), 'SUSPEND')"
            >挂起</el-button
          >
          <el-button link type="primary" @click="openIntervene(rowOf(list[$index]), 'RESUME')"
            >恢复</el-button
          >
          <el-button link type="danger" @click="openIntervene(rowOf(list[$index]), 'TERMINATE')"
            >终止</el-button
          >
          <el-button link type="primary" @click="openIntervene(rowOf(list[$index]), 'TRANSFER')"
            >迁移</el-button
          >
          <el-button link @click="openHistory(rowOf(list[$index]))">历史</el-button>
        </template>
      </el-table-column>
      <template #empty>暂无可查看的实例</template>
    </el-table>

    <el-dialog
      v-model="interveneVisible"
      :title="`实例干预 - ${ACTION_LABELS[interveneAction]}`"
      width="460px"
    >
      <el-form label-width="90px">
        <el-form-item label="实例 ID">{{ interveneTarget }}</el-form-item>
        <el-form-item v-if="interveneAction === 'TRANSFER'" label="目标办理人">
          <el-input-number v-model="interveneToUser" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input
            v-model="interveneReason"
            type="textarea"
            :rows="2"
            placeholder="干预原因（记入审计）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="interveneVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitIntervene"
          >确认执行</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="historyVisible" title="干预历史" width="640px">
      <el-table :data="historyList" size="small">
        <el-table-column prop="action" label="动作" width="90" />
        <el-table-column prop="beforeState" label="前状态" width="100" />
        <el-table-column prop="afterState" label="后状态" width="100" />
        <el-table-column prop="reason" label="原因" min-width="140" />
        <el-table-column prop="intervenedAt" label="时间" min-width="160" />
        <template #empty>暂无干预记录</template>
      </el-table>
    </el-dialog>
  </StandardListTemplate>
</template>
