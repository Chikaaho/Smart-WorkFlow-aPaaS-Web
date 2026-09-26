<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ProcessInstanceList — 流程实例监控页（页型 B + el-drawer 详情抽屉）。
 *
 * 列表页：分页展示流程实例，支持按状态/流程定义/发起人过滤。
 * 详情抽屉：实例基本信息 + BPMN 流程图高亮（活跃节点/已完成节点）+ 流转时间线。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  queryInstances,
  getInstanceDetail,
  getProcessDefDefinitionByKey,
} from '@/modules/workflow/api'
import type { ProcessInstance, InstanceDetail } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import ProcessGraphView from './ProcessGraphView.vue'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import type { InstanceFilter } from '@/modules/workflow/api'

// ─── 状态映射 ───

const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'danger' | 'info' }
> = {
  RUNNING: {
    get label() {
      return t('common.statusRunning')
    },
    type: 'success',
  },
  APPROVED: {
    get label() {
      return t('common.statusCompleted')
    },
    type: 'info',
  },
  REJECTED: {
    get label() {
      return t('common.statusRejected')
    },
    type: 'danger',
  },
  WITHDRAWN: {
    get label() {
      return t('common.statusWithdrawn')
    },
    type: 'warning',
  },
  DISCARDED: {
    get label() {
      return t('workflow.statusDiscarded')
    },
    type: 'info',
  },
  FAILED: {
    get label() {
      return t('common.resultFailed')
    },
    type: 'danger',
  },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  return STATUS_MAP[status]?.type ?? 'info'
}

// ─── 列表状态 ───

const list = ref<ProcessInstance[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const filterStatus = ref<string>('') // '' = 全部

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const filter: InstanceFilter = {}
    if (filterStatus.value) {
      filter.status = filterStatus.value
    }
    const result = await queryInstances(page, filter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.instanceListLoadFailed')
    }
  } finally {
    loading.value = false
  }
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

function handleFilterChange() {
  pageNum.value = 1
  void loadList()
}

// ─── 详情抽屉 ───

const drawerVisible = ref(false)
const drawerLoading = ref(false)
const drawerError = ref('')
const detail = ref<InstanceDetail | null>(null)

/** 详情视图消费的图 + 轨迹（自研渲染内核） */
const detailGraph = ref<ProcessGraphDocument | null>(null)
const detailTrace = ref<{ activeNodeIds: string[]; completedNodeIds: string[] } | null>(null)

function toDetailGraph(
  definition: Awaited<ReturnType<typeof getProcessDefDefinitionByKey>>,
): ProcessGraphDocument {
  return {
    processKey: definition.processKey,
    name: definition.name ?? '',
    formKey: definition.formKey ?? '',
    version: definition.version,
    contractVersion: (definition as { contractVersion?: number }).contractVersion,
    elements: (definition.elements ??
      []) as import('@/contracts/process-graph').ProcessGraphElement[],
    canvas: definition.canvas ?? {},
  }
}

/** 打开详情抽屉（图数据直接取已保存 ProcessGraph，状态高亮来自真实轨迹） */
async function openDrawer(row: ProcessInstance) {
  drawerVisible.value = true
  drawerLoading.value = true
  drawerError.value = ''
  detail.value = null
  detailGraph.value = null
  detailTrace.value = null

  try {
    detail.value = await getInstanceDetail(row.processInstanceId)

    // 流程定义 key → 定义图（无需 defId：后端 /workflow/defs/{id} 与实例绑定按 key 匹配）
    const processDefKey = row.processDefKey
    let definition: Awaited<ReturnType<typeof getProcessDefDefinitionByKey>> | null = null
    try {
      definition = await getProcessDefDefinitionByKey(processDefKey)
    } catch {
      drawerError.value = t('workflow.processDefNotFoundForDiagram')
      return
    }
    detailGraph.value = toDetailGraph(definition)

    // 状态高亮：活跃节点 + 已完成节点（真实任务/轨迹）
    const completedNodeIds = detail.value.flowTrace
      .filter((node) => node.endTime != null)
      .map((node) => node.activityId)
    detailTrace.value = {
      activeNodeIds: detail.value.activeNodeIds ?? [],
      completedNodeIds,
    }
  } catch (err) {
    if (err instanceof ApiError) {
      drawerError.value = err.msg
    } else {
      drawerError.value = (err as Error)?.message || t('workflow.processInstanceDetailLoadFailed')
    }
  } finally {
    drawerLoading.value = false
  }
}

/** 关闭抽屉 */
function closeDrawer() {
  drawerVisible.value = false
  drawerError.value = ''
  drawerLoading.value = false
  detail.value = null
  detailGraph.value = null
  detailTrace.value = null
}

const pcRoute = useRoute()
const pcRouter2 = useRouter()
// I6 G4a：收件箱深链（focus=processInstanceId）自动打开对应实例详情抽屉
const focusInstanceId = computed(() => {
  const v = pcRoute?.query?.focus
  return typeof v === 'string' && v ? v : null
})

onMounted(() => {
  void loadList()
})

// I6 G4a：收件箱深链（focus=processInstanceId）自动打开对应实例详情抽屉
void (async () => {
  if (!focusInstanceId.value) return
  try {
    await openDrawer({ processInstanceId: focusInstanceId.value } as Parameters<
      typeof openDrawer
    >[0])
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    /* 无权或不存在：抽屉内错误提示兜底 */
  } finally {
    void pcRouter2.replace({ query: { ...pcRoute.query, focus: undefined } })
  }
})()

// ─── 时间线过滤：只展示 userTask 类型的条目（排除 startEvent/endEvent/sequenceFlow） ───

function isUserTask(activityType: string): boolean {
  return activityType === 'userTask'
}

// 操作列（V012-BUG-002）：单按钮「查看详情」，打开实例详情抽屉
function rowActions(row: unknown): ListAction[] {
  const item = row as ProcessInstance
  return [
    {
      key: 'detail',
      label: t('common.viewDetails'),
      onClick: () => void openDrawer(item),
    },
  ]
}
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
    <!-- 空态操作 -->
    <template #empty-action>
      <span />
    </template>

    <!-- 筛选区：状态过滤 -->
    <template #filter>
      <el-select
        v-model="filterStatus"
        :placeholder="t('common.allStatuses')"
        clearable
        style="width: 180px"
        @change="handleFilterChange"
      >
        <el-option :label="t('common.statusRunning')" value="RUNNING" />
        <el-option :label="t('common.statusCompleted')" value="APPROVED" />
        <el-option :label="t('common.statusRejected')" value="REJECTED" />
        <el-option :label="t('common.statusWithdrawn')" value="WITHDRAWN" />
        <el-option :label="t('workflow.statusDiscarded')" value="DISCARDED" />
        <el-option :label="t('common.resultFailed')" value="FAILED" />
      </el-select>
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 表格 -->
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="processName" :label="t('common.processName')" min-width="160">
        <template #default="{ row }">
          {{ (row as ProcessInstance).processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="160" />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType((row as ProcessInstance).status)" size="small">
            {{ getStatusLabel((row as ProcessInstance).status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.initiator')" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">
          {{ (row as ProcessInstance).initiatorName ?? (row as ProcessInstance).initiatorId }}
        </template>
      </el-table-column>
      <el-table-column
        prop="createTime"
        :label="t('common.startTimeShort')"
        min-width="180"
        show-overflow-tooltip
      />
      <ListActionsColumn :actions="rowActions" :width="90" />
    </el-table>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="t('workflow.instanceDetailTitle')"
      :close-on-click-modal="false"
      destroy-on-close
      size="900px"
      @closed="closeDrawer"
    >
      <div v-loading="drawerLoading" class="drawer-content">
        <!-- 错误提示 -->
        <el-alert
          v-if="drawerError"
          :title="drawerError"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <template v-if="detail">
          <!-- 基本信息 -->
          <el-card class="detail-section">
            <template #header
              ><span>{{ t('common.basicInfo') }}</span></template
            >
            <el-descriptions :column="2" border>
              <el-descriptions-item :label="t('common.processName')">{{
                detail.processName ?? '-'
              }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.instanceId')">{{
                detail.processInstanceId
              }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.businessNo')">{{
                detail.businessKey
              }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.formKey')">{{
                detail.formKey
              }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.initiator')">{{
                detail.initiatorName ?? detail.initiatorId
              }}</el-descriptions-item>
              <el-descriptions-item :label="t('common.status')">
                <el-tag :type="getStatusType(detail.status)" size="small">
                  {{ getStatusLabel(detail.status) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item :label="t('common.startTimeShort')">{{
                detail.createTime
              }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 流程图高亮 -->
          <el-card class="detail-section">
            <template #header>
              <span>{{ t('workflow.processDiagram') }}</span>
              <span style="margin-left: 12px; font-size: 12px; font-weight: normal; color: #909399">
                <span class="legend-dot legend-active" /> {{ t('workflow.activeNode') }}
                <span class="legend-dot legend-completed" style="margin-left: 12px" />
                {{ t('workflow.completedNode') }}
              </span>
            </template>
            <ProcessGraphView
              v-if="!drawerError"
              :graph="detailGraph"
              :trace="detailTrace"
              :height="400"
            />
          </el-card>

          <!-- 流转时间线 -->
          <el-card class="detail-section">
            <template #header
              ><span>{{ t('common.flowHistory') }}</span></template
            >
            <el-alert
              v-if="detail.flowTrace.filter((n) => isUserTask(n.activityType)).length === 0"
              :title="t('workflow.noApprovalRecords')"
              type="info"
              :closable="false"
              show-icon
            />
            <el-table
              v-else
              :data="detail.flowTrace.filter((n) => isUserTask(n.activityType))"
              stripe
            >
              <el-table-column
                prop="activityName"
                :label="t('workflow.approvalNode')"
                min-width="140"
              />
              <el-table-column
                :label="t('workflow.approver')"
                min-width="120"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  {{ row.assigneeName ?? row.assignee ?? '-' }}
                </template>
              </el-table-column>
              <el-table-column :label="t('workflow.approvalStatus')" min-width="100">
                <template #default="{ row }">
                  <el-tag :type="row.endTime ? 'success' : 'warning'" size="small">
                    {{ row.endTime ? t('common.statusCompleted') : t('common.statusInProgress') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column
                prop="startTime"
                :label="t('common.startTime')"
                min-width="175"
                show-overflow-tooltip
              />
              <el-table-column
                :label="t('workflow.completedAt')"
                min-width="175"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  {{ row.endTime ?? t('common.inProgressEllipsis') }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </template>
      </div>
    </el-drawer>
  </StandardListTemplate>
</template>

<style scoped>
.drawer-content {
  padding: 0;
}

.detail-section {
  margin-bottom: 16px;
}

/* ─── 高亮标记 CSS ─── */
</style>
