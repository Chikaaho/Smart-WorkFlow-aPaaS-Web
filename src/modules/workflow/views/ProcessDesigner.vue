<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import ApproverCandidatesDialog from './ApproverCandidatesDialog.vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global HTMLElement, ResizeObserver, SVGElement, SVGSVGElement, WheelEvent, PointerEvent, DragEvent, KeyboardEvent, MouseEvent, window, document */
/**
 * ProcessDesigner — 第一方流程设计器页（I3 §4.1：节点拖入/移动/连线/选择/删除/
 * 属性配置/缩放平移适配/撤销/保存/校验/发布/错误定位）。
 *
 * 节点面板与配置字段全部来自统一节点能力端点的服务端契约；
 * 前端不维护平行节点目录，也不解释引擎私有格式。
 * 图契约 = ProcessGraph（contractVersion=2 显式坐标），保存/校验/发布/查看同权威。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, EditPen, Monitor, Setting } from '@element-plus/icons-vue'
import {
  getProcessDefDefinition,
  getProcessNodeCapabilities,
  saveProcessDefGraph,
  publishProcessDef,
  validateProcessDefGraph,
} from '@/modules/workflow/api'
import type { GraphValidationError, ApproverCandidate } from '@/modules/workflow/api'
import type { BpmNodeCapability, BpmNodeConfigField } from '@/contracts/bpm-node'
import type { ProcessGraphDocument, ProcessGraphWaypoint } from '@/contracts/process-graph'
import { createDesignerModel, buildEdgePath } from '@/adapters/process-graph'
import type { DesignerModel, PositionedEdge, PositionedNode } from '@/adapters/process-graph'

const route = useRoute()
const router = useRouter()
const defId = computed(() => String(route.params.defId))
/** 从表单工作台进入时，左上角返回该表单的「关联流程」页签。 */
const returnFormId = computed(() =>
  route.query?.from === 'form-workbench' && typeof route.query?.formId === 'string'
    ? route.query.formId
    : '',
)

const loading = ref(false)
const errorMsg = ref('')
/** 设计器图文档 + 定义级展示元数据（formName/formDefId 节点13 advancedConfig，均由下发 payload 承载）。 */
type DesignerGraph = ProcessGraphDocument & {
  formName?: string
  formDefId?: string
  advancedConfig?: GraphAdvancedConfig
}
const graph = ref<DesignerGraph | null>(null)
const capabilities = ref<BpmNodeCapability[]>([])
let model: DesignerModel | null = null
const version = ref(0) // 触发视图刷新的快照 serial

const SNAP_X = 20
const SNAP_Y = 20

/** P53 设计稿专用节点几何；其它流程图继续使用适配器默认尺寸。 */
const P53_NODE_WIDTH = 160
const P53_NODE_HEIGHT = 50
const P53_GATEWAY_RADIUS = 22

function snapshot() {
  version.value++
}

/* ─────────── 画布视口 ─────────── */
const CANVAS_W = 1200
const CANVAS_H = 620
const viewBox = ref({ x: -40, y: -40, w: CANVAS_W, h: CANVAS_H })
const panSession = ref<{
  px: number
  py: number
  vb: { x: number; y: number; w: number; h: number }
} | null>(null)

function screenToGraph(event: MouseEvent): { x: number; y: number } {
  const svgEl = svgRef.value
  if (!svgEl) return { x: 0, y: 0 }
  const rect = svgEl.getBoundingClientRect()
  return {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
}

function zoomView(factor: number) {
  fitZoom.value = Math.min(4, Math.max(0.2, fitZoom.value / factor))

  const current = viewBox.value
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const w = Math.min(6000, Math.max(240, current.w * factor))
  const h = (w / current.w) * current.h
  viewBox.value = { x: cx - w / 2, y: cy - h / 2, w, h }
}

function fitViewport() {
  if (!model) return
  const state0 = model.state()
  const xs = state0.nodes.map((n) => n.x)
  const ys = state0.nodes.map((n) => n.y)
  if (!xs.length) {
    viewBox.value = { x: -40, y: -40, w: CANVAS_W, h: CANVAS_H }
    return
  }
  // 适应画布 = 内容包围盒在视口内等比缩放并居中；避免左侧固定锚位在大画布上偏右。
  const svgEl = svgRef.value
  const elW = svgEl ? svgEl.clientWidth || CANVAS_W : CANVAS_W
  const elH = svgEl ? svgEl.clientHeight || CANVAS_H : CANVAS_H
  const margin = 40
  const minX = Math.min(...xs) - P53_NODE_WIDTH / 2
  const minY = Math.min(...ys) - P53_NODE_HEIGHT / 2
  const bw = Math.max(Math.max(...xs) - Math.min(...xs) + P53_NODE_WIDTH, 1)
  const bh = Math.max(Math.max(...ys) - Math.min(...ys) + P53_NODE_HEIGHT, 1)
  const ratio = Math.min(1, (elW - margin * 2) / bw, (elH - margin * 2) / bh)
  const zoom = Math.max(ratio, 0.2)
  const viewportW = elW / zoom
  const viewportH = elH / zoom
  fitZoom.value = zoom
  viewBox.value = {
    x: minX - (viewportW - bw) / 2,
    y: minY - (viewportH - bh) / 2,
    w: viewportW,
    h: viewportH,
  }
}

const svgRef = ref<SVGSVGElement | null>(null)

/* ─────────── P53 设计还原展示态（纯展示，无业务逻辑） ─────────── */

/** 画布缩放百分比（由视口宽度换算，CANVAS_W = 100%）。 */
const fitZoom = ref(1)
const zoomPercent = computed(() => Math.round(fitZoom.value * 100))

/** 流程高级配置弹窗（P53 节点13）：只读呈现已加载定义的真实信息，不新增任何端点。 */
const advancedConfigVisible = ref(false)

/** 草稿已保存时钟（头部文案；以定义加载时刻起算）。 */
const savedAtText = ref('')
function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 表单设计页签：进入绑定表单的设计器（fixture 提供 formDefId；真实后端同形）。 */
function goBoundFormDesigner(): void {
  const formDefId = (graph.value as { formDefId?: string } | null)?.formDefId
  if (formDefId) void router.push(`/form/designer/${formDefId}`)
}

/** 高级配置元数据（定义 payload 的 advancedConfig 扩展；缺省展示占位符）。 */
interface GraphAdvancedConfig {
  startListener?: string
  completeListener?: string
  notifyTargets?: string
  notifyChannels?: string[]
  notifyTemplate?: string
  preMode?: string
  preHandler?: string
  prePurpose?: string
  preFailure?: string
  postMode?: string
  postHandler?: string
  postPurpose?: string
  postFailure?: string
}
const advConfig = computed<GraphAdvancedConfig | undefined>(
  () => (graph.value as { advancedConfig?: GraphAdvancedConfig } | null)?.advancedConfig,
)
const advChannels = computed(() => advConfig.value?.notifyChannels ?? [])

/** 保存配置（设计13 footer）：走既有流程草稿保存链路，关闭弹窗。 */
function onSaveAdvancedConfig() {
  advancedConfigVisible.value = false
  void save()
}

/** 选中节点 config 元数据（节点编号/审批方式/监听器；定义下发，只读展示）。 */
interface NodeListenerMeta {
  phase: 'before' | 'after'
  label: string
  bean: string
  note: string
}
const nodeMeta = computed<{
  nodeKey: string
  approveMode: string
  approverName: string
  listeners: NodeListenerMeta[]
}>(() => {
  const config = (selectedNode.value?.config ?? {}) as Record<string, unknown>
  const listeners = Array.isArray(config.listeners) ? (config.listeners as NodeListenerMeta[]) : []
  return {
    nodeKey: typeof config.nodeKey === 'string' ? config.nodeKey : '',
    approveMode: typeof config.approveMode === 'string' ? config.approveMode : '',
    approverName: typeof config.approverName === 'string' ? config.approverName : '',
    listeners,
  }
})

/* ─────────── 节点/连线交互状态 ─────────── */

const selectionId = ref<string | null>(null)
const dragState = ref<{ id: string; dx: number; dy: number; type: 'node' | 'edge' } | null>(null)
const pendingConnectNode = ref<string | null>(null)
const pendingConnectPos = ref<{ x: number; y: number } | null>(null)
const pendingConnectTarget = ref<{ x: number; y: number } | null>(null)
/** 点选式连线的起点屏幕坐标（区分“点了锚”与“拖了线”）。 */
const pendingConnectStartScreen = ref<{ x: number; y: number } | null>(null)

function onWheel(event: WheelEvent) {
  event.preventDefault()
  // V011-BUG-024：滚轮/触控板滑动=平移画布（Shift=横向、deltaX 跟随触控板）；
  // Ctrl/Cmd+滚轮（触控板捏合合成 ctrlKey）=缩放，与缩放控件/适应画布并存。
  if (event.ctrlKey || event.metaKey) {
    zoomView(event.deltaY > 0 ? 1.1 : 1 / 1.1)
    return
  }
  const svgEl = svgRef.value
  if (!svgEl) return
  const rect = svgEl.getBoundingClientRect()
  const ratio = viewBox.value.w / rect.width
  const dx = event.shiftKey ? event.deltaY : event.deltaX
  const dy = event.shiftKey ? 0 : event.deltaY
  viewBox.value = {
    ...viewBox.value,
    x: viewBox.value.x + dx * ratio,
    y: viewBox.value.y + dy * ratio,
  }
}

function onBgPointerDown(event: PointerEvent) {
  const target = event.target as SVGElement
  if (target.tagName === 'svg' || target.classList.contains('pg-bg')) {
    pendingConnectNode.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    model?.select(null)
    panSession.value = { px: event.clientX, py: event.clientY, vb: { ...viewBox.value } }
  }
}

function onPointerMove(event: PointerEvent) {
  if (panSession.value) {
    const svgEl = svgRef.value
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const ratio = panSession.value.vb.w / rect.width
    viewBox.value = {
      ...panSession.value.vb,
      x: panSession.value.vb.x - (event.clientX - panSession.value.px) * ratio,
      y: panSession.value.vb.y - (event.clientY - panSession.value.py) * ratio,
    }
    return
  }
  // 拖动节点
  if (dragState.value && model) {
    const point = screenToGraph(event)
    const snapped = {
      x: Math.round(point.x / SNAP_X) * SNAP_X,
      y: Math.round(point.y / SNAP_Y) * SNAP_Y,
    }
    model.moveNode(dragState.value?.id ?? '', snapped.x, snapped.y)
    snapshot()
    return
  }
  // 连线拖拽：跟随指针更新预览终点
  if (pendingConnectNode.value) {
    pendingConnectTarget.value = screenToGraph(event)
  }
  // V011-BUG-025 连线编辑：端点拖拽预览 / 拐点拖动实时改形
  if (edgeEdit.value && model) {
    const edit = edgeEdit.value
    const p = screenToGraph(event)
    if (edit.kind === 'waypoint') {
      const edge = model.state().edges.find((candidate) => candidate.id === edit.edgeId)
      if (edge) {
        const next = [...edge.waypoints]
        next[edit.activeIndex] = p
        model.setEdgeWaypoints(edge.id, next)
        snapshot()
      }
      return
    }
    edgeEditPoint.value = p
  }
}

function clickedOnSourcePort(start: { x: number; y: number } | null, event: PointerEvent): boolean {
  return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
}

/** 统一落点判定：DOM 命中优先，透明命中路径遮挡时回退图坐标就近节点（60px）。 */
function resolveConnectDropTarget(event: PointerEvent): string | null {
  if (!model) return null
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const domTarget = element?.closest('g[data-node-id]')?.getAttribute('data-node-id') ?? null
  if (domTarget) return domTarget
  const svgEl = svgRef.value
  if (!svgEl) return null
  const rect = svgEl.getBoundingClientRect()
  const point = {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
  let bestDistance = Number.MAX_SAFE_INTEGER
  let target: string | null = null
  for (const node of model.state().nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y)
    if (distance < 60 && distance < bestDistance) {
      bestDistance = distance
      target = node.id
    }
  }
  return target
}

function onPointerUp(event: PointerEvent) {
  // V011-BUG-025：连线编辑收尾——端点落点改接（自环/重复边/空放均还原），拐点已实时落模型
  if (edgeEdit.value && model) {
    const edit = edgeEdit.value
    if (edit.kind === 'endpoint') {
      const targetId = resolveConnectDropTarget(event)
      const applied =
        targetId && targetId !== edit.otherEndId
          ? model.setEdgeEndpoint(edit.edgeId, edit.which ?? 'target', targetId)
          : null
      if (applied) snapshot()
    }
    edgeEdit.value = null
    edgeEditFrom.value = null
    edgeEditPoint.value = null
    panSession.value = null
    dragState.value = null
    return
  }
  // 连线落点统一判定（拖放与 sticky 点选共用）：
  // 命中其他节点 → 建立连线；仍点在源锚上 → sticky 挂起；其余 → 取消
  if (pendingConnectNode.value && model) {
    const onSourcePort = clickedOnSourcePort(pendingConnectStartScreen.value, event)
    const targetId = resolveConnectDropTarget(event)
    if (targetId && targetId !== pendingConnectNode.value) {
      model.connect(pendingConnectNode.value, targetId)
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
      snapshot()
    } else if (onSourcePort) {
      // sticky：保持挂起，等待目标节点点击
    } else {
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
    }
  }
  panSession.value = null
  dragState.value = null
}

function selectNode(id: string | null) {
  selectionId.value = id
  model?.select(id)
}

const canvasNodes = computed(() => {
  void version.value
  return (model?.state().nodes ?? []) as PositionedNode[]
})
const canvasEdges = computed(() => {
  void version.value
  return model?.state().edges ?? []
})

function startNodeDrag(event: PointerEvent, node: PositionedNode) {
  const point = screenToGraph(event)
  dragState.value = { id: node.id, dx: point.x - node.x, dy: point.y - node.y, type: 'node' }
  selectNode(node.id)
}

function onNodePointerUp(event: PointerEvent, node: PositionedNode) {
  // 连线拖拽（pending 模式）结束时落到节点 → connect
  if (pendingConnectNode.value && pendingConnectNode.value !== node.id && model) {
    model.connect(pendingConnectNode.value, node.id)
    pendingConnectNode.value = null
    pendingConnectPos.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    snapshot()
  }
  void event
}

/** 节点四向锚点坐标（V011-BUG-023）：上下左右缘中点。 */
function sidePoint(node: PositionedNode, side: 'left' | 'right' | 'top' | 'bottom') {
  switch (side) {
    case 'left':
      return { x: node.x - P53_NODE_WIDTH / 2, y: node.y }
    case 'right':
      return { x: node.x + P53_NODE_WIDTH / 2, y: node.y }
    case 'top':
      return { x: node.x, y: node.y - P53_NODE_HEIGHT / 2 }
    default:
      return { x: node.x, y: node.y + P53_NODE_HEIGHT / 2 }
  }
}

/** 从节点四向锚点发起连线（V011-BUG-023，ProcessOn 口径）。
 * 双模式：拖到目标节点放下，或点击锚后（sticky）再点击目标节点完成连接；
 * 预览/连线端点侧由 edgeEndpoints 按几何方向自动选择。 */
function startConnect(
  event: PointerEvent,
  node: PositionedNode,
  side: 'left' | 'right' | 'top' | 'bottom',
) {
  event.stopPropagation()
  const point = screenToGraph(event)
  pendingConnectNode.value = node.id
  pendingConnectPos.value = sidePoint(node, side)
  pendingConnectTarget.value = point
  pendingConnectStartScreen.value = { x: event.clientX, y: event.clientY }
}

/** 点击连线选中（删除所选可移除）。 */
function selectEdge(event: PointerEvent, edgeId: string) {
  event.stopPropagation()
  selectionId.value = edgeId
  model?.select(edgeId)
}

/* ── V011-BUG-025 连线编辑：端点拖拽改接 / 线上按住拖动插入·移动拐点 ── */

type PathPoint = { x: number; y: number }

/** 解析折线 path d（M/L 序列）为点序列。 */
function pathPoints(d: string): PathPoint[] {
  const points: PathPoint[] = []
  const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
  let match = re.exec(d)
  while (match) {
    points.push({ x: Number(match[1]), y: Number(match[2]) })
    match = re.exec(d)
  }
  return points
}

function pointDist(a: PathPoint, b: PathPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 点到线段距离与所在段下标（points[i]→points[i+1] 为第 i 段）。 */
function nearestSegment(points: PathPoint[], p: PathPoint) {
  let best = Number.MAX_SAFE_INTEGER
  let idx = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    const t =
      len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
    const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + t * aby))
    if (d < best) {
      best = d
      idx = i
    }
  }
  return idx
}

const edgeEdit = ref<null | {
  edgeId: string
  kind: 'endpoint' | 'waypoint'
  which?: 'source' | 'target'
  otherEndId: string
  originalWaypoints: ProcessGraphWaypoint[]
  activeIndex: number
}>(null)
/** 端点拖拽预览：起点（对端固定点）与指针跟随点。 */
const edgeEditFrom = ref<PathPoint | null>(null)
const edgeEditPoint = ref<PathPoint | null>(null)

function beginEndpointDrag(event: PointerEvent, edge: PositionedEdge, which: 'source' | 'target') {
  const points = pathPoints(edge.path)
  if (points.length < 2) return
  edgeEdit.value = {
    edgeId: edge.id,
    kind: 'endpoint',
    which,
    otherEndId: which === 'source' ? edge.targetId : edge.sourceId,
    originalWaypoints: [...edge.waypoints],
    activeIndex: -1,
  }
  edgeEditFrom.value = which === 'source' ? points[points.length - 1] : points[0]
  edgeEditPoint.value = screenToGraph(event)
}

function beginWaypointDragFrom(edge: PositionedEdge, index: number) {
  edgeEdit.value = {
    edgeId: edge.id,
    kind: 'waypoint',
    otherEndId: '',
    originalWaypoints: edge.waypoints.map((point) => ({ ...point })),
    activeIndex: index,
  }
}

// （模板拐点手柄与线内命中复用 beginWaypointDragFrom；originalWaypoints 供空放还原）

/** 选中连线按下：端点命中→改接拖拽；拐点命中→移动；否则最近线段插入拐点
 * （插入点在线上，形状先不变，拖动才变形）。 */
function onEdgePointerDown(event: PointerEvent, edge: PositionedEdge) {
  const alreadySelected = selectionId.value === edge.id
  selectEdge(event, edge.id)
  if (!alreadySelected) return
  if (!model) return
  const p = screenToGraph(event)
  const points = pathPoints(edge.path)
  if (points.length < 2) return
  if (pointDist(p, points[0]) < 12) {
    beginEndpointDrag(event, edge, 'source')
    return
  }
  if (pointDist(p, points[points.length - 1]) < 12) {
    beginEndpointDrag(event, edge, 'target')
    return
  }
  for (let i = 0; i < edge.waypoints.length; i++) {
    if (pointDist(p, edge.waypoints[i]) < 10) {
      beginWaypointDragFrom(edge, i)
      return
    }
  }
  const segIdx = nearestSegment(points, p)
  const next = [...edge.waypoints]
  next.splice(segIdx, 0, p)
  const originalWaypoints = edge.waypoints.map((point) => ({ ...point }))
  model.setEdgeWaypoints(edge.id, next)
  edgeEdit.value = {
    edgeId: edge.id,
    kind: 'waypoint',
    otherEndId: '',
    originalWaypoints,
    activeIndex: segIdx,
  }
  snapshot()
}

// （命中既有拐点直接复用 beginWaypointDragFrom：保留 originalWaypoints 供空放还原）

/* ─────────── 面板/属性 ─────────── */

// P53 节点 12：审批人候选选择（受限真实组件，候选来自服务端接口）。
// 字段识别只依据服务端能力契约的 validation.approverTypes 标记：
// 同时覆盖 mock 结构化 APPROVER 类型与真实契约的兼容 object 字段（审批人（兼容）），
// 不在前端维护平行节点目录，也不硬编码候选用户。
function isApproverSelectionField(field: Pick<BpmNodeConfigField, 'type' | 'validation'>): boolean {
  const approverTypes = field.validation?.['approverTypes']
  return field.type === 'APPROVER' || (Array.isArray(approverTypes) && approverTypes.length > 0)
}

const approverPickerVisible = ref(false)
const approverTargetKey = ref('')
function openApproverPicker(fieldKey: string) {
  approverTargetKey.value = fieldKey
  approverPickerVisible.value = true
}
function onApproverPicked(candidates: ApproverCandidate[]) {
  const fieldKey = approverTargetKey.value
  if (!fieldKey || candidates.length === 0) return
  const field = selectedCapability.value?.configFields.find((f) => f.key === fieldKey)
  if (field && field.type === 'object') {
    // 真实契约兼容 object 字段：回填服务端官方对象形状 {type: DESIGNATED, value: [userId…]}
    // （服务端发布校验与运行时解析均按该形状读取；approvalTypes 取自契约 validation）。
    // 节点12：多选候选 → value = 用户 id 数组（任一人同意语义由策略字段承载）。
    const approverTypes = field.validation?.['approverTypes']
    const approverType =
      Array.isArray(approverTypes) && approverTypes.length > 0
        ? String(approverTypes[0])
        : 'DESIGNATED'
    propForm.value[fieldKey] = JSON.stringify({
      type: approverType,
      value: candidates.map((candidate) => String(candidate.id)),
    })
  } else {
    // mock 结构化 APPROVER 字段保持既有「用户 ID 字符串」语义（隔离测试契约不变）。
    propForm.value[fieldKey] = candidates.map((candidate) => String(candidate.id)).join(',')
  }
  applyProps()
}

/** 当前节点审批人字段已存 id（节点12：选择器打开时回显预选）。 */
const currentApproverIds = computed<number[]>(() => {
  const fieldKey = approverTargetKey.value
  const node = selectionId.value
    ? (canvasNodes.value.find((n) => n.id === selectionId.value) ?? null)
    : null
  if (!fieldKey || !node) return []
  const raw: unknown = (node.config as Record<string, unknown> | undefined)?.[fieldKey]
  let value: unknown = raw
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      value = (JSON.parse(raw) as { value?: unknown }).value
    } catch {
      value = raw
    }
  }
  if (typeof value === 'string') {
    value = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [value]
  return []
})

const selectedNode = computed(() =>
  selectionId.value ? (canvasNodes.value.find((n) => n.id === selectionId.value) ?? null) : null,
)
/** 能力 configFields → 表单草稿（object 类型拆 participant.strategy/value） */
const propForm = ref<Record<string, unknown>>({})

watch(selectedNode, (node) => {
  // object 类型字段（configFields.type === 'object'）回显为 JSON 文本，
  // 避免输入框显示 [object Object]；applyProps 提交前解析回对象。
  if (!node) {
    propForm.value = {}
    return
  }
  const draft: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.config ?? {})) {
    const field = selectedCapability.value?.configFields.find((f) => f.key === key)
    draft[key] =
      field?.type === 'object' && value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value
  }
  propForm.value = draft
})

function applyProps() {
  if (!selectedNode.value || !model) return
  const patch: Record<string, unknown> = { ...propForm.value }
  // object 类型字段以 JSON 文本编辑，提交前解析回对象（服务端契约要求对象形态）
  for (const field of selectedCapability.value?.configFields ?? []) {
    const raw = patch[field.key]
    if (field.type === 'object' && typeof raw === 'string') {
      try {
        patch[field.key] = JSON.parse(raw) as unknown
      } catch {
        // 保留字符串，由服务端校验报错（错误定位回画布）
      }
    }
  }
  model.updateNodeConfig(selectedNode.value.id, patch)
  ElMessage.success(t('workflow.propsUpdated'))
}

function removeSelected() {
  if (!model || !selectionId.value) return
  model.removeSelection()
  selectionId.value = null
  snapshot()
}

function undoEdit() {
  model?.undo()
  selectionId.value = null
  snapshot()
}

interface PaletteDrag {
  capability: BpmNodeCapability
}

function onPaletteDragStart(event: DragEvent, capability: BpmNodeCapability) {
  if (!capability.supports.design) {
    event.preventDefault()
    return
  }
  const drag: PaletteDrag = { capability }
  event.dataTransfer?.setData('application/json', JSON.stringify(drag))
}

function onCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  let capability: BpmNodeCapability | null
  try {
    capability = (JSON.parse(raw) as PaletteDrag).capability ?? null
  } catch {
    capability = null
  }
  if (!capability || !model) return
  const point = screenToGraph(event)
  const x = Math.round(point.x / SNAP_X) * SNAP_X
  const y = Math.round(point.y / SNAP_Y) * SNAP_Y
  // V011-BUG-020：拖放到连线上 = 在该连线中间插入节点（初始 START→END 线可直接
  // 「拖入节点」建流程，无需先选中节点再连线）
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const edgeId = element?.closest('path[data-edge-id]')?.getAttribute('data-edge-id') ?? null
  const nodeId = edgeId
    ? model.insertNodeOnEdge(edgeId, capability.type, capability.displayName, x, y)
    : model.addNode(capability.type, capability.displayName, x, y)
  if (nodeId) selectNode(nodeId)
  snapshot()
}

/** V011-BUG-020：组件库点击添加（拖拽之外的可见创建路径），落点为画布中心。 */
function onWorkbarClick(cap: BpmNodeCapability) {
  if (!cap.supports.design || !model) return
  const x = Math.round((viewBox.value.x + viewBox.value.w / 2) / SNAP_X) * SNAP_X
  const y = Math.round((viewBox.value.y + viewBox.value.h / 2) / SNAP_Y) * SNAP_Y
  const id = model.addNode(cap.type, cap.displayName, x, y)
  selectNode(id)
  snapshot()
}

/* ─────────── 保存 / 校验 / 发布 ─────────── */

const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const validationErrors = ref<GraphValidationError[]>([])

async function save() {
  if (!model || !graph.value || !defId.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    await saveProcessDefGraph(defId.value, model.serialize())
    ElMessage.success(t('common.draftSaved'))
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

async function validate() {
  if (!model || !defId.value) return
  validating.value = true
  validationErrors.value = []
  try {
    // 先保存草稿再校验，保证服务端查询到最新图
    await saveProcessDefGraph(defId.value, model.serialize())
    validationErrors.value = await validateProcessDefGraph(defId.value)
    if (validationErrors.value.length === 0) {
      ElMessage.success(t('workflow.validationPassedNoErrors'))
    }
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('workflow.graphValidationFailed')
  } finally {
    validating.value = false
  }
}

async function publish() {
  if (!defId.value) return
  try {
    await ElMessageBox.confirm(
      t('workflow.publishConfirmMessage'),
      t('common.publishConfirmTitle'),
      {
        get confirmButtonText() {
          return t('workflow.confirmPublishButton')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    await publishProcessDef(defId.value)
    ElMessage.success(t('workflow.publishSucceeded'))
    await load()
  } catch (err) {
    ElMessage.error((err as { msg?: string }).msg ?? t('workflow.publishFailedZeroDeploy'))
  } finally {
    publishing.value = false
  }
}

/** 错误定位：聚焦错误对象（节点/边居中并高亮选择）。 */
function focusError(error: GraphValidationError) {
  const elementId = error.nodeKey ?? error.edgeKey ?? error.elementId ?? ''
  if (!elementId) return
  if (error.edgeKey) {
    selectionId.value = null
    return
  }
  selectNode(elementId)
  const node = canvasNodes.value.find((n) => n.id === elementId)
  if (node) {
    const current = viewBox.value
    viewBox.value = {
      ...current,
      x: node.x - current.w / 2,
      y: node.y - current.h / 2,
    }
  }
}

/* ─────────── 参与人策略（来源：服务端能力 validation.strategies，非前端手抄） ─────────── */

const selectedCapability = computed(() => {
  const node = selectedNode.value as PositionedNode | null
  return node ? (capabilities.value.find((cap) => cap.type === node.type) ?? null) : null
})

/* ─────────── 加载 ─────────── */

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [definition, caps] = await Promise.all([
      getProcessDefDefinition(defId.value),
      getProcessNodeCapabilities(),
    ])
    capabilities.value = caps
    graph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      formName: (definition as { formName?: string }).formName,
      formDefId: (definition as { formDefId?: string }).formDefId,
      advancedConfig: (definition as { advancedConfig?: GraphAdvancedConfig }).advancedConfig,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    } as ProcessGraphDocument
    savedAtText.value = formatClock(new Date())
    savedAtText.value = formatClock(new Date())
    await nextTick()
    if (!graph.value) {
      errorMsg.value = t('workflow.graphDataEmpty')
      return
    }
    model = createDesignerModel(
      graph.value,
      { width: P53_NODE_WIDTH, height: P53_NODE_HEIGHT },
      P53_GATEWAY_RADIUS,
    )
    selectNode(null)
    snapshot()
    fitViewport()
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('workflow.processDefLoadFailed')
  } finally {
    loading.value = false
  }
}

watch(defId, () => void load(), { immediate: true })

let canvasObserver: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // 画布尺寸变化时重新锚定适配（字体/布局就绪后初适配有偏差）
  canvasObserver = new ResizeObserver(() => {
    if (svgRef.value && svgRef.value.clientWidth > 0) fitViewport()
  })
  if (svgRef.value) canvasObserver.observe(svgRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  canvasObserver?.disconnect()
  canvasObserver = null
})

function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName?.match?.(/input|textarea|select/i)) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectionId.value) {
      event.preventDefault()
      removeSelected()
    }
  }
  // 设计09：撤销入口收敛为快捷键（工具栏按设计稿只保留草稿历史/保存/发布）
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoEdit()
  }
}

function backToList() {
  if (returnFormId.value) {
    void router.push({ path: `/form/designer/${returnFormId.value}`, query: { tab: 'processes' } })
    return
  }
  void router.push('/workflow/defs')
}

function nodeLabelLines(label: string) {
  return label.length > 8 ? [label.slice(0, 8), label.slice(8)] : [label]
}
</script>

<template>
  <div class="designer-page">
    <div class="designer-toolbar">
      <el-button class="toolbar-settings" @click="backToList">
        <el-icon><ArrowLeft /></el-icon>
        <span>
          {{ returnFormId ? t('workflow.backToProcessList') : t('form.workbenchSettings') }}
        </span>
      </el-button>
      <span class="designer-crumb">
        / {{ graph?.formName || graph?.name || t('router.processDesigner') }} /
        {{ graph?.name || t('router.processDesigner')
        }}{{ graph?.version ? ` v${graph.version}` : '' }}
      </span>
      <nav class="designer-tabs" aria-label="工作区切换">
        <button type="button" class="designer-tab" @click="goBoundFormDesigner">
          {{ t('form.tabDesign') }}
        </button>
        <button type="button" class="designer-tab is-active">{{ t('form.tabProcesses') }}</button>
      </nav>
      <span class="spacer" />
      <span class="designer-saved">{{ t('form.draftSavedAt', { time: savedAtText }) }}</span>
      <!-- 设计09：右侧操作组 = 草稿历史 + 保存 + 发布（撤销/删除/适配保留在画布缩放控件与快捷键） -->
      <div class="toolbar-actions">
        <el-button size="small" class="toolbar-drafts">{{ t('form.draftHistory') }}</el-button>
        <el-button size="small" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        <el-button size="small" type="primary" :loading="publishing" @click="publish">{{
          t('common.publish')
        }}</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="designer-alert"
    />

    <!-- P53 设计（节点09）：节点能力工具条（顶部横排，替代原左侧纵栏） -->
    <div class="designer-workbar">
      <div
        v-for="cap in capabilities"
        :key="cap.type"
        class="workbar-item"
        :class="{ 'workbar-item--disabled': !cap.supports.design }"
        :draggable="cap.supports.design"
        @dragstart="onPaletteDragStart($event, cap)"
        @click="onWorkbarClick(cap)"
      >
        <svg class="workbar-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <template v-if="cap.type === 'START'">
            <path d="M6.667 3.333L16.667 10L6.667 16.667V3.333Z" />
          </template>
          <template v-else-if="cap.type === 'DRAFT'">
            <path
              d="M11.667 2.5H3.333V17.5H16.667V7.5H11.667V2.5ZM9.167 13.333L15.833 6.667L17.5 8.333L10.833 15L8.333 15.833L9.167 13.333Z"
            />
          </template>
          <template v-else-if="cap.type === 'APPROVAL'">
            <path
              d="M17.5 11.667C18.881 11.667 20 10.547 20 9.167C20 7.786 18.881 6.667 17.5 6.667C16.119 6.667 15 7.786 15 9.167C15 10.547 16.119 11.667 17.5 11.667Z"
            />
            <path
              d="M10.833 18.333C10.833 17.228 11.272 16.168 12.054 15.387C12.835 14.606 13.895 14.167 15 14.167C16.105 14.167 17.165 14.606 17.946 15.387C18.728 16.168 19.167 17.228 19.167 18.333"
            />
          </template>
          <template v-else-if="cap.type === 'CONSENSUS'">
            <path
              d="M12.5 9.167C14.341 9.167 15.833 7.674 15.833 5.833C15.833 3.992 14.341 2.5 12.5 2.5C10.659 2.5 9.167 3.992 9.167 5.833C9.167 7.674 10.659 9.167 12.5 9.167Z"
            />
            <path
              d="M3.333 17.5C3.333 15.732 4.036 14.036 5.286 12.786C6.536 11.536 8.232 10.833 10 10.833C11.768 10.833 13.464 11.536 14.714 12.786C15.964 14.036 16.667 15.732 16.667 17.5"
            />
          </template>
          <template v-else-if="cap.type === 'CONDITION'">
            <path d="M12 1.667L20.333 10L12 18.333L3.667 10L12 1.667Z" />
          </template>
          <template v-else-if="cap.type === 'NOTIFICATION'">
            <path d="M11.667 1.667H4.167V18.333H15.833V5.833L11.667 1.667V1.667Z" />
          </template>
          <template v-else-if="cap.type === 'IOT_COMMAND'">
            <path
              d="M13.333 5H6.667C5.746 5 5 5.746 5 6.667V13.333C5 14.254 5.746 15 6.667 15H13.333C14.254 15 15 14.254 15 13.333V6.667C15 5.746 14.254 5 13.333 5Z"
            />
            <path
              d="M7.5 1.667V5M12.5 1.667V5M7.5 15V18.333M12.5 15V18.333M1.667 7.5H5M1.667 12.5H5M15 7.5H18.333M15 12.5H18.333"
            />
          </template>
          <template v-else-if="cap.type === 'AGENT'">
            <path
              d="M15 4.167H5C3.619 4.167 2.5 5.286 2.5 6.667V14.167C2.5 15.547 3.619 16.667 5 16.667H15C16.381 16.667 17.5 15.547 17.5 14.167V6.667C17.5 5.286 16.381 4.167 15 4.167Z"
            />
            <path d="M10 1.667V4.167M6.667 8.333H6.75M13.333 8.333H13.417M6.667 12.5H13.333" />
          </template>
          <template v-else>
            <path
              d="M15 3.333H5C4.079 3.333 3.333 4.08 3.333 5V15.833C3.333 16.754 4.079 17.5 5 17.5H15C15.92 17.5 16.667 16.754 16.667 15.833V5C16.667 4.08 15.92 3.333 15 3.333Z"
            />
            <path d="M6.667 10L9.167 12.5L13.333 7.5M7.5 1.667H12.5V5H7.5V1.667Z" />
          </template>
        </svg>
        <span class="workbar-name">{{ cap.displayName }}</span>
      </div>
      <span class="workbar-spacer" />
      <el-button size="small" class="workbar-advance" @click="advancedConfigVisible = true">{{
        t('workflow.advancedConfig')
      }}</el-button>
      <el-button size="small" class="workbar-verify" :loading="validating" @click="validate">{{
        t('workflow.validateFlow')
      }}</el-button>
      <svg class="workbar-gear" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M10 13.833C11.841 13.833 13.333 12.341 13.333 10.5C13.333 8.659 11.841 7.167 10 7.167C8.159 7.167 6.667 8.659 6.667 10.5C6.667 12.341 8.159 13.833 10 13.833Z"
        />
        <path
          d="M10 2.167V4.667M10 16.333V18.833M1.667 10.5H4.167M15.833 10.5H18.333M4.167 4.667L5.833 6.333M14.167 14.667L15.833 16.333M4.167 16.333L5.833 14.667M14.167 6.333L15.833 4.667"
        />
      </svg>
    </div>

    <div class="designer-body">
      <!-- 画布（P53 节点09：24px 网格底 + 缩放控件 + 底部操作提示） -->
      <div class="designer-canvas-wrap">
        <svg
          ref="svgRef"
          class="pg-svg"
          :width="'100%'"
          :height="'100%'"
          :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
          @wheel="onWheel"
          @pointerdown="onBgPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dragover.prevent
          @drop="onCanvasDrop"
        >
          <defs>
            <pattern id="designer-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="#e8edf6" stroke-width="1" />
            </pattern>
            <marker
              id="designer-edge-arrow"
              markerUnits="userSpaceOnUse"
              markerWidth="8.5"
              markerHeight="7"
              refX="8.2"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow" />
            </marker>
            <marker
              id="designer-edge-arrow-selected"
              markerUnits="userSpaceOnUse"
              markerWidth="8.5"
              markerHeight="7"
              refX="8.2"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow-selected" />
            </marker>
          </defs>
          <rect class="pg-bg" x="-100000" y="-100000" width="200000" height="200000" />
          <template v-for="edge in canvasEdges" :key="edge.id">
            <path
              :d="edge.path"
              fill="none"
              class="designer-edge"
              :class="{ 'designer-edge-selected': selectionId === edge.id }"
              stroke-width="10"
              stroke="transparent"
              :data-edge-id="edge.id"
              @pointerdown.stop="onEdgePointerDown($event, edge)"
            />
            <path
              :d="edge.path"
              fill="none"
              class="designer-edge-visual"
              :class="{ 'designer-edge-selected': selectionId === edge.id }"
              stroke-width="1.6"
              pointer-events="none"
            />
          </template>
          <path
            v-if="pendingConnectTarget"
            :d="
              buildEdgePath(
                { x: pendingConnectPos?.x ?? 0, y: pendingConnectPos?.y ?? 0 },
                { x: pendingConnectTarget.x, y: pendingConnectTarget.y },
                [],
              )
            "
            fill="none"
            class="designer-edge-pending"
            stroke-dasharray="6 4"
          />
          <!-- V011-BUG-025：端点拖拽预览（对端固定 → 指针） -->
          <path
            v-if="edgeEdit?.kind === 'endpoint' && edgeEditFrom && edgeEditPoint"
            :d="buildEdgePath(edgeEditFrom, edgeEditPoint, [])"
            fill="none"
            class="designer-edge-pending"
            stroke-dasharray="6 4"
          />
          <g
            v-for="node in canvasNodes"
            :key="node.id"
            :transform="
              node.type === 'GATEWAY'
                ? `translate(${node.x - P53_GATEWAY_RADIUS}, ${node.y - P53_GATEWAY_RADIUS})`
                : `translate(${node.x - P53_NODE_WIDTH / 2}, ${node.y - P53_NODE_HEIGHT / 2})`
            "
            class="designer-node"
            :class="{
              'designer-node-selected': selectionId === node.id,
              'designer-node-error': validationErrors.some((e) => e.nodeKey === node.id),
              'designer-node-start': node.type === 'START',
              'designer-node-end': node.type === 'END',
              'designer-node-draft': node.config?.nodeClass === 'draft',
            }"
            :data-node-id="node.id"
            @pointerdown="startNodeDrag($event, node)"
            @pointerup="onNodePointerUp($event, node)"
          >
            <rect
              v-if="node.type !== 'GATEWAY'"
              :width="P53_NODE_WIDTH"
              :height="P53_NODE_HEIGHT"
              rx="8"
              class="designer-node-rect"
            />
            <!-- 设计09：网关为菱形（+号），名称置于菱形右侧 -->
            <template v-else>
              <polygon
                points="22,0 44,22 22,44 0,22"
                class="designer-node-rect designer-node-gateway"
              />
              <path d="M22 10 V34 M10 22 H34" class="designer-node-gateway-plus" />
            </template>
            <!-- V011-BUG-023：四向锚点（上下左右缘中点）均可拖拽/点选拉线（ProcessOn 口径） -->
            <circle
              v-if="selectionId === node.id && node.type !== 'GATEWAY'"
              cx="0"
              :cy="P53_NODE_HEIGHT / 2"
              r="3"
              class="designer-node-port"
              @pointerdown.stop="startConnect($event, node, 'left')"
            />
            <circle
              v-if="selectionId === node.id && node.type !== 'GATEWAY'"
              :cx="P53_NODE_WIDTH"
              :cy="P53_NODE_HEIGHT / 2"
              r="3"
              class="designer-node-port"
              @pointerdown.stop="startConnect($event, node, 'right')"
            />
            <circle
              v-if="selectionId === node.id && node.type !== 'GATEWAY'"
              :cx="P53_NODE_WIDTH / 2"
              cy="0"
              r="3"
              class="designer-node-port"
              @pointerdown.stop="startConnect($event, node, 'top')"
            />
            <circle
              v-if="selectionId === node.id && node.type !== 'GATEWAY'"
              :cx="P53_NODE_WIDTH / 2"
              :cy="P53_NODE_HEIGHT"
              r="3"
              class="designer-node-port"
              @pointerdown.stop="startConnect($event, node, 'bottom')"
            />
            <!-- 设计09：节点图标为锁定 SVG 矢量字形（22×22，起点 (12,14)） -->
            <g
              v-if="node.type !== 'GATEWAY'"
              class="designer-node-icon"
              transform="translate(12 14)"
            >
              <template v-if="node.type === 'START'">
                <path d="M7.333 3.667L18.333 11L7.333 18.333V3.667Z" />
              </template>
              <template v-else-if="node.type === 'END'">
                <path
                  d="M16.5 3.667H5.5C4.488 3.667 3.667 4.488 3.667 5.5V17.417C3.667 18.429 4.488 19.25 5.5 19.25H16.5C17.513 19.25 18.333 18.429 18.333 17.417V5.5C18.333 4.488 17.513 3.667 16.5 3.667Z"
                />
                <path d="M7.333 11L10.083 13.75L14.667 8.25M8.25 1.833H13.75V5.5H8.25V1.833Z" />
              </template>
              <template v-else-if="node.config?.nodeClass === 'draft'">
                <path
                  d="M12.833 2.75H3.667V19.25H18.333V8.25H12.833V2.75ZM10.083 14.667L17.417 7.333L19.25 9.167L11.917 16.5L9.167 17.417L10.083 14.667Z"
                />
              </template>
              <template v-else>
                <path
                  d="M15.583 2.75H3.667C3.16 2.75 2.75 3.16 2.75 3.667V18.333C2.75 18.84 3.16 19.25 3.667 19.25H15.583C16.09 19.25 16.5 18.84 16.5 18.333V3.667C16.5 3.16 16.09 2.75 15.583 2.75Z"
                />
                <path d="M5.5 6.417H12.833M5.5 10.083H11M5.5 13.75H9.167" />
                <path
                  d="M16.5 15.583C18.019 15.583 19.25 14.352 19.25 12.833C19.25 11.315 18.019 10.083 16.5 10.083C14.981 10.083 13.75 11.315 13.75 12.833C13.75 14.352 14.981 15.583 16.5 15.583Z"
                />
                <path
                  d="M11.917 20.167C11.917 18.951 12.4 17.785 13.259 16.926C14.119 16.066 15.285 15.583 16.5 15.583C17.716 15.583 18.881 16.066 19.741 16.926C20.601 17.785 21.083 18.951 21.083 20.167"
                />
              </template>
            </g>
            <text
              v-if="node.type !== 'GATEWAY'"
              :x="42"
              :y="P53_NODE_HEIGHT / 2 + (nodeLabelLines(node.label).length > 1 ? -5 : 2)"
              text-anchor="start"
              class="designer-node-label"
            >
              <tspan
                v-for="(line, lineIndex) in nodeLabelLines(node.label)"
                :key="lineIndex"
                :x="42"
                :dy="lineIndex === 0 ? 0 : 17"
              >
                {{ line }}
              </tspan>
            </text>
            <text
              v-else
              x="54"
              y="41.5"
              text-anchor="start"
              class="designer-node-label designer-node-label--gateway"
            >
              {{ node.label }}
            </text>
          </g>
          <!-- V011-BUG-025：把连线编辑手柄放在节点之后，确保端点不被节点盒遮挡。 -->
          <template v-for="edge in canvasEdges" :key="'handles-' + edge.id">
            <template v-if="selectionId === edge.id">
              <circle
                v-for="(wp, wpIndex) in edge.waypoints"
                :key="'wp-' + edge.id + '-' + wpIndex"
                :cx="wp.x"
                :cy="wp.y"
                r="4.5"
                class="designer-edge-waypoint"
                @pointerdown.stop="beginWaypointDragFrom(edge, wpIndex)"
              />
              <circle
                :cx="pathPoints(edge.path)[0]?.x ?? 0"
                :cy="pathPoints(edge.path)[0]?.y ?? 0"
                r="5"
                class="designer-edge-endpoint"
                @pointerdown.stop="beginEndpointDrag($event, edge, 'source')"
              />
              <circle
                :cx="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.x ?? 0"
                :cy="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.y ?? 0"
                r="5"
                class="designer-edge-endpoint"
                @pointerdown.stop="beginEndpointDrag($event, edge, 'target')"
              />
            </template>
          </template>
        </svg>
        <div class="canvas-zoom">
          <button type="button" class="zoom-btn" @click="zoomView(1 / 1.1)">−</button>
          <span class="zoom-value">{{ zoomPercent }}%</span>
          <button type="button" class="zoom-btn" @click="zoomView(1.1)">＋</button>
          <button type="button" class="zoom-fit" @click="fitViewport">
            {{ t('workflow.fitView') }}
          </button>
        </div>
        <div class="canvas-hint">{{ t('workflow.canvasInteractionHint') }}</div>
      </div>

      <!-- 属性面板：字段由服务端能力 configFields + 参与人策略驱动 -->
      <div class="designer-props">
        <template v-if="selectedNode">
          <div class="props-heading">
            <span class="props-title">{{ t('workflow.nodePropsTitle') }}</span>
            <span class="props-type-chip">{{
              enumLabel('WORKFLOW_NODE_TYPE', selectedNode.type)
            }}</span>
          </div>
          <div class="props-section">{{ t('workflow.basicPropsSection') }}</div>
          <el-form label-position="top" size="small">
            <el-form-item :label="t('workflow.nodeName')">
              <el-input v-model="propForm.name as string" @change="applyProps" />
            </el-form-item>
            <!-- 节点编号 / 审批方式（定义 config 元数据；只读展示） -->
            <el-form-item v-if="nodeMeta.nodeKey" :label="t('workflow.nodeKeyLabel')">
              <el-input :model-value="nodeMeta.nodeKey" disabled />
            </el-form-item>
            <el-form-item v-if="nodeMeta.approveMode" :label="t('workflow.approveModeLabel')">
              <el-input :model-value="nodeMeta.approveMode" disabled />
            </el-form-item>
            <template
              v-for="field in (selectedCapability?.configFields ?? []).filter(
                (f) => f.key !== 'name',
              )"
              :key="field.key"
            >
              <!-- name 已由顶部「节点名称」编辑项承载，能力注册表同名项不再重复渲染 -->
              <el-form-item v-if="isApproverSelectionField(field)" :label="field.label">
                <!-- 设计09：已解析审批人（config.approverName）以 chip+按钮呈现；未解析回退输入框 -->
                <div v-if="nodeMeta.approverName" class="approver-card">
                  <div class="approver-card__row">
                    <span class="approver-card__chip">{{ nodeMeta.approverName }}</span>
                    <el-button
                      size="small"
                      class="approver-card__pick"
                      @click="openApproverPicker(field.key)"
                    >
                      {{ t('workflow.selectApprover') }}
                    </el-button>
                  </div>
                  <small class="approver-card__hint">{{ t('workflow.approverSupportHint') }}</small>
                </div>
                <div v-else class="approver-field">
                  <el-input
                    v-model="propForm[field.key] as string"
                    :placeholder="t('workflow.targetUserIdPlaceholder')"
                    @change="applyProps"
                    @blur="applyProps"
                  />
                  <el-button @click="openApproverPicker(field.key)">
                    {{ t('approverPicker.button') }}
                  </el-button>
                </div>
              </el-form-item>
              <el-form-item v-else-if="field.type === 'object'" :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  :placeholder="t('workflow.objectConfigJsonPlaceholder')"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
              <el-form-item v-else-if="field.type === 'string'" :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
              <el-form-item v-else :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
            </template>
            <el-form-item
              v-if="validationErrors.some((e) => e.nodeKey === selectionId)"
              :label="t('workflow.validationIssues')"
            >
              <el-alert
                v-for="err in validationErrors.filter((e) => e.nodeKey === selectionId)"
                :key="String(err.nodeKey) + err.errorCode"
                type="error"
                :closable="false"
                :title="err.message"
              />
            </el-form-item>
          </el-form>

          <!-- 高级属性 · 监听器配置（定义 config.listeners 元数据；只读展示） -->
          <template v-if="nodeMeta.listeners.length">
            <div class="props-section props-section--advanced">
              {{ t('workflow.listenerSectionTitle') }}
            </div>
            <div
              v-for="(listener, index) in nodeMeta.listeners"
              :key="listener.phase + String(index)"
              class="listener-row"
            >
              <span class="listener-row__phase" :class="'listener-row__phase--' + listener.phase">
                {{
                  listener.phase === 'before'
                    ? t('workflow.listenerBefore')
                    : t('workflow.listenerAfter')
                }}
              </span>
              <span class="listener-row__desc">{{ listener.label }}</span>
              <span v-if="listener.bean" class="listener-row__bean">{{ listener.bean }}</span>
              <span class="listener-row__note">{{ listener.note }}</span>
            </div>
            <div class="listener-add">{{ t('workflow.listenerAdd') }}</div>
          </template>
        </template>
        <el-empty v-else :description="t('workflow.selectNodeToConfigure')" />
      </div>
    </div>

    <!-- 流程高级配置弹窗（P53 节点13 · 只读呈现定义元数据：统一监听器/通知/前置/后置） -->
    <el-dialog
      v-model="advancedConfigVisible"
      class="advanced-config-dialog"
      :title="t('workflow.advancedConfigTitle')"
      width="1054px"
      modal-class="p53-dialog-overlay-37"
    >
      <template #header>
        <div class="advanced-config-heading">
          <h2>{{ t('workflow.advancedConfigTitle') }}</h2>
          <p>{{ t('workflow.advancedConfigSubtitle') }}</p>
        </div>
      </template>
      <div class="advanced-config-grid">
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Setting /></el-icon>
              <h3>{{ t('workflow.advListenersTitle') }}</h3>
            </div>
            <span class="advanced-card__badge">{{ t('workflow.advEnabledBadge') }}</span>
          </div>
          <div class="advanced-rows">
            <span class="advanced-rows__cap">{{ t('workflow.advProcessEvent') }}</span>
            <span>{{ t('workflow.advExecutorListener') }}</span>
            <span class="advanced-rows__cap">{{ t('workflow.advBeforeStart') }}</span>
            <span class="advanced-rows__bean">{{ advConfig?.startListener || '—' }}</span>
            <span class="advanced-rows__cap">{{ t('workflow.advAfterComplete') }}</span>
            <span class="advanced-rows__bean">{{ advConfig?.completeListener || '—' }}</span>
          </div>
          <p class="advanced-card__note">{{ t('workflow.advListenerNote') }}</p>
          <div class="advanced-card__add">{{ t('workflow.advAddListener') }}</div>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Document /></el-icon>
              <h3>{{ t('workflow.advNotifyTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advNotifyTargets') }}</label>
          <div class="static-value">{{ advConfig?.notifyTargets || '—' }}</div>
          <label>{{ t('workflow.advNotifyChannels') }}</label>
          <div class="advanced-chips">
            <span v-for="c in advChannels" :key="c" class="advanced-chips__item">{{ c }}</span>
          </div>
          <p class="advanced-card__meta">{{ t('workflow.advTriggerMoments') }}</p>
          <p class="advanced-card__meta">
            {{ t('workflow.advTemplateLabel', { template: advConfig?.notifyTemplate || '—' }) }}
          </p>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><EditPen /></el-icon>
              <h3>{{ t('workflow.advPreProcessTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advExecMode') }}</label>
          <div class="static-value">{{ advConfig?.preMode || '—' }}</div>
          <label>{{ t('workflow.advHandler') }}</label>
          <div class="static-value">{{ advConfig?.preHandler || '—' }}</div>
          <p class="advanced-card__meta">{{ advConfig?.prePurpose || '—' }}</p>
          <p class="advanced-card__meta">{{ advConfig?.preFailure || '—' }}</p>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Monitor /></el-icon>
              <h3>{{ t('workflow.advPostProcessTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advExecMode') }}</label>
          <div class="static-value">{{ advConfig?.postMode || '—' }}</div>
          <label>{{ t('workflow.advHandler') }}</label>
          <div class="static-value">{{ advConfig?.postHandler || '—' }}</div>
          <p class="advanced-card__meta">{{ advConfig?.postPurpose || '—' }}</p>
          <p class="advanced-card__meta">{{ advConfig?.postFailure || '—' }}</p>
        </section>
      </div>
      <p class="advanced-config-footnote">{{ t('workflow.advFootnote') }}</p>
      <template #footer>
        <div class="advanced-config-footer">
          <el-button size="small" @click="advancedConfigVisible = false"
            >&nbsp;&nbsp;&nbsp;&nbsp;{{
              t('common.cancel')
            }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
          >
          <el-button
            size="small"
            type="primary"
            class="advanced-config-save"
            :loading="saving"
            @click="onSaveAdvancedConfig"
            >&nbsp;&nbsp;&nbsp;&nbsp;{{
              t('workflow.advSaveConfig')
            }}&nbsp;&nbsp;&nbsp;&nbsp;</el-button
          >
        </div>
      </template>
    </el-dialog>

    <!-- 审批人候选选择弹窗（节点 12 受限真实组件） -->
    <div class="approver-dialog-host">
      <ApproverCandidatesDialog
        v-model:visible="approverPickerVisible"
        :initial-ids="currentApproverIds"
        @pick="onApproverPicked"
      />
    </div>

    <!-- 校验错误面板（含 nodeKey/edgeKey 定位入口） -->
    <el-card v-if="validationErrors.length" class="designer-errors">
      <template #header
        ><span>{{
          t('workflow.validationSummary', { count: validationErrors.length })
        }}</span></template
      >
      <div v-for="(err, index) in validationErrors" :key="index" class="designer-error-row">
        <el-tag size="small" type="danger">{{ err.errorCode }}</el-tag>
        <span class="error-message">{{ err.message }}</span>
        <el-button size="small" link type="primary" @click="focusError(err)">
          {{ t('workflow.validationLocateLabel', { target: err.nodeKey ?? err.edgeKey ?? '-' }) }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
/* ==================================================================
   P53 节点09/12/13 设计还原（按 P53 设计包几何移植；
   色值原样搬运：#6F2DFF/#8393B5/#A4ADBE/#E8EDF6/#F8FAFE 等）。
   ================================================================== */
.designer-page {
  display: flex;
  flex-direction: column;
  /* 页面从一级顶栏下方开始；二级导航和工作条属于页面自身，画布必须铺到视口底。 */
  height: calc(100vh - 64px);
  min-height: 560px;
  background: #f7fafc;
  color: #1f2a44;
  font-family: Arial, 'Microsoft YaHei', sans-serif;
  font-size: 14px;
}

/* ── 顶栏（fixture workbar：56px 白底 + 紧凑操作组） ── */
.designer-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  flex: 0 0 56px;
  box-sizing: border-box;
  background: #fff;
  border-bottom: 1px solid #dde3ef;
  color: #8b98af;
  font-size: 12px;
}
/* 设计09：右侧操作组 = 草稿历史 88 / 保存 64 / 发布 64，高 28，间距 8 */
.designer-saved {
  line-height: 16px;
  color: #7e89a1;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-actions :deep(.el-button) {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  line-height: 16px;
}
.toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.toolbar-actions :deep(.toolbar-drafts) {
  width: 88px;
}
.designer-toolbar :deep(.el-divider--vertical) {
  border-left-color: #d7deed;
}
.designer-title {
  font-size: 13px;
  font-weight: 600;
  color: #344164;
}
.designer-key {
  color: #8393b5;
  font-size: 12px;
}
.designer-version.el-tag {
  background: #f0eaff;
  color: #6f2dff;
  border-color: transparent;
  border-radius: 6px;
  font-size: 11px;
}
.toolbar-validation {
  color: var(--el-color-danger);
  font-size: 12px;
}
.designer-toolbar :deep(.el-button.toolbar-iconbtn) {
  width: 28px;
  padding: 0;
}
.designer-toolbar :deep(.el-button) {
  height: 28px;
  padding: 0 12px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  font-size: 12px;
}
.designer-toolbar :deep(.el-button.toolbar-back) {
  height: 32px;
  padding: 0 16px;
}
.designer-toolbar :deep(.el-button--primary) {
  background: #6f2dff;
  border-color: #6f2dff;
  color: #fff;
}
.designer-toolbar :deep(.el-button--primary:hover),
.designer-toolbar :deep(.el-button--primary:focus) {
  background: #5f24e0;
  border-color: #5f24e0;
  color: #fff;
}
.spacer {
  flex: 1;
}
/* 设计09：工作区页签（纯文字 + active 下划线，与表单设计器页签同款） */
.designer-tab {
  height: 56px;
  padding: 0 34px;
  border: 0;
  background: transparent;
  font-size: 14px;
  color: #8a96ad;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.designer-tab.is-active {
  color: var(--sw-color-primary);
  font-weight: 600;
  border-bottom-color: var(--sw-color-primary);
}
.designer-alert {
  margin: 8px 12px;
}

/* ── 左栏节点面板（条目 = 服务端能力契约的真实节点类型） ── */
.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
/* ── P53 设计（节点09）：节点能力工具条（顶部横排） ── */
.designer-workbar {
  display: flex;
  align-items: center;
  height: 65px;
  flex: 0 0 65px;
  gap: 8px;
  box-sizing: border-box;
  padding: 12px 60px 12px 18px;
  background: #fff;
  border-bottom: 1px solid #e1e5ef;
}
.workbar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 96px;
  height: 40px;
  box-sizing: border-box;
  justify-content: flex-start;
  padding: 0 9px;
  border: 1px solid #cbd6e8;
  border-radius: 8px;
  background: #fff;
  color: #344164;
  font-size: 12px;
  cursor: grab;
}
.workbar-item:active {
  cursor: grabbing;
}
.workbar-item--disabled {
  cursor: default;
}
.workbar-icon {
  flex: 0 0 20px;
  display: block;
}
.workbar-icon path {
  fill: none;
  stroke: #6f2dff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.workbar-name {
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
.workbar-spacer {
  flex: 1;
}
.workbar-gear {
  margin-left: 12px;
}
.workbar-gear path {
  fill: none;
  stroke: #7e89a1;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.designer-workbar :deep(.el-button--small) {
  height: 36px;
  line-height: 17px;
}
.workbar-advance,
.designer-workbar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.designer-workbar :deep(.workbar-advance) {
  width: 112px;
  justify-content: flex-start;
  text-align: left;
  padding-left: 11px;
}

.designer-workbar :deep(.el-button.workbar-verify) {
  width: 104px;
  margin-left: 4px;
  justify-content: flex-start;
  text-align: left;
  padding-left: 11px;
}

/* ── 画布（24px 网格 + 缩放控件 + 底部提示条） ── */
.designer-canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  /* P53 节点09：画布底 #F8FAFE + 24px 网格线 #E8EDF6 */
  background: #f8fafe;
}
.pg-bg {
  fill: url(#designer-grid);
}
.canvas-zoom {
  position: absolute;
  right: 28px;
  bottom: 74px;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 225px;
  height: 44px;
  box-sizing: border-box;
  padding: 0 15px;
  background: #fff;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  color: #8190aa;
}
.zoom-btn {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.zoom-value {
  min-width: 38px;
  text-align: center;
  font-size: 13px;
  color: #8190aa;
}
.zoom-fit {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.zoom-btn:hover,
.zoom-fit:hover {
  color: #6f2dff;
}
.canvas-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50px;
  box-sizing: border-box;
  padding: 17px 24px;
  background: #f4f7fc;
  border-top: 1px solid #d7deed;
  color: #8a98b0;
  font-size: 12px;
  line-height: 16px;
}

/* ── 节点卡片（fixture 终版几何：158.8×48.8 / 胶囊 24.4 / 选中 #F7F2FF+#6F2DFF） ── */
.designer-node {
  cursor: move;
}
.designer-node-rect {
  x: 0.6px;
  y: 0.6px;
  width: 158.8px;
  height: 48.8px;
  rx: 5.4px;
  fill: #fff;
  stroke: #7e8799;
  stroke-width: 1.2;
}
.designer-node-start .designer-node-rect {
  rx: 24.4px;
  fill: #effaf5;
}
.designer-node-end .designer-node-rect {
  rx: 24.4px;
  fill: #fff;
}
/* 设计09：起草节点（发起人填写）浅橙底、灰描边 */
.designer-node-draft .designer-node-rect {
  fill: #fff6f1;
  stroke: #7e8799;
}
.designer-node-selected .designer-node-rect {
  fill: #f7f2ff;
  stroke: #6f2dff;
  stroke-width: 2;
}
.designer-node-error .designer-node-rect {
  stroke: var(--el-color-danger);
  stroke-width: 2.5;
}
.designer-node-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  fill: #19233b;
  pointer-events: none;
}
.designer-node-label--gateway {
  fill: #8a98b0;
  font-weight: 400;
}
.designer-node-icon {
  color: #8393b5;
  pointer-events: none;
}
.designer-node-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.designer-node-selected .designer-node-icon {
  color: var(--sw-color-primary);
}
.designer-node-gateway {
  fill: #fff;
  stroke: #8393b5;
  stroke-width: 1.4;
}
.designer-node-gateway-plus {
  fill: none;
  stroke: #a2aec7;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.designer-node-type {
  font-size: 11px;
  fill: #8393b5;
  pointer-events: none;
}
.designer-node-selected .designer-node-label {
  fill: #6f2dff;
}
.designer-node-port {
  fill: #a4adbe;
  stroke: #6f2dff;
  stroke-width: 1.5;
  cursor: crosshair;
}
.designer-edge-waypoint,
.designer-edge-endpoint {
  fill: #fff;
  stroke: #6f2dff;
  stroke-width: 1.8;
  pointer-events: all;
  cursor: grab;
}
.designer-edge-waypoint:active,
.designer-edge-endpoint:active {
  cursor: grabbing;
}
.designer-edge-endpoint {
  fill: #f7f2ff;
  stroke-width: 2;
}

/* ── 连线（fixture：#A4ADBE 1.6 + 同色箭头） ── */
.designer-edge {
  cursor: pointer;
  /* stroke="transparent" 不参与 visiblePainted 命中；显式按描边命中 */
  pointer-events: stroke;
}
.designer-edge.designer-edge-selected {
  stroke: transparent;
}
.designer-edge-visual {
  stroke: #a4adbe;
  stroke-width: 1.6;
  marker-end: url(#designer-edge-arrow);
  pointer-events: none;
}
.designer-edge-visual.designer-edge-selected {
  stroke: #6f2dff;
  stroke-width: 2;
  marker-end: url(#designer-edge-arrow-selected);
}
.designer-edge-arrow {
  fill: #a4adbe;
  stroke: none;
}
.designer-edge-arrow-selected {
  fill: #6f2dff;
  stroke: none;
}
.designer-edge-pending {
  stroke: var(--el-color-warning);
}

/* ── 右侧属性面板（fixture props：336px 白底 + 18px 标题 + 类型徽标；几何按设计09像素实测） ── */
.designer-props {
  width: 336px;
  flex: 0 0 336px;
  box-sizing: border-box;
  background: #fff;
  border-left: 1px solid #d7deed;
  padding: 19px 24px 22px;
  overflow: auto;
}

/* 节点13设计：监听器行（before/after 徽标 + bean 名）与添加框 */
.listener-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px 12px;
  padding: 13px 12px 21px;
  margin-bottom: 0;
  border: 1px solid #dde3ef;
  border-radius: 8px;
  background: #fff;
}

.listener-row + .listener-row {
  margin-top: 14px;
}

.listener-row__phase {
  min-width: 74px;
  box-sizing: border-box;
  padding: 3.5px 9px;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  border-radius: 5px;
}

.listener-row__phase--before {
  color: var(--sw-color-primary);
  background: #f0eaff;
}

.listener-row__phase--after {
  color: #15a77f;
  background: #e6f8f2;
}

.listener-row__desc {
  font-size: 13px;
  line-height: 17px;
  color: #5f6f92;
}

.listener-row__bean {
  grid-column: 1 / -1;
  font-size: 13px;
  line-height: 18px;
  color: #1f2a44;
}

.listener-row__note {
  grid-column: 1 / -1;
  font-size: 12px;
  line-height: 16px;
  color: #8c9ab1;
}

.listener-add {
  padding: 7px 12px;
  margin-top: 17px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  line-height: 17px;
  color: #303a55;
}
.props-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 31px;
}
.props-title {
  font-size: 18px;
  font-weight: 600;
  color: #19233b;
}
.props-type-chip {
  box-sizing: border-box;
  width: 82px;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  background: #eee7ff;
  color: #6b2dff;
  border-radius: 6px;
  padding: 4.5px 9px;
}
.props-section {
  font-size: 13px;
  line-height: 19px;
  color: #344164;
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #d7deed;
}
.props-section--advanced {
  margin-bottom: 15px;
}
.designer-props :deep(.el-form-item) {
  margin-bottom: 17.5px;
}
.designer-props :deep(.el-form-item__label) {
  color: #8795ad !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 17px;
  padding-bottom: 4px;
  margin-bottom: 4px;
}
.designer-props :deep(.el-input.is-disabled .el-input__inner) {
  color: #19233b;
  -webkit-text-fill-color: #19233b;
}
.designer-props :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.designer-props :deep(.el-input__inner) {
  height: 34px;
  color: #19233b;
}
.approver-card {
  position: relative;
  width: 100%;
  padding: 12px 12px 10px;
  margin-bottom: 15px;
  border: 1px solid #e7ebf4;
  border-radius: 8px;
  background: #fff;
}
.approver-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.approver-card__chip {
  box-sizing: border-box;
  width: 100px;
  padding: 3.5px 8px;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft, #ece9ff);
  border-radius: 6px;
}
.approver-card__pick {
  position: absolute;
  top: 20px;
  right: 36px;
  height: 30px;
  line-height: 17px;
}
.approver-card__hint {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  line-height: 15px;
  color: #99a5bb;
}
.approver-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.approver-field .el-input {
  flex: 1;
  min-width: 0;
}
.approver-field :deep(.el-button) {
  height: 34px;
  border-radius: 6px;
  border-color: #cbd6e8;
  color: #6f2dff;
  background: #fff;
}

/* ── 校验错误面板 ── */
.designer-errors {
  max-height: 180px;
  overflow: auto;
  margin: 0 12px 8px;
  border-color: #d7deed;
  border-radius: 8px;
}
.designer-error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #e2e8f4;
  font-size: 13px;
}
.error-message {
  color: #344164;
}

/* ── P53 节点13：流程高级配置弹窗（1054 宽 / 94px 头 / 双栏 488 区块 / 53px 底栏） ── */
.designer-page :deep(.advanced-config-dialog) {
  --el-dialog-margin-top: 110px;
  width: 1056px !important;
  height: 804px;
  max-width: calc(100vw - 48px);
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__header) {
  box-sizing: border-box;
  min-height: 94px;
  padding: 22px 27px 18px;
  border-bottom: 1px solid #dde3ef;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
.advanced-config-heading h2 {
  margin: 0;
  font-size: 22px;
  line-height: 29px;
  color: #19233b;
}
.advanced-config-heading p {
  margin: 8px 0 0;
  color: #8c9ab1;
  font-size: 12px;
  position: relative;
  top: -1px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__body) {
  padding: 23px 27px;
}
.advanced-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 268px 276px;
  column-gap: 24px;
  row-gap: 24px;
}
.advanced-config-grid section {
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  border: 1px solid #dde3ef;
  border-radius: 9.5px;
  padding: 20px;
}

/* 节点13 四卡组内部元素 */
.advanced-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.advanced-card__title {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 10px;
}

.advanced-card__icon {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  color: var(--sw-color-primary);
  font-size: 22px;
  position: relative;
  top: -2px;
}

.advanced-card__title h3 {
  flex: 1;
  position: relative;
  top: -5px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__title h3 {
  top: -5px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__title,
.advanced-config-grid section:nth-child(4) .advanced-card__title {
  position: relative;
  left: -1px;
}

.advanced-card__badge {
  box-sizing: border-box;
  width: 82px;
  height: 24px;
  padding: 2px 9px;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: #f0eaff;
  border-radius: 6px;
  position: relative;
  left: 3px;
  top: -14px;
}

.advanced-rows {
  display: grid;
  grid-template-columns: 143px 1fr;
  /* 设计（节点13）：监听器行距 51 */
  gap: 29px 18px;
  align-items: center;
  font-size: 13px;
  color: var(--sw-text-primary, #303a55);
  transform: translate(-3px, -3px);
}
.advanced-rows > :nth-child(3),
.advanced-rows > :nth-child(4) {
  position: relative;
  top: -9px;
}
.advanced-rows > :nth-child(5),
.advanced-rows > :nth-child(6) {
  position: relative;
  top: -3px;
}

.advanced-rows__cap {
  color: #8393b5;
}

.advanced-rows__bean {
  color: var(--sw-color-primary);
}

.advanced-card__note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c99b0;
  position: relative;
  left: -3px;
  top: 0;
}

.advanced-card__add {
  margin-top: 17px;
  padding: 9px 12px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  color: #303a55;
  transform: translateX(-3px);
  position: relative;
  top: -1px;
}

.advanced-chips {
  display: flex;
  gap: 8px;
}

.advanced-chips__item {
  flex: 1 1 0;
  padding: 5px 0;
  padding-left: 7px;
  box-sizing: border-box;
  text-align: left;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: #f0eaff;
  border-radius: 5px;
}

.advanced-card__meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: #5f6f92;
  position: relative;
  left: -3px;
}

.advanced-config-footnote {
  margin: 27px 0 0;
  font-size: 12px;
  color: #8c9ab1;
}
.advanced-config-grid h3 {
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ccd5e5;
  font-size: 16px;
  color: #19233b;
}
.advanced-config-grid section:nth-child(n + 3) h3 {
  margin-bottom: 1px;
}
.advanced-config-grid label {
  display: block;
  color: #8393b5;
  font-size: 12px;
  margin: 12px 0 6px;
}
.advanced-config-grid section:nth-child(2) label,
.advanced-config-grid section:nth-child(2) .static-value {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid section:nth-child(2) label:first-of-type {
  top: -15px;
}
.advanced-config-grid section:nth-child(2) .static-value {
  top: -12px;
}
.advanced-config-grid section:nth-child(2) label:nth-of-type(2) {
  position: relative;
  top: -8px;
}
.advanced-config-grid section:nth-child(2) .advanced-chips {
  position: relative;
  top: -2px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:last-child {
  top: 1px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:first-of-type {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  margin-top: 23px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value {
  top: 2px;
}
.advanced-config-grid section:nth-child(n + 3) > label:first-of-type {
  top: -1px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label + .static-value {
  top: 1px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  top: 7px;
}
.advanced-config-grid section:nth-child(n + 3) label,
.advanced-config-grid section:nth-child(n + 3) .static-value,
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid .static-value {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  background: #fafbfe;
  color: #19233b;
  padding: 7px 10px 0;
  display: flex;
  align-items: flex-start;
  font-size: 13px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__footer) {
  padding: 0;
  border-top: 1px solid #dde3ef;
}
.advanced-config-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  height: 53px;
  box-sizing: border-box;
  padding: 0 27px;
}
.advanced-config-footer :deep(.el-button) {
  height: 36px;
  min-width: 88px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  position: relative;
  top: 7.5px;
  font-size: 14px;
  line-height: 17px;
}
.advanced-config-footer :deep(.advanced-config-save) {
  width: 110px;
  min-width: 110px;
}
.advanced-config-footer :deep(.el-button > span) {
  position: relative;
  top: -3px;
}
.advanced-config-footer :deep(.el-button:first-child > span) {
  position: relative;
  left: 11.5px;
}
@media (max-height: 980px) {
  .designer-page :deep(.advanced-config-dialog) {
    --el-dialog-margin-top: 40px;
  }
}

/* ── P53 节点12：审批人候选弹窗（容器层几何覆盖，不改组件 script） ── */
.approver-dialog-host :deep(.el-dialog) {
  --el-dialog-width: min(1018px, calc(100vw - 40px)) !important;
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__header) {
  box-sizing: border-box;
  min-height: 94px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid #dde3ef;
}
.approver-dialog-host :deep(.el-dialog__title) {
  font-size: 22px;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
.approver-dialog-host :deep(.el-dialog__body) {
  padding: 16px 28px 24px;
}
/* 搜索框：设计 36px 高 / #FBFCFF 底 / #CBD6E8 描边 */
.approver-dialog-host :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.approver-dialog-host :deep(.el-input__inner) {
  height: 36px;
  color: #19233b;
}
/* 候选列表：卡片化行（60px 行高、奇数行 #FAF5FF），设计稿无列头 */
.approver-dialog-host :deep(.el-table__header-wrapper) {
  display: none;
}
.approver-dialog-host :deep(.el-table td.el-table__cell) {
  padding: 14px 0;
  border-bottom: 1px solid #eef1f8;
}
.approver-dialog-host :deep(.el-table__row:nth-child(odd) .el-table__cell) {
  background-color: #faf5ff;
}
.approver-dialog-host :deep(.el-table .el-table__cell) {
  color: #344164;
}
.approver-dialog-host :deep(.el-table .el-button.is-link) {
  color: #6f2dff;
}
.approver-dialog-host :deep(.approver-picker__empty),
.approver-dialog-host :deep(.approver-picker__note) {
  color: #8393b5;
}
.approver-dialog-host :deep(.approver-picker__picked) {
  color: #6f2dff;
}

/*
 * Element Plus 将候选人弹窗 teleport 到 body；因此容器前缀选择器不能
 * 覆盖传送后的根节点。节点 12 的结构尺寸必须直接落在实际弹窗上。
 */
:global(.el-dialog.approver-dialog) {
  width: 1020px !important;
  height: 732px !important;
  margin-top: 146px !important;
  box-sizing: border-box;
  padding: 0 !important;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
:global(.el-dialog.approver-dialog .el-dialog__header) {
  box-sizing: border-box;
  height: 96px;
  min-height: 96px;
  padding: 22px 27px 18px;
  border-bottom: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
:global(.el-dialog.approver-dialog .el-dialog__body) {
  padding: 16px 27px 16px;
}
:global(.el-dialog.approver-dialog .el-dialog__footer) {
  box-sizing: border-box;
  padding: 20px 27px 12px;
  border-top: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .approver-dialog__tabs) {
  position: relative;
  top: -3px;
  margin-left: 0;
  margin-bottom: 23px;
}
:global(.el-dialog.approver-dialog .approver-dialog__tab) {
  min-width: 102px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  position: relative;
  top: 8px;
  left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footnote) {
  position: relative;
  top: 5px;
  left: -2px;
}
:global(.el-dialog.approver-dialog .approver-dialog__panes) {
  grid-template-columns: 236px 406px 290px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-pane) {
  padding: 17px 15px 14px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  top: 8px;
}
:global(.el-dialog.approver-dialog .approver-pane--tree .el-tree) {
  margin-top: 22.5px;
  margin-left: -8px;
}
:global(.el-dialog.approver-dialog .el-tree-node__content) {
  height: 36px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-pane__rows) {
  margin-top: 18px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user) {
  width: calc(100% + 8px);
  margin-left: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body) {
  position: relative;
  left: 4px;
  top: -2.5px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body b) {
  position: relative;
  top: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .el-input__inner) {
  position: relative;
  left: -11px;
  width: calc(100% + 11px);
  padding-left: 12px !important;
}
:global(.el-dialog.approver-dialog .approver-user) {
  height: 60px;
  box-sizing: border-box;
  margin-bottom: 8px;
  gap: 12px;
}
:global(.el-dialog.approver-dialog .approver-user__avatar) {
  width: 26px;
  height: 26px;
  font-size: 26px;
}
:global(.el-dialog.approver-dialog .approver-picked) {
  height: 60px;
  box-sizing: border-box;
  margin-bottom: 14px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-picked .approver-user__avatar) {
  width: 24px;
  height: 24px;
  font-size: 24px;
}
:global(.el-dialog.approver-dialog .approver-picked > .el-button) {
  position: relative;
  left: 10px;
  top: -2px;
}
:global(.el-dialog.approver-dialog .approver-pane--picked .approver-pane__title) {
  margin-bottom: 24px;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button:first-child) {
  width: 88px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm) {
  width: 108px;
  min-width: 108px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm > span) {
  white-space: nowrap;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button + .el-button) {
  margin-left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button > span) {
  position: relative;
  top: -2px;
}
</style>
