<script setup lang="ts">
/* global window */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import ProcessGraphView from '@/components/ProcessGraphView.vue'
import { ApiError } from '@/foundation/request'
import { downloadOpinionAttachment } from '@/modules/workflow/api'
import { getFormDefinition, resolveUserDisplayNames } from '@/adapters/form-runtime'
import type { ApprovalHistoryItem } from '@/contracts/bpm'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import { deriveProcessTrace } from '../utils/process-trace'

/**
 * InstanceFlowPanel — 有流程的表单详情的「外挂流程信息」唯一控制面（0.1.7 #30）。
 *
 * 业务规则：表单可独立存在；流程必须依赖表单，流程信息只作为有流程的表单详情下的
 * 外挂组件渲染。任务详情与表单数据详情共用本组件（流转记录 / 流程图 / 审批详情），
 * 不允许任一侧再自建一套流程信息页面。数据只取调用方传入的真实审批历史。
 */
const props = defineProps<{
  approvalHistory: ApprovalHistoryItem[]
  processDefinitionKey?: string | null
  currentNodeKey?: string | null
}>()

const { t } = useI18n()

// ─── 底部 tab ───
const activeTab = ref<'records' | 'graph' | 'people'>('records')

// ─── 审批结果映射 ───
const APPROVAL_RESULT_MAP: Record<string, { label: string; type: 'success' | 'danger' | 'info' }> =
  {
    APPROVED: {
      get label() {
        return t('common.resultAgreed')
      },
      type: 'success',
    },
    REJECTED: {
      get label() {
        return t('common.reject')
      },
      type: 'danger',
    },
  }

function getApprovalResultLabel(result: string | null): string {
  // 设计（节点20/16）：列表与详情中已同意/待处理作为结果词，进行中仅用于节点态
  if (!result) return t('common.resultPending')
  return APPROVAL_RESULT_MAP[result]?.label ?? result
}

function getApprovalResultType(result: string | null): 'success' | 'danger' | 'info' {
  if (!result) return 'info'
  return APPROVAL_RESULT_MAP[result]?.type ?? 'info'
}

/** 流转记录四列视图（时间/流转节点/操作人/事件·结果）：行数据完全由真实审批历史派生。 */
const flowRecordRows = computed(() =>
  props.approvalHistory.map((row) => ({
    key: row.taskId,
    time: row.createTime ? row.createTime.slice(5, 16).replace('T', ' ') : '-',
    node: row.taskName,
    operator: row.assigneeName ?? row.assignee ?? '-',
    event:
      [
        row.approvalResult ? getApprovalResultLabel(row.approvalResult) : (row.action ?? null),
        typeof row.opinionData?.comment === 'string' && row.opinionData.comment
          ? row.opinionData.comment
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || '-',
  })),
)

// ─── 流程图：定义图 + 真实轨迹高亮，切 tab 懒加载 ───
const detailGraph = ref<ProcessGraphDocument | null>(null)
const detailTrace = ref<{ activeNodeIds: string[]; completedNodeIds: string[] } | null>(null)
const graphLoading = ref(false)
const graphError = ref('')

/** 流程状态卡（右栏）：仅渲染真实可得的已完成/当前节点 ─── */
interface FlowRailEntry {
  key: string
  name: string
  state: 'done' | 'current'
  kicker: string
  who: string
  when: string
  result: string | null
  isSign: boolean
  doneCount: number
  total: number
  pendingNames: string
  row: ApprovalHistoryItem | null
}

/** 展示层时间格式：真实时间戳 → MM-DD HH:mm（设计15-18 右栏，仅显示不改数据） */
function formatWhen(value: string | null): string {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const flowRail = computed<FlowRailEntry[]>(() => {
  const groups = new Map<
    string,
    { name: string; rows: ApprovalHistoryItem[]; createTime: string }
  >()
  for (const row of props.approvalHistory) {
    // 提交动作不是审批节点（设计右栏不呈现），仅保留审批组
    if (typeof row.nodeKey !== 'string' || !row.nodeKey) continue
    const g = groups.get(row.nodeKey) ?? {
      name: row.taskName,
      rows: [],
      createTime: row.createTime,
    }
    g.rows.push(row)
    groups.set(row.nodeKey, g)
  }
  const done: FlowRailEntry[] = []
  const current: FlowRailEntry[] = []
  for (const [key, g] of groups) {
    // 派发通知行：无结果但有完成时间——不计入会签进度
    const real = g.rows.filter((r) => !(r.approvalResult == null && r.endTime != null))
    const approved = real.filter((r) => r.approvalResult === 'APPROVED')
    const pending = real.filter((r) => r.approvalResult == null && r.endTime == null)
    if (pending.length === 0 && approved.length > 0) {
      const lastApproved = approved.at(-1) ?? g.rows[0]
      done.push({
        key,
        name: g.name,
        state: 'done',
        kicker: '前一节点 · 已完成',
        who: lastApproved.assigneeName ?? lastApproved.assignee ?? '-',
        when: formatWhen(lastApproved.endTime ?? ''),
        result: lastApproved.approvalResult ?? null,
        isSign: real.length > 1,
        doneCount: approved.length,
        total: real.length,
        pendingNames: '',
        row: lastApproved,
      })
    } else if (pending.length > 0) {
      current.push({
        key,
        name: g.name,
        state: 'current',
        kicker: `当前节点 · 进行中 · ${approved.length} / ${g.rows.length}`,
        who: pending
          .map((r) => r.assigneeName)
          .filter(Boolean)
          .join('、'),
        when: formatWhen(g.rows[0]?.createTime ?? ''),
        result: null,
        isSign: real.length > 1,
        doneCount: approved.length,
        total: real.length,
        pendingNames: pending
          .map((r) => r.assigneeName)
          .filter(Boolean)
          .join('、'),
        row: real[0] ?? g.rows[0] ?? null,
      })
    }
  }
  const rail: FlowRailEntry[] = []
  if (done.length > 0) rail.push(done.at(-1)!)
  rail.push(...current)
  return rail
})

/** 流程图右侧状态卡数据源：仅真实进行中的节点；无进行中节点时不渲染。 */
const currentRailEntry = computed(() => flowRail.value.find((e) => e.state === 'current') ?? null)

// ─── 会签聚合（设计 60:190）：多人节点聚合入口 + 会签记录弹窗 ───
interface SignGroup {
  key: string
  name: string
  rows: ApprovalHistoryItem[]
  approved: number
  rejected: number
  pending: number
}

/** 会签组 = 同一 nodeKey 下存在多名真实参与人的审批组（派发通知行不计）。 */
const signGroups = computed<SignGroup[]>(() => {
  const groups = new Map<string, { name: string; rows: ApprovalHistoryItem[] }>()
  for (const row of props.approvalHistory) {
    if (typeof row.nodeKey !== 'string' || !row.nodeKey) continue
    const g = groups.get(row.nodeKey) ?? { name: row.taskName, rows: [] }
    g.rows.push(row)
    groups.set(row.nodeKey, g)
  }
  const result: SignGroup[] = []
  for (const [key, g] of groups) {
    const real = g.rows.filter((r) => !(r.approvalResult == null && r.endTime != null))
    if (real.length < 2) continue
    result.push({
      key,
      name: g.name,
      rows: real,
      approved: real.filter((r) => r.approvalResult === 'APPROVED').length,
      rejected: real.filter((r) => r.approvalResult === 'REJECTED').length,
      pending: real.filter((r) => r.approvalResult == null && r.endTime == null).length,
    })
  }
  return result
})

const signDialogVisible = ref(false)
const signFilter = ref<'all' | 'agreed' | 'rejected'>('all')
const activeSignGroup = ref<SignGroup | null>(null)

function openSignDialog(key: string) {
  activeSignGroup.value = signGroups.value.find((g) => g.key === key) ?? null
  signFilter.value = 'all'
  signDialogVisible.value = true
}

const signDialogRows = computed(() => {
  const g = activeSignGroup.value
  if (!g) return []
  if (signFilter.value === 'agreed') return g.rows.filter((r) => r.approvalResult === 'APPROVED')
  if (signFilter.value === 'rejected') return g.rows.filter((r) => r.approvalResult === 'REJECTED')
  return g.rows
})

/** 图画布高度：默认 740；高视口（长页基线 1512）下 800。 */
const graphCanvasHeight = computed(() =>
  typeof window !== 'undefined' && window.innerHeight >= 1100 ? 784 : 740,
)

function refreshTrace() {
  if (!detailGraph.value) return
  // 轨迹高亮只使用真实可得数据（与 TaskGraphView 共用同一派生规则）。
  detailTrace.value = deriveProcessTrace({
    approvalHistory: props.approvalHistory,
    currentNodeKey: props.currentNodeKey ?? '',
    currentNodeName: currentRailEntry.value?.name ?? '',
    elements: detailGraph.value.elements ?? [],
  })
}

async function loadGraph() {
  if (detailGraph.value || graphLoading.value) return
  if (!props.processDefinitionKey) {
    graphError.value = t('taskDetailUi.graphUnavailable')
    return
  }
  graphLoading.value = true
  graphError.value = ''
  try {
    const { getProcessDefDefinitionByKey } = await import('@/modules/workflow/api')
    const definition = await getProcessDefDefinitionByKey(props.processDefinitionKey)
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
    refreshTrace()
  } catch (err) {
    graphError.value = err instanceof ApiError ? err.msg : t('taskDetailUi.graphUnavailable')
  } finally {
    graphLoading.value = false
  }
}

function onTabChange(tab: string | number) {
  if (tab === 'graph') void loadGraph()
}

// 审批历史刷新（如内联审批完成后）：已加载的流程图轨迹同步重算，不重拉定义。
watch(
  () => props.approvalHistory,
  () => refreshTrace(),
)

// ─── 审批详情列表：仅审批人行（排除提交动作与会签派发通知行） ───
const peopleRows = computed(() =>
  props.approvalHistory.filter(
    (r) =>
      typeof r.nodeKey === 'string' &&
      !!r.nodeKey &&
      !(r.approvalResult == null && r.endTime != null),
  ),
)

// ─── 意见详情弹窗：展示该行真实可得字段 ───
const opinionDetailVisible = ref(false)
const opinionDetailRow = ref<ApprovalHistoryItem | null>(null)
/** 意见表单字段名 → 业务标签；未解析到时只显示业务兜底，不暴露内部字段名。 */
const opinionFieldLabels = ref<Record<string, string>>({})
/** 人员意见字段的稳定 ID → 显示名；显示名只用于阅读，原始 ID 仍随记录保存。 */
const opinionUserFieldKeys = ref<string[]>([])
const opinionUserNames = ref<Record<string, string>>({})
let opinionSchemaToken = 0

async function loadOpinionFieldLabels(row: ApprovalHistoryItem | null) {
  const token = ++opinionSchemaToken
  opinionFieldLabels.value = {}
  opinionUserFieldKeys.value = []
  opinionUserNames.value = {}
  const formKey = row?.opinionFormId
  if (!formKey) return
  try {
    const schema = await getFormDefinition(String(formKey))
    if (token !== opinionSchemaToken) return
    const labels: Record<string, string> = {}
    const userKeys: string[] = []
    for (const field of schema.fields) {
      if (field.label?.trim()) labels[field.name] = field.label.trim()
      if (field.type === 'USER') userKeys.push(field.name)
    }
    opinionFieldLabels.value = labels
    opinionUserFieldKeys.value = userKeys
    const ids = new Set<string>()
    for (const key of userKeys) {
      const value = row?.opinionData?.[key]
      const list = Array.isArray(value) ? value : value == null ? [] : [value]
      for (const item of list) {
        const text = String(item ?? '').trim()
        if (text) ids.add(text)
      }
    }
    if (ids.size > 0) {
      const names = await resolveUserDisplayNames([...ids])
      if (token === opinionSchemaToken) opinionUserNames.value = names
    }
  } catch {
    if (token === opinionSchemaToken) {
      opinionFieldLabels.value = {}
      opinionUserFieldKeys.value = []
      opinionUserNames.value = {}
    }
  }
}

/** 人员值展示：显示名（稳定ID）；未解析到显示名时保留 ID，不伪造姓名。 */
function opinionUserDisplay(_key: string, value: unknown): string {
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((item) => {
      const id = String(item ?? '').trim()
      if (!id) return ''
      const name = opinionUserNames.value[id]
      return name ? `${name}（${id}）` : id
    })
    .filter(Boolean)
    .join('、')
}

function businessFieldLabel(key: string): string {
  if (opinionFieldLabels.value[key]) return opinionFieldLabels.value[key]
  return /[\u4e00-\u9fa5]/.test(key) ? key : '补充信息'
}

watch(opinionDetailRow, (row) => void loadOpinionFieldLabels(row))

function openOpinionDetail(row: ApprovalHistoryItem) {
  opinionDetailRow.value = row
  opinionDetailVisible.value = true
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 MyInstances 写法）
function openOpinionDetailRow(r: unknown) {
  openOpinionDetail(r as ApprovalHistoryItem)
}

/** 附件类字段的键名约定：只有真实记录带这类键时才渲染附件区块，否则留白。 */
const OPINION_ATTACHMENT_KEY = /^(attachments?|files?|附录|附件)/i

const opinionDetailEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(
      ([key, value]) =>
        key !== 'comment' &&
        !Array.isArray(value) &&
        !OPINION_ATTACHMENT_KEY.test(key) &&
        value != null &&
        value !== '',
    )
    .map(([key, value]) => ({
      key: businessFieldLabel(key),
      value: opinionUserFieldKeys.value.includes(key)
        ? opinionUserDisplay(key, value)
        : String(value),
    }))
})

/** 设计（意见详情）的已确认检查项区块：仅当字段值为非空数组时按检查项芯片渲染。 */
const opinionDetailCheckEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(([key, value]) => key !== 'comment' && Array.isArray(value) && value.length > 0)
    .map(
      ([key, value]) =>
        [
          businessFieldLabel(key),
          opinionUserFieldKeys.value.includes(key)
            ? (value as unknown[]).map((item) => opinionUserDisplay(key, item))
            : (value as unknown[]),
        ] as const,
    )
})

/** 意见附件项的解析结果：仅结构化 { storageKey } 引用可受控下载；纯文本旧值标记不可查看。 */
interface OpinionAttachmentItem {
  storageKey: string | null
  name: string
}

function attachmentsOf(value: unknown): OpinionAttachmentItem[] {
  const list = Array.isArray(value) ? value : [value]
  return list.flatMap((item): OpinionAttachmentItem[] => {
    if (item == null || item === '') return []
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>
      const storageKey = typeof record.storageKey === 'string' ? record.storageKey : null
      const name = typeof record.name === 'string' && record.name ? record.name : (storageKey ?? '')
      return name ? [{ storageKey, name }] : []
    }
    // 纯文本/旧文件名没有可解析引用：只展示，不拼下载地址
    return [{ storageKey: null, name: String(item) }]
  })
}

const opinionDetailAttachmentEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(([key]) => key !== 'comment' && OPINION_ATTACHMENT_KEY.test(key))
    .map(([key, value]) => ({ key: businessFieldLabel(key), items: attachmentsOf(value) }))
    .filter((entry) => entry.items.length > 0)
})

const opinionAttachmentDownloading = ref<string | null>(null)

async function downloadOpinionAttachmentItem(item: OpinionAttachmentItem): Promise<void> {
  const row = opinionDetailRow.value
  if (!row?.actionRecordId || !item.storageKey || opinionAttachmentDownloading.value) return
  opinionAttachmentDownloading.value = item.storageKey
  try {
    const blob = await downloadOpinionAttachment(row.actionRecordId, item.storageKey, item.name)
    const url = globalThis.URL.createObjectURL(blob)
    try {
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = item.name
      globalThis.document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
      }
    } finally {
      globalThis.URL.revokeObjectURL(url)
    }
  } catch (error) {
    ElMessage.error(
      error && typeof error === 'object' && 'msg' in error
        ? String((error as { msg?: unknown }).msg)
        : t('taskDetailUi.opinionAttachmentDownloadFailed'),
    )
  } finally {
    opinionAttachmentDownloading.value = null
  }
}
</script>

<template>
  <el-card class="instance-flow-panel" shadow="never">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 流转记录：四列设计版式，行数据来自真实审批历史 -->
      <el-tab-pane name="records">
        <template #label
          ><span class="detail-tab-label">{{ t('taskDetailUi.tabRecords') }}</span></template
        >
        <el-alert
          v-if="approvalHistory.length === 0"
          :title="t('workflow.noApprovalHistory')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else class="detail-flow-table" :data="flowRecordRows" stripe>
          <el-table-column prop="time" :label="t('taskDetailUi.recordTime')" min-width="244" />
          <el-table-column prop="node" :label="t('taskDetailUi.recordNode')" min-width="344" />
          <el-table-column
            prop="operator"
            :label="t('taskDetailUi.operatorLabel')"
            min-width="186"
          />
          <el-table-column prop="event" :label="t('taskDetailUi.recordEvent')" min-width="664" />
        </el-table>
      </el-tab-pane>

      <!-- 流程图：定义图 + 真实轨迹高亮，切 tab 懒加载；图内容由 ProcessGraphView 内核输出 -->
      <el-tab-pane name="graph">
        <template #label
          ><span class="detail-tab-label">{{ t('taskDetailUi.tabGraph') }}</span></template
        >
        <div v-loading="graphLoading" class="p53-graph-shell">
          <el-alert
            v-if="graphError"
            :title="graphError"
            type="warning"
            :closable="false"
            show-icon
          />
          <div v-if="detailGraph" class="p53-graph-canvas">
            <ProcessGraphView
              :graph="detailGraph"
              :trace="detailTrace"
              :height="graphCanvasHeight"
              :fit-margins="{ left: 135, top: 24, right: 241, bottom: -232 }"
            />
            <aside v-if="currentRailEntry" class="p53-graph-rail">
              <div class="p53-graph-status">
                <small>{{ t('taskDetailUi.current') }}</small>
                <strong>{{ currentRailEntry.name }}</strong>
                <span v-if="currentRailEntry.total > 0">
                  {{
                    t('taskDetailUi.signDoneProgress', {
                      done: currentRailEntry.doneCount,
                      total: currentRailEntry.total,
                    })
                  }}
                </span>
                <span v-if="currentRailEntry.pendingNames">
                  {{ t('taskDetailUi.pendingNamesPrefix') }}{{ currentRailEntry.pendingNames }}
                </span>
              </div>
              <div class="p53-graph-legend">
                <strong>{{ t('taskDetailUi.nodeStatus') }}</strong>
                <span class="p53-graph-legend__chip p53-graph-legend__chip--completed">{{
                  t('common.statusCompleted')
                }}</span>
                <span class="p53-graph-legend__chip p53-graph-legend__chip--current">{{
                  t('common.statusInProgress')
                }}</span>
                <span class="p53-graph-legend__chip p53-graph-legend__chip--pending">{{
                  t('workflow.notArrived')
                }}</span>
              </div>
            </aside>
          </div>
        </div>
      </el-tab-pane>

      <!-- 审批详情列表：按真实历史逐人一行；已处理行可打开意见详情弹窗，会签节点可开聚合记录 -->
      <el-tab-pane name="people">
        <template #label
          ><span class="detail-tab-label detail-tab-label--people">{{
            t('taskDetailUi.tabPeople')
          }}</span></template
        >
        <!-- 会签聚合（设计 60:190）：多人节点聚合入口，点击进会签记录弹窗 -->
        <div v-if="signGroups.length" class="sign-groups" data-testid="sign-groups">
          <button
            v-for="g in signGroups"
            :key="g.key"
            type="button"
            class="sign-group"
            data-testid="sign-group"
            @click="openSignDialog(g.key)"
          >
            <span class="sign-group__title">
              {{ t('taskDetailUi.signGroupTitle') }} · {{ g.name }}
            </span>
            <span class="sign-group__stats">
              <span class="sign-group__stat sign-group__stat--success">
                {{ g.approved }}{{ t('taskDetailUi.signAgreed') }}
              </span>
              <span v-if="g.rejected" class="sign-group__stat sign-group__stat--danger">
                {{ g.rejected }}{{ t('taskDetailUi.signRejected') }}
              </span>
              <span v-if="g.pending" class="sign-group__stat">
                {{ g.pending }}{{ t('taskDetailUi.signPending') }}
              </span>
            </span>
            <span class="sign-group__link">{{ t('taskDetailUi.viewAllSignRecords') }}</span>
          </button>
        </div>
        <el-table class="detail-flow-table detail-approval-table" :data="peopleRows" stripe>
          <el-table-column prop="taskName" :label="t('workflow.approvalNode')" min-width="260" />
          <el-table-column :label="t('workflow.approver')" width="120">
            <template #default="{ row }">
              {{ row.assigneeName ?? row.assignee ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="120">
            <template #default="{ row }">
              <span
                class="people-status"
                :class="`people-status--${getApprovalResultType(row.approvalResult)}`"
              >
                {{ getApprovalResultLabel(row.approvalResult) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.actionOpinion')" min-width="432">
            <template #default="{ row }">
              {{
                row.opinionFormId
                  ? t('taskDetailUi.customFormLabel')
                  : (row.opinionData?.comment ?? row.action ?? '-')
              }}
              ·
              {{ row.endTime ?? row.createTime }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="172" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.approvalResult != null"
                size="small"
                type="primary"
                plain
                round
                @click="openOpinionDetailRow(row)"
              >
                {{ t('taskDetailUi.viewDetail') }}
              </el-button>
              <span v-else class="people-group__pending">{{
                t('taskDetailUi.viewDetailPending')
              }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 意见详情弹窗：仅渲染该行真实可得字段；无对应数据时区块留白，不虚构。
         设计 60:48：760 宽外壳 + 底部 80×32 关闭按钮（只读，仅关闭）。 -->
    <el-dialog v-model="opinionDetailVisible" width="760px" top="12vh" class="p53-opinion-dialog">
      <template #header>
        <div v-if="opinionDetailRow" class="p53-opinion-dialog__head">
          <h2>{{ t('taskDetailUi.opinionDetailTitle') }}</h2>
          <b>
            {{ opinionDetailRow.taskName }} ·
            {{ opinionDetailRow.assigneeName ?? opinionDetailRow.assignee ?? '-'
            }}<template v-if="opinionDetailRow.assigneeDept">
              · {{ opinionDetailRow.assigneeDept }}
            </template>
          </b>
          <p>
            {{ getApprovalResultLabel(opinionDetailRow.approvalResult) }} ·
            {{ opinionDetailRow.endTime ?? opinionDetailRow.createTime }}
            <template v-if="opinionDetailRow.opinionFormVersion">
              · {{ t('taskDetailUi.formVersionLabel') }} v{{ opinionDetailRow.opinionFormVersion }}
            </template>
          </p>
        </div>
      </template>
      <div v-if="opinionDetailRow" class="p53-opinion-panel">
        <h3 v-if="opinionDetailRow.opinionFormId">审批意见</h3>
        <div v-if="opinionDetailEntries.length > 0" class="p53-opinion-grid">
          <div v-for="entry in opinionDetailEntries" :key="entry.key">
            <label>{{ entry.key }}</label>
            <b>{{ entry.value }}</b>
          </div>
        </div>
        <label>{{ t('taskDetailUi.opinionCommentLabel') }}</label>
        <div class="p53-opinion-comment">
          {{ opinionDetailRow.opinionData?.comment ?? t('taskDetailUi.opinionEmpty') }}
        </div>
        <template v-for="entry in opinionDetailCheckEntries" :key="entry[0]">
          <label>{{ entry[0] }}</label>
          <div class="p53-opinion-checks">
            <b v-for="item in entry[1]" :key="String(item)">✓ {{ item }}</b>
          </div>
        </template>
        <template v-for="entry in opinionDetailAttachmentEntries" :key="entry.key">
          <div class="p53-opinion-attachment-row">
            <label>{{ entry.key }}</label>
            <div class="p53-opinion-attachment">
              <template v-for="(item, index) in entry.items" :key="`${item.name}-${index}`">
                <el-button
                  v-if="item.storageKey && opinionDetailRow?.actionRecordId"
                  link
                  type="primary"
                  size="small"
                  :loading="opinionAttachmentDownloading === item.storageKey"
                  @click="downloadOpinionAttachmentItem(item)"
                >
                  {{ item.name }}（{{ t('taskDetailUi.opinionAttachmentDownload') }}）
                </el-button>
                <span v-else class="p53-opinion-attachment__unavailable">
                  {{ item.name }} · {{ t('taskDetailUi.opinionAttachmentUnavailable') }}
                </span>
              </template>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button
          type="primary"
          class="p53-opinion-dialog__close"
          data-testid="opinion-detail-close"
          @click="opinionDetailVisible = false"
        >
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 会签记录弹窗（设计 60:190）：说明 + 状态筛选 + 统计行 + 记录表 -->
    <el-dialog
      v-model="signDialogVisible"
      width="780px"
      top="12vh"
      class="p53-sign-dialog"
      data-testid="sign-records-dialog"
    >
      <template #header>
        <div class="p53-sign-dialog__head">
          <h2>{{ t('taskDetailUi.signGroupTitle') }}</h2>
          <p>{{ t('taskDetailUi.signGroupHint') }}</p>
        </div>
      </template>
      <div v-if="activeSignGroup" class="p53-sign-panel">
        <el-tabs v-model="signFilter" class="p53-sign-tabs">
          <el-tab-pane :label="t('common.all')" name="all" />
          <el-tab-pane :label="t('common.resultAgreed')" name="agreed" />
          <el-tab-pane :label="t('taskDetailUi.signTabRejected')" name="rejected" />
        </el-tabs>
        <p class="p53-sign-stats" data-testid="sign-records-stats">
          <span> {{ activeSignGroup.rows.length }}{{ t('taskDetailUi.signParticipants') }} </span>
          <span class="is-success">
            · {{ activeSignGroup.approved }}{{ t('taskDetailUi.signAgreed') }}
          </span>
          <span v-if="activeSignGroup.rejected" class="is-danger">
            · {{ activeSignGroup.rejected }}{{ t('taskDetailUi.signRejected') }}
          </span>
          <span v-if="activeSignGroup.pending" class="is-warning">
            · {{ activeSignGroup.pending }}{{ t('taskDetailUi.signPending') }}
          </span>
          <span class="p53-sign-stats__rule">{{ t('taskDetailUi.parallelSignRule') }}</span>
        </p>
        <el-table class="detail-flow-table" :data="signDialogRows" stripe>
          <el-table-column :label="t('workflow.approver')" min-width="120">
            <template #default="{ row }">
              {{ row.assigneeName ?? row.assignee ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('taskDetailUi.opinionDeptLabel')" min-width="160">
            <template #default="{ row }">
              {{ row.assigneeDept || '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.actionOpinion')" min-width="280">
            <template #default="{ row }">
              {{
                row.opinionFormId
                  ? t('taskDetailUi.customFormLabel')
                  : (row.opinionData?.comment ?? row.action ?? '-')
              }}
            </template>
          </el-table-column>
          <el-table-column :label="t('taskDetailUi.approvalTimeLabel')" width="132">
            <template #default="{ row }">
              {{ formatWhen(row.endTime ?? row.createTime) || '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="96">
            <template #default="{ row }">
              <span
                class="people-status"
                :class="`people-status--${getApprovalResultType(row.approvalResult)}`"
              >
                {{ getApprovalResultLabel(row.approvalResult) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openOpinionDetailRow(row)">
                {{ t('common.view') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </el-card>
</template>

<style scoped>
/* 详情页签与表格使用同一内容宽度，原生页签保留键盘切换。 */
.instance-flow-panel {
  box-sizing: border-box;
  margin-bottom: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.instance-flow-panel :deep(.el-card__body) {
  padding: 0;
}
.instance-flow-panel :deep(.el-tabs__header) {
  height: 36px;
  margin-bottom: 12px;
  background: var(--sw-bg-white, #fff);
}
.instance-flow-panel :deep(.el-tabs__nav-wrap),
.instance-flow-panel :deep(.el-tabs__nav-scroll),
.instance-flow-panel :deep(.el-tabs__nav) {
  height: 36px;
}
.instance-flow-panel :deep(.el-tabs__nav) {
  display: flex;
  gap: 12px;
  padding-left: 0;
}
.instance-flow-panel :deep(.el-tabs__active-bar),
.instance-flow-panel :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.instance-flow-panel :deep(.el-tabs__item) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 32px;
  margin: 2px 0;
  padding: 0 !important;
  border-radius: var(--sw-radius-base);
  color: var(--sw-color-primary);
  font-size: 14px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 22px;
  text-align: center;
}
.instance-flow-panel :deep(.el-tabs__item.is-active) {
  background: var(--sw-color-primary);
  color: #fff;
}
.instance-flow-panel :deep(.detail-tab-label) {
  display: inline-block;
  padding: 0 16px;
  line-height: 22px;
}
.instance-flow-panel :deep(.detail-tab-label--people) {
  padding: 0 12px;
}
/* 流转记录与审批详情列表共用同一套表格几何与字体；表格铺满卡片，四周不留白。 */
.instance-flow-panel :deep(.detail-flow-table) {
  box-sizing: border-box;
  width: 100% !important;
  margin: 0;
  border: 1px solid var(--sw-border-light);
  color: var(--sw-text-primary);
  font-size: 14px;
}
.instance-flow-panel :deep(.detail-flow-table .el-table__header-wrapper th) {
  height: 42px;
  padding: 0;
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-size: 12px;
  font-weight: 400;
}
.instance-flow-panel :deep(.detail-flow-table .el-table__body-wrapper td) {
  height: 39px;
  padding: 0;
}
/* 90:311：审批详情表独立几何——表头 34、行 53；流转记录与会签记录沿用上面的共用值。 */
.instance-flow-panel :deep(.detail-approval-table .el-table__header-wrapper th) {
  height: 34px;
}
.instance-flow-panel :deep(.detail-approval-table .el-table__body-wrapper td) {
  height: 53px;
}
.instance-flow-panel :deep(.detail-flow-table .cell) {
  padding: 0 16px;
  line-height: 20px;
}
.instance-flow-panel :deep(.el-dialog .people-group__pending) {
  color: #a0a9bb;
}
/* 设计：状态列为彩色文字（非胶囊） */
.people-status {
  font-size: 13px;
}
.people-status--success {
  color: #12aa83;
}
.people-status--danger {
  color: #ef5d71;
}
.people-status--info {
  color: var(--sw-text-secondary);
}
/* ─── 会签聚合入口（设计 60:190）：多人节点一行聚合，右缘查看全部 ─── */
.sign-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 4px;
}
.sign-group {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafbfd;
  cursor: pointer;
  text-align: left;
}
.sign-group:hover {
  border-color: var(--sw-color-primary, #409eff);
}
.sign-group__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.sign-group__stats {
  display: inline-flex;
  gap: 12px;
  font-size: 13px;
}
.sign-group__stat {
  color: var(--sw-text-secondary);
}
.sign-group__stat--success {
  color: #12aa83;
}
.sign-group__stat--danger {
  color: #ef5d71;
}
.sign-group__link {
  margin-left: auto;
  font-size: 13px;
  color: var(--sw-color-primary, #409eff);
}
/* ─── 会签记录弹窗（设计 60:190）：说明 + 筛选 + 统计行 ─── */
.p53-sign-dialog__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.p53-sign-dialog__head p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.p53-sign-panel {
  padding: 0 24px 20px;
}
.p53-sign-stats {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.p53-sign-stats .is-success {
  color: #12aa83;
}
.p53-sign-stats .is-danger {
  color: #ef5d71;
}
.p53-sign-stats__rule {
  margin-left: 12px;
  font-size: 12px;
}
/* 表格页签无内边距；仅空态提示保留与卡片边缘的间距。 */
.instance-flow-panel :deep(.el-tab-pane > .el-alert) {
  margin: 12px 16px;
}
/* ─── 流程图 tab：设计壳层（网格底 / 圆角画布 / 右侧当前节点状态卡） ─── */
.p53-graph-shell {
  min-height: 320px;
  padding: 12px 16px 16px;
}
.p53-graph-shell > .el-alert {
  margin-bottom: 12px;
}
.p53-graph-canvas {
  position: relative;
}
.p53-graph-canvas :deep(.pg-view) {
  border-color: var(--sw-border-lighter);
  border-radius: 10px;
  background: #fbfdff;
}
.p53-graph-canvas :deep(.pg-view)::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(#eef2f8 1px, transparent 1px),
    linear-gradient(90deg, #eef2f8 1px, transparent 1px);
  background-size: 24px 24px;
}
.p53-graph-canvas :deep(.pg-svg),
.p53-graph-canvas :deep(.pg-legend),
.p53-graph-canvas :deep(.pg-zoom),
.p53-graph-canvas :deep(.pg-compat-alert) {
  z-index: 1;
}
.p53-graph-canvas :deep(.pg-zoom) {
  box-sizing: border-box;
  width: 183px;
  height: 78px;
  right: 22px;
  bottom: 38px;
  padding: 11px 18px 15px;
}
.p53-graph-canvas :deep(.pg-zoom__row) {
  width: 151px;
  justify-content: flex-start;
}
.p53-graph-canvas :deep(.pg-zoom__row:last-child) {
  transform: translateY(4px);
}
.p53-graph-canvas :deep(.pg-zoom__locate) {
  padding-left: 0;
  padding-right: 0;
}
.p53-graph-canvas :deep(.pg-node-label) {
  transform: translateX(2.25px);
}
/* 设计（节点19）：画布右侧双卡（当前节点 / 节点状态） */
.p53-graph-rail {
  position: absolute;
  top: 50px;
  right: 23px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 44px;
  width: 182px;
}
.p53-graph-status {
  box-sizing: border-box;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: #fff;
}
.p53-graph-status small {
  display: block;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-graph-status strong {
  display: block;
  margin-top: 14px;
  font-size: 16px;
  color: var(--sw-color-primary);
}
.p53-graph-status span {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: var(--sw-text-primary);
}
.p53-graph-status span + span {
  color: var(--sw-text-secondary);
}
.p53-graph-legend {
  box-sizing: border-box;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: #fff;
}
.p53-graph-legend strong {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--sw-text-primary);
}
.p53-graph-legend__chip {
  display: inline-block;
  box-sizing: border-box;
  width: 104px;
  padding: 4px 0;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.p53-graph-legend__chip + .p53-graph-legend__chip {
  margin-top: 10px;
}
.p53-graph-legend__chip--completed {
  background: #e6f8f2;
  color: #15a77f;
}
.p53-graph-legend__chip--current {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.p53-graph-legend__chip--pending {
  background: #f0f3f9;
  color: #8a96ad;
}
/* ─── 意见详情弹窗：设计几何（60:48：760 宽 / 圆角 14 / 头部 meta / 意见面板 / 底部 80×32 关闭） ─── */
.instance-flow-panel :deep(.p53-opinion-dialog) {
  margin-top: 182px !important;
  margin-bottom: auto;
}
.instance-flow-panel :deep(.p53-opinion-dialog.el-dialog) {
  height: 660px;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.instance-flow-panel :deep(.p53-opinion-dialog .el-dialog__body) {
  flex: 1 1 auto;
  overflow: auto;
}
.instance-flow-panel :deep(.p53-opinion-dialog) {
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
}
.instance-flow-panel :deep(.p53-opinion-dialog .el-dialog__header) {
  box-sizing: border-box;
  height: 122px;
  padding: 20px 28px;
  margin-right: 0;
  border-bottom: 1px solid var(--sw-border-light);
}
.p53-opinion-dialog__head h2 {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.2;
  color: var(--sw-text-primary);
}
.p53-opinion-dialog__head b {
  font-size: 13px;
  color: var(--sw-text-primary);
}
.p53-opinion-dialog__head p {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.instance-flow-panel :deep(.p53-opinion-dialog .el-dialog__body) {
  max-height: 484px;
  padding: 4px 28px 0;
  overflow: auto;
}
.instance-flow-panel :deep(.p53-opinion-dialog .el-dialog__footer) {
  box-sizing: border-box;
  padding: 16px 28px 20px;
  border-top: none;
}
.instance-flow-panel :deep(.p53-opinion-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
}
.p53-opinion-panel {
  box-sizing: border-box;
  height: 438px;
  padding: 15px 19px 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: var(--sw-fill-base);
}
.p53-opinion-panel h3 {
  margin: 0 0 17px;
  font-size: 16px;
  color: var(--sw-text-primary);
}
.p53-opinion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px 80px;
  row-gap: 25px;
}
.p53-opinion-panel > label {
  display: block;
  margin: 14px 0 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-grid + label {
  margin-top: 19px;
  margin-bottom: 7px;
}
.p53-opinion-comment + label {
  margin-top: 16px;
  margin-bottom: 6px;
}
.p53-opinion-grid label {
  display: block;
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-grid b {
  font-size: 14px;
  color: var(--sw-text-primary);
}
.p53-opinion-comment {
  min-height: 46px;
  padding: 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sw-text-primary);
  white-space: pre-wrap;
}
.p53-opinion-checks {
  display: grid;
  grid-template-columns: repeat(3, 210px);
  gap: 18px;
}
.p53-opinion-checks b {
  box-sizing: border-box;
  height: 24px;
  padding: 4px 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eaf8f2;
  color: var(--sw-success, #08a879);
  font-size: 12px;
  font-weight: 400;
  text-align: center;
  word-break: break-all;
}
.p53-opinion-attachment-row {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  height: 36px;
  margin-top: 17px;
}
.p53-opinion-attachment-row > label {
  width: 58px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-attachment {
  display: inline-flex;
  width: 280px;
  height: 36px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 7px;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-size: 12px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
