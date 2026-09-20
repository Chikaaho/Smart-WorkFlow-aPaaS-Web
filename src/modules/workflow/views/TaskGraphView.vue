<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TaskGraphView — 任务全屏流程图（P53 节点 10）。
 *
 * 设计（节点10）：返回入口 + 任务标题/状态/流程元信息 + 四视图按钮（申请信息 / 流程图 /
 * 审批记录 / 流转日志）+ 全幅流程图画布（网格底 / 右浮动 当前节点与节点状态卡 / 缩放盒）。
 *
 * 数据全部来自既有真实契约：任务详情（queryTaskDetail）+ 定义图
 * （getProcessDefDefinitionByKey）+ 历史轨迹派生（与 TaskDetail 同源规则）。
 * 其余三个按钮跳转任务详情对应视图（真实页面，不复制功能）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProcessGraphView from './ProcessGraphView.vue'
import { deriveProcessTrace } from '../utils/process-trace'
import { queryTaskDetail } from '@/modules/workflow/api'
import type { TaskDetail } from '@/contracts/bpm'

const route = useRoute()
const router = useRouter()
const taskId = computed(() => String(route.params.taskId ?? ''))

const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const detailGraph = ref<import('@/contracts/process-graph').ProcessGraphDocument | null>(null)
const detailTrace = ref<{ activeNodeIds: string[]; completedNodeIds: string[] } | null>(null)

/** 当前节点名：图元素中命中最晚一条未完结历史（按 nodeKey→节点名回退匹配）。 */
const currentNodeName = computed(() => {
  const graph = detailGraph.value
  const activeKey = detailTrace.value?.activeNodeIds.at(-1)
  if (graph && activeKey) {
    const el = graph.elements.find((e) => e.kind === 'node' && e.id === activeKey)
    if (el) return (el.config as { name?: string }).name ?? activeKey
  }
  const pending = (detail.value?.approvalHistory ?? []).filter((row) => !row.endTime)
  return pending.at(-1)?.taskName ?? detail.value?.processName ?? '—'
})

const completedCount = computed(
  () => (detail.value?.approvalHistory ?? []).filter((row) => row.endTime).length,
)
const totalCount = computed(() => (detail.value?.approvalHistory ?? []).length)
const pendingNames = computed(() =>
  (detail.value?.approvalHistory ?? [])
    .filter((row) => !row.endTime && row.assigneeName)
    .map((row: { assigneeName?: string | null }) => row.assigneeName as string),
)

const statusText = computed(() => {
  const history = detail.value?.approvalHistory ?? []
  if (history.some((row) => !row.endTime)) return t('taskDetailUi.statusApproving')
  return t('common.statusApproved')
})

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    detail.value = await queryTaskDetail(taskId.value)
    const { getProcessDefDefinitionByKey } = await import('@/modules/workflow/api')
    const definition = await getProcessDefDefinitionByKey(detail.value.processDefinitionKey)
    detailGraph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    }
    // 轨迹：与 TaskDetail 共用同一派生规则（已完成=已完结历史行 + 名称回退 + 路由前缀推断）
    detailTrace.value = deriveProcessTrace({
      approvalHistory: detail.value.approvalHistory,
      currentNodeKey: detail.value.nodeKey ?? '',
      currentNodeName: currentNodeName.value,
      elements: detailGraph.value.elements,
    })
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('errors.network')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function goBack() {
  router.push('/workflow/todo')
}
function goTaskDetail() {
  router.push(`/workflow/task/${taskId.value}`)
}
function goTaskRecords() {
  router.push({ path: `/workflow/task/${taskId.value}`, query: { tab: 'records' } })
}
</script>

<template>
  <div class="task-graph-page">
    <div class="task-graph-page__head">
      <el-button class="task-graph-page__back" @click="goBack">
        ‹ {{ t('workflow.backToTodo') }}
      </el-button>
      <div class="task-graph-page__title-row">
        <h1 class="task-graph-page__title">{{ detail?.processName || '—' }}</h1>
        <span class="task-graph-page__status">{{ statusText }}</span>
      </div>
      <p class="task-graph-page__meta">
        {{ detail?.businessKey }} ·
        {{ t('workflow.draftVersionLabel', { version: detailGraph?.version ?? '-' }) }}
      </p>
    </div>

    <div class="task-graph-page__tabs">
      <button type="button" class="graph-tab" @click="goTaskDetail">
        {{ t('taskDetailUi.applicationInfo') }}
      </button>
      <button type="button" class="graph-tab is-active">
        {{ t('taskDetailUi.tabGraph') }}
      </button>
      <button type="button" class="graph-tab" @click="goTaskRecords">
        {{ t('taskDetailUi.approvalRecords') }}
      </button>
      <button type="button" class="graph-tab" @click="goTaskDetail">
        {{ t('taskDetailUi.flowLogs') }}
      </button>
    </div>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
    <div v-if="loading" class="task-graph-page__loading">{{ t('common.loading') }}</div>

    <div v-else class="task-graph-page__canvas">
      <ProcessGraphView
        v-if="detailGraph"
        :graph="detailGraph"
        :trace="detailTrace"
        :height="768"
        :fit-margins="{ left: 135, top: 19, right: 240, bottom: -276 }"
      />
      <aside class="graph-rail">
        <div class="graph-rail__card">
          <small class="graph-rail__kicker">{{ t('taskDetailUi.current') }}</small>
          <p class="graph-rail__name">{{ currentNodeName }}</p>
          <p class="graph-rail__meta">
            {{ t('taskDetailUi.signDoneProgress', { done: completedCount, total: totalCount }) }}
          </p>
          <p v-if="pendingNames.length" class="graph-rail__meta">
            {{ t('taskDetailUi.pendingNamesPrefix') }}{{ pendingNames.join('、') }}
          </p>
        </div>
        <div class="graph-rail__card">
          <small class="graph-rail__kicker">{{ t('taskDetailUi.nodeStatus') }}</small>
          <div class="graph-rail__chips">
            <span class="graph-chip graph-chip--done">{{ t('taskDetailUi.prevDone') }}</span>
            <span class="graph-chip graph-chip--running">{{ t('taskDetailUi.statusApproving') }}</span>
            <span class="graph-chip graph-chip--pending">{{ t('taskDetailUi.stateNotReached') }}</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.task-graph-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6px 32px 0;
  overflow: auto;
}

.task-graph-page__back {
  align-self: flex-start;
  height: 24px;
  padding: 0 31px;
  border: 1px solid #d9e0ee;
  border-radius: 14px;
  background: #fff;
  color: #172033;
  font-size: 12px;
  line-height: 13px;
}

.task-graph-page__title-row {
  display: flex;
  align-items: center;
  gap: 68px;
  margin-top: 3px;
}

.task-graph-page__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 35px;
  color: #19233b;
}

.task-graph-page__status {
  padding: 2px 12px;
  font-size: 12px;
  line-height: 15px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft, #ece9ff);
  border-radius: 6px;
}

.task-graph-page__meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a96ad;
}

.task-graph-page__tabs {
  display: flex;
  gap: 16px;
  margin: 17px 0 14px;
}

.graph-tab {
  min-width: 124px;
  height: 36px;
  border: 1px solid #ccd5e5;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 19px;
  color: #5f6f92;
  cursor: pointer;
}

.graph-tab.is-active {
  color: var(--sw-color-primary);
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft, #ece9ff);
  font-weight: 600;
}

.task-graph-page__loading {
  padding: 48px 0;
  text-align: center;
  color: var(--sw-text-secondary);
}

.task-graph-page__canvas {
  position: relative;
  flex: 1 1 auto;
  min-height: 700px;
  margin-bottom: 16px;
  border: 1px solid #e7ebf4;
  border-radius: 12px;
  background: #fdfdff;
  overflow: hidden;
}

/* 设计10：画布浅底 #FBFDFF + 24px 网格（与 TaskDetail 图画布同款） */
.task-graph-page__canvas :deep(.pg-view) {
  border-color: var(--sw-border-lighter);
  background: #fbfdff;
}
.task-graph-page__canvas :deep(.pg-view)::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(#e8edf6 1px, transparent 1px),
    linear-gradient(90deg, #e8edf6 1px, transparent 1px);
  background-size: 24px 24px;
}
.task-graph-page__canvas :deep(.pg-svg),
.task-graph-page__canvas :deep(.pg-zoom),
.task-graph-page__canvas :deep(.pg-compat-alert) {
  z-index: 1;
}

/* 设计10：缩放盒锚在画布右下（182×77，与节点19 的底距不同） */
.task-graph-page__canvas :deep(.pg-zoom) {
  right: 21px;
  bottom: 28px;
  width: 178px;
  box-sizing: border-box;
  padding: 10px 12px;
}
.task-graph-page__canvas :deep(.pg-zoom__row) {
  justify-content: flex-start;
}
.task-graph-page__canvas :deep(button.pg-zoom__locate) {
  padding-left: 0;
  text-align: left;
}

.graph-rail {
  position: absolute;
  top: 15px;
  right: 22px;
  display: flex;
  flex-direction: column;
  gap: 23px;
  width: 182px;
}

.graph-rail__card {
  box-sizing: border-box;
  padding: 16px 14px;
  background: #fff;
  border: 1px solid #e0e6f2;
  border-radius: 10px;
}

.graph-rail__card:first-child {
  min-height: 157px;
}

.graph-rail__card:last-child {
  min-height: 142px;
}

.graph-rail__kicker {
  display: block;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8393b5;
}

.graph-rail__name {
  margin: 0 0 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-color-primary);
}

.graph-rail__meta {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--sw-text-regular);
}

.graph-rail__meta:last-child {
  margin-bottom: 0;
}

.graph-rail__chips {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.graph-chip {
  display: flex;
  align-items: center;
  width: 84px;
  height: 24px;
  padding: 0 8px;
  box-sizing: border-box;
  line-height: 15px;
  text-align: left;
  font-size: 12px;
  border-radius: 6px;
}

.graph-chip--done {
  color: #15a77f;
  background: #e6f8f2;
}

.graph-chip--running {
  color: var(--sw-color-primary);
  background: #f0eaff;
}

.graph-chip--pending {
  color: #8a96ad;
  background: #f0f3f9;
}
</style>
