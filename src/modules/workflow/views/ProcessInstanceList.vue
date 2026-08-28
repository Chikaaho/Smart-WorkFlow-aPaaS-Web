<script setup lang="ts">
/* global HTMLElement */
/**
 * ProcessInstanceList — 流程实例监控页（页型 B + el-drawer 详情抽屉）。
 *
 * 列表页：分页展示流程实例，支持按状态/流程定义/发起人过滤。
 * 详情抽屉：实例基本信息 + BPMN 流程图高亮（活跃节点/已完成节点）+ 流转时间线。
 */
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { StandardListTemplate } from '@/components/page-layout'
import {
  queryInstances,
  getInstanceDetail,
  pageProcessDefs,
  getProcessDefGraph,
} from '@/modules/workflow/api'
import type { ProcessInstance, InstanceDetail } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { mountBpmnViewer } from '@/adapters/bpmn'
import type { BpmnViewerInstance } from '@/adapters/bpmn'
import type { InstanceFilter } from '@/modules/workflow/api'

// ─── 状态映射 ───

const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'danger' | 'info' }
> = {
  RUNNING: { label: '运行中', type: 'success' },
  APPROVED: { label: '已完成', type: 'info' },
  REJECTED: { label: '已驳回', type: 'danger' },
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
      errorMsg.value = '加载流程实例列表失败'
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

// 流程定义 key → id 映射（用于获取 BPMN XML）
const defKeyToIdMap = ref<Record<string, number>>({})

// BPMN viewer
const bpmnContainerRef = ref<HTMLElement | null>(null)
let viewerInstance: BpmnViewerInstance | null = null

/** 构建 processDefKey → defId 映射（页面初始化时加载一次） */
async function loadProcessDefMap() {
  try {
    // 取全量流程定义（pageSize 设大一些，mock 只有 4 条）
    const result = await pageProcessDefs({ pageNum: 1, pageSize: 100 })
    const map: Record<string, number> = {}
    for (const def of result.list) {
      map[def.processKey] = def.id
    }
    defKeyToIdMap.value = map
  } catch {
    // 静默失败 — 映射为空时流程图区域显示"无法获取流程图"
  }
}

/** 打开详情抽屉 */
async function openDrawer(row: ProcessInstance) {
  drawerVisible.value = true
  drawerLoading.value = true
  drawerError.value = ''
  detail.value = null

  try {
    detail.value = await getInstanceDetail(row.processInstanceId)
    await nextTick()

    // 加载 BPMN XML 并渲染
    const processDefKey = row.processDefKey
    const defId = defKeyToIdMap.value[processDefKey]
    if (!defId) {
      drawerError.value = '未找到对应流程定义，无法展示流程图'
      return
    }

    const xml = await getProcessDefGraph(defId)
    if (!bpmnContainerRef.value) {
      drawerError.value = '流程图容器未就绪'
      return
    }

    // 销毁旧 viewer（如果存在）
    if (viewerInstance) {
      viewerInstance.destroy()
      viewerInstance = null
    }

    viewerInstance = await mountBpmnViewer(bpmnContainerRef.value, xml)

    // 高亮活跃节点（绿色）和已完成节点（灰色）
    applyHighlights()

    // 自适应画布
    await nextTick()
    try {
      viewerInstance.fitViewport()
    } catch {
      // 抽屉动画可能尚未完成，忽略
    }
  } catch (err) {
    if (err instanceof ApiError) {
      drawerError.value = err.msg
    } else {
      drawerError.value = (err as Error)?.message || '加载实例详情失败'
    }
  } finally {
    drawerLoading.value = false
  }
}

/** 在 BPMN 图上应用高亮标记 */
function applyHighlights() {
  if (!viewerInstance || !detail.value) return

  // 获取已完成节点 activityId（flowTrace 中 endTime != null 的条目）
  const completedNodeIds = detail.value.flowTrace
    .filter((node) => node.endTime != null)
    .map((node) => node.activityId)

  // 绿色高亮：活跃节点
  for (const id of detail.value.activeNodeIds) {
    try {
      viewerInstance.highlight(id, 'highlight-active')
    } catch {
      // 可能该 element ID 在 BPMN XML 中不存在——忽略
    }
  }

  // 灰色高亮：已完成节点
  for (const id of completedNodeIds) {
    try {
      viewerInstance.highlight(id, 'highlight-completed')
    } catch {
      // 同上
    }
  }
}

/** 关闭抽屉并清理 */
function closeDrawer() {
  if (viewerInstance) {
    viewerInstance.destroy()
    viewerInstance = null
  }
  drawerVisible.value = false
  drawerError.value = ''
  drawerLoading.value = false
  detail.value = null
}

onBeforeUnmount(() => {
  if (viewerInstance) {
    viewerInstance.destroy()
    viewerInstance = null
  }
})

onMounted(() => {
  void loadProcessDefMap()
  void loadList()
})

// ─── 时间线过滤：只展示 userTask 类型的条目（排除 startEvent/endEvent/sequenceFlow） ───

function isUserTask(activityType: string): boolean {
  return activityType === 'userTask'
}
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
    <!-- 空态操作 -->
    <template #empty-action>
      <span />
    </template>

    <!-- 筛选区：状态过滤 -->
    <template #filter>
      <el-select
        v-model="filterStatus"
        placeholder="全部状态"
        clearable
        style="width: 180px"
        @change="handleFilterChange"
      >
        <el-option label="运行中" value="RUNNING" />
        <el-option label="已完成" value="APPROVED" />
        <el-option label="已驳回" value="REJECTED" />
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
      <el-table-column prop="processName" label="流程名称" min-width="160">
        <template #default="{ row }">
          {{ (row as ProcessInstance).processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="businessKey" label="业务单号" min-width="160" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType((row as ProcessInstance).status)" size="small">
            {{ getStatusLabel((row as ProcessInstance).status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发起人 ID" width="100">
        <template #default="{ row }">
          {{ (row as ProcessInstance).initiatorId }}
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="发起时间" width="180" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDrawer(row as ProcessInstance)">
            查看详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      title="流程实例详情"
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
            <template #header><span>基本信息</span></template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="流程名称">{{
                detail.processName ?? '-'
              }}</el-descriptions-item>
              <el-descriptions-item label="实例 ID">{{
                detail.processInstanceId
              }}</el-descriptions-item>
              <el-descriptions-item label="业务单号">{{ detail.businessKey }}</el-descriptions-item>
              <el-descriptions-item label="表单标识">{{ detail.formKey }}</el-descriptions-item>
              <el-descriptions-item label="发起人 ID">{{
                detail.initiatorId
              }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="getStatusType(detail.status)" size="small">
                  {{ getStatusLabel(detail.status) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="发起时间">{{ detail.createTime }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 流程图高亮 -->
          <el-card class="detail-section">
            <template #header>
              <span>流程图</span>
              <span style="margin-left: 12px; font-size: 12px; font-weight: normal; color: #909399">
                <span class="legend-dot legend-active" /> 活跃节点
                <span class="legend-dot legend-completed" style="margin-left: 12px" /> 已完成节点
              </span>
            </template>
            <div v-if="!drawerError" class="bpmn-wrapper">
              <div ref="bpmnContainerRef" class="bpmn-container" />
            </div>
          </el-card>

          <!-- 流转时间线 -->
          <el-card class="detail-section">
            <template #header><span>流转记录</span></template>
            <el-alert
              v-if="detail.flowTrace.filter((n) => isUserTask(n.activityType)).length === 0"
              title="暂无审批记录"
              type="info"
              :closable="false"
              show-icon
            />
            <el-table
              v-else
              :data="detail.flowTrace.filter((n) => isUserTask(n.activityType))"
              stripe
            >
              <el-table-column prop="activityName" label="审批节点" min-width="140" />
              <el-table-column prop="assignee" label="审批人" min-width="100">
                <template #default="{ row }">
                  {{ row.assignee ?? '-' }}
                </template>
              </el-table-column>
              <el-table-column label="审批状态" min-width="100">
                <template #default="{ row }">
                  <el-tag :type="row.endTime ? 'success' : 'warning'" size="small">
                    {{ row.endTime ? '已完成' : '进行中' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="startTime" label="开始时间" min-width="170" />
              <el-table-column label="完成时间" min-width="170">
                <template #default="{ row }">
                  {{ row.endTime ?? '进行中...' }}
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

/* BPMN 容器 */
.bpmn-wrapper {
  height: 400px;
  position: relative;
}
.bpmn-container {
  width: 100%;
  height: 100%;
}

/* 隐藏 bpmn-js 右下角 Logo */
:deep(.bjs-powered-by) {
  display: none !important;
}

/* ─── 高亮标记 CSS ─── */

/* 活跃节点：绿色填充 + 绿色边框 */
:deep(.highlight-active:not(.djs-connection) .djs-visual > :nth-child(1)) {
  fill: rgba(34, 197, 94, 0.15) !important; /* 浅绿填充 */
  stroke: #22c55e !important; /* 绿色边框 */
}
/* 活跃节点的连线也变绿 */
:deep(.highlight-active.djs-connection .djs-visual > :nth-child(1)) {
  stroke: #22c55e !important;
}

/* 已完成节点：灰色填充 + 灰色边框 */
:deep(.highlight-completed:not(.djs-connection) .djs-visual > :nth-child(1)) {
  fill: rgba(148, 163, 184, 0.15) !important; /* 浅灰填充 */
  stroke: #94a3b8 !important; /* 灰色边框 */
}
/* 已完成节点的连线也变灰 */
:deep(.highlight-completed.djs-connection .djs-visual > :nth-child(1)) {
  stroke: #94a3b8 !important;
}

/* ─── 图例 ─── */
.legend-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  vertical-align: middle;
  margin-right: 4px;
}
.legend-active {
  background: #22c55e;
}
.legend-completed {
  background: #94a3b8;
}
</style>
