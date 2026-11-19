import { computed, ref } from 'vue'
import type {
  DesignerModel,
  EdgeSegmentHandle,
  PositionedEdge,
  PositionedNode,
} from '@/adapters/process-graph'
import {
  buildEdgePath,
  edgeDragCursor,
  edgeSegmentHandles,
  hitTestEdgeAtPoint,
  parsePathPoints,
  pointsToWaypoints,
  portSideOf,
  previewEdgePath,
  sideAxis,
  moveEdgeSegment,
} from '@/adapters/process-graph'
import type { ProcessGraphWaypoint } from '@/contracts/process-graph'
import type { BpmNodeCapability } from '@/contracts/bpm-node'

/* global document,
  SVGSVGElement,
  WheelEvent,
  PointerEvent,
  DragEvent */

/** P53 设计稿专用节点几何；其它流程图继续使用适配器默认尺寸。0.2.0 G08：普通节点 230×44。 */
export const P53_NODE_WIDTH = 230
export const P53_NODE_HEIGHT = 44
export const P53_GATEWAY_RADIUS = 14

/**
 * 节点面板拖拽载荷（palette dragstart ↔ 画布 drop 的 JSON 契约）。
 */
export interface PaletteDrag {
  capability: BpmNodeCapability
}

/** useDesignerCanvas 入参（在 DesignerCanvas 子组件内调用，经 getter 直取主文件响应式状态）。 */
export interface DesignerCanvasOptions {
  /** 画布模型（非响应式实例；getter 取最新值，避免 prop 传输时序差）。 */
  model: () => DesignerModel | null
  /** 快照 serial（画布每次变更自增，驱动画布重算）。 */
  version: () => number
  /** 当前选中元素 id。 */
  selectionId: () => string | null
  /** 版本预览态（只读快照时禁用交互）。 */
  isVersionPreview: () => boolean
  /** 选中同步回调（子组件 emit 回主文件的 selectionId）。 */
  onSelect: (id: string | null) => void
  /** 画布变更后的快照回调（主文件 version 自增）。 */
  snapshot: () => void
}

/**
 * 设计器画布：视口（平移/缩放/适应）+ 节点拖拽/四向连线/连线编辑会话
 * + 面板节点拖入/点选添加（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerCanvas(options: DesignerCanvasOptions) {
  const model = options.model
  const selectionId = options.selectionId
  const isVersionPreview = options.isVersionPreview

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
    if (!model()) return
    const state0 = model()!.state()
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

  /** 画布缩放百分比（由视口宽度换算，CANVAS_W = 100%）。 */
  const fitZoom = ref(1)
  const zoomPercent = computed(() => Math.round(fitZoom.value * 100))

  /* ─────────── 节点/连线交互状态 ─────────── */

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
      // BF20261013-030：空白处按下与模型同口径取消选中（此前视觉选中态残留，连线手柄不消失）
      select(null)
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
    if (dragState.value && model()) {
      const point = screenToGraph(event)
      const snapped = {
        x: Math.round(point.x / SNAP_X) * SNAP_X,
        y: Math.round(point.y / SNAP_Y) * SNAP_Y,
      }
      model()!.moveNode(dragState.value?.id ?? '', snapped.x, snapped.y)
      options.snapshot()
      return
    }
    // 连线拖拽：跟随指针更新预览终点
    if (pendingConnectNode.value) {
      pendingConnectTarget.value = screenToGraph(event)
    }
    // BF20261013-030 连线编辑：端点拖拽预览 / 内段拖动实时改形（移动超阈值才生效，单击不改形）
    if (edgeEdit.value && model()) {
      const edit = edgeEdit.value
      if (!edit.armed) {
        if (
          Math.hypot(event.clientX - edit.startScreen.x, event.clientY - edit.startScreen.y) < 3
        ) {
          return
        }
        edit.armed = true
      }
      const p = screenToGraph(event)
      if (edit.kind === 'segment') {
        const edge = model()!
          .state()
          .edges.find((candidate) => candidate.id === edit.edgeId)
        if (!edge) return
        const points = pathPoints(edge.path)
        const moved = moveEdgeSegment(
          points,
          edit.segmentIndex,
          edit.axis,
          edit.axis === 'x' ? p.x : p.y,
          edgeDragContext(edge, points),
        )
        if (moved === points) return
        // 直线首次拖动生成滑移折返（jog）：后续拖动接管其中段（下标 2）
        if (points.length === 2 && moved.length === 6) edit.segmentIndex = 2
        // BF20261013-033：端口腿拖动在端口旁生成固定小段+折（折数 +2），后续拖动接管被拖段
        // （源/目标两侧的被拖段都落在新折线的倒数第 4 段下标：newLen-4）
        if (moved.length === points.length + 2) {
          edit.segmentIndex = moved.length - 4
        }
        model()!.setEdgeWaypoints(edge.id, pointsToWaypoints(moved))
        options.snapshot()
        return
      }
      edgeEditPoint.value = p
      edgeEditHoverId.value = resolveConnectDropTarget(event)
    }
  }

  function clickedOnSourcePort(
    start: { x: number; y: number } | null,
    event: PointerEvent,
  ): boolean {
    return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
  }

  /** 统一落点判定：DOM 命中优先，透明命中路径遮挡时回退图坐标就近节点（60px）。 */
  function resolveConnectDropTarget(event: PointerEvent): string | null {
    if (!model()) return null
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
    for (const node of model()!.state().nodes) {
      const distance = Math.hypot(node.x - point.x, node.y - point.y)
      if (distance < 60 && distance < bestDistance) {
        bestDistance = distance
        target = node.id
      }
    }
    return target
  }

  function onPointerUp(event: PointerEvent) {
    // V011-BUG-025：连线编辑收尾——端点落点改接（未拖动/自环/重复边/空放均不改动），内段已实时落模型
    if (edgeEdit.value && model()) {
      const edit = edgeEdit.value
      if (edit.kind === 'endpoint' && edit.armed) {
        // BF20261013-034：落下即按落点所在边切换端口侧（同节点换端口也生效）
        const targetId = resolveConnectDropTarget(event)
        const nodes = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
        const targetNode = targetId ? nodes.get(targetId) : undefined
        const applied =
          targetId && targetId !== edit.otherEndId && targetNode
            ? model()!.setEdgeEndpoint(
                edit.edgeId,
                edit.which ?? 'target',
                targetId,
                nearestPortSide(screenToGraph(event), targetNode),
              )
            : null
        if (applied) options.snapshot()
      }
      edgeEdit.value = null
      edgeEditPoint.value = null
      edgeEditHoverId.value = null
      panSession.value = null
      dragState.value = null
      return
    }
    // 连线落点统一判定（拖放与 sticky 点选共用）：
    // 命中其他节点 → 建立连线；仍点在源锚上 → sticky 挂起；其余 → 取消
    if (pendingConnectNode.value && model()) {
      const onSourcePort = clickedOnSourcePort(pendingConnectStartScreen.value, event)
      const targetId = resolveConnectDropTarget(event)
      if (targetId && targetId !== pendingConnectNode.value) {
        model()!.connect(pendingConnectNode.value, targetId)
        pendingConnectNode.value = null
        pendingConnectTarget.value = null
        pendingConnectStartScreen.value = null
        options.snapshot()
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

  /** 选中同步（与主文件 selectNode 同语义：共享 id + 模型内部选中态）。 */
  function select(id: string | null) {
    model()?.select(id)
    options.onSelect(id)
  }

  const canvasNodes = computed(() => {
    void options.version()
    return (model()?.state().nodes ?? []) as PositionedNode[]
  })
  const canvasEdges = computed(() => {
    void options.version()
    return model()?.state().edges ?? []
  })

  function startNodeDrag(event: PointerEvent, node: PositionedNode) {
    if (isVersionPreview()) {
      select(node.id)
      return
    }
    const point = screenToGraph(event)
    dragState.value = { id: node.id, dx: point.x - node.x, dy: point.y - node.y, type: 'node' }
    select(node.id)
  }

  function onNodePointerUp(event: PointerEvent, node: PositionedNode) {
    // 连线拖拽（pending 模式）结束时落到节点 → connect
    if (pendingConnectNode.value && pendingConnectNode.value !== node.id && model()) {
      model()!.connect(pendingConnectNode.value, node.id)
      pendingConnectNode.value = null
      pendingConnectPos.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
      options.snapshot()
    }
    void event
  }

  /** 节点四向端口半距：事件胶囊/网关菱形与卡片盒不同。 */
  function nodePortHalf(node: PositionedNode) {
    if (isGatewayShape(node.type)) return { w: P53_GATEWAY_RADIUS, h: P53_GATEWAY_RADIUS }
    return { w: P53_NODE_WIDTH / 2, h: P53_NODE_HEIGHT / 2 }
  }

  /** 节点四向锚点坐标（V011-BUG-023）：上下左右缘中点。 */
  function sidePoint(node: PositionedNode, side: 'left' | 'right' | 'top' | 'bottom') {
    const half = nodePortHalf(node)
    switch (side) {
      case 'left':
        return { x: node.x - half.w, y: node.y }
      case 'right':
        return { x: node.x + half.w, y: node.y }
      case 'top':
        return { x: node.x, y: node.y - half.h }
      default:
        return { x: node.x, y: node.y + half.h }
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
    if (isVersionPreview()) return
    const point = screenToGraph(event)
    pendingConnectNode.value = node.id
    pendingConnectPos.value = sidePoint(node, side)
    pendingConnectTarget.value = point
    pendingConnectStartScreen.value = { x: event.clientX, y: event.clientY }
  }

  /** 点击连线选中（删除所选可移除）。 */
  function selectEdge(event: PointerEvent, edgeId: string) {
    event.stopPropagation()
    select(edgeId)
  }

  /* ── V011-BUG-025 连线编辑：端点拖拽改接 / 线上按住拖动插入·移动拐点 ── */

  type PathPoint = { x: number; y: number }

  /** 折线 path 解析统一走适配器（命中检测/手柄/拖拽同一几何口径）。 */
  const pathPoints = parsePathPoints

  function pointDist(a: PathPoint, b: PathPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  /**
   * BF20261013-029：连线渲染路径——端点拖拽中按固定端端口 → 命中节点端口（无命中则指针）
   * 实时重算曼哈顿路由，真实连线跟随指针改形（不再虚线预览）；其余情况用模型路径。
   */
  function edgePathOf(edge: PositionedEdge): string {
    const edit = edgeEdit.value
    if (
      !edit ||
      edit.kind !== 'endpoint' ||
      edit.edgeId !== edge.id ||
      !edgeEditPoint.value ||
      !canvasNodes.value.length
    ) {
      return edge.path
    }
    const byId = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
    const fixedNode = byId.get(edit.otherEndId)
    if (!fixedNode) return edge.path
    const size = { width: P53_NODE_WIDTH, height: P53_NODE_HEIGHT }
    const pointer = edgeEditPoint.value
    const path = pathPoints(edge.path)
    const fixedPort = edit.which === 'source' ? path[path.length - 1] : path[0]
    const hovered = edgeEditHoverId.value ? byId.get(edgeEditHoverId.value) : undefined
    // BF20261013-035：预览与落下同源（命中节点 → 该节点 + 落点最近边；未命中 → 指针作为落点），
    // 且端口腿轴向稳定（不随指针来回切换折向），避免拖动中整条线「漂移」。
    if (hovered && hovered.id !== edit.otherEndId) {
      // 只指定被拖端端口侧，固定端沿用其配置/自动侧 —— 与落下后的重排完全同源
      // BF20261013-036：被拖端是 target 时必须把 hovered 传在 target 位——此前一律按 source 传入，
      // 预览被镜像成「命中节点 → 固定端」（甚至绕出画布），与松手后的实际改接方向相反。
      const movingSide = nearestPortSide(pointer, hovered)
      return edit.which === 'source'
        ? previewEdgePath(edge, hovered, fixedNode, size, P53_GATEWAY_RADIUS, {
            source: movingSide,
          })
        : previewEdgePath(edge, fixedNode, hovered, size, P53_GATEWAY_RADIUS, {
            target: movingSide,
          })
    }
    const fixedSide = portSideOf(fixedPort, fixedNode, size)
    const axis = sideAxis(fixedSide)
    if (edit.which === 'source') {
      return buildEdgePath(pointer, fixedPort, [], { sourceAxis: axis, targetAxis: axis })
    }
    return buildEdgePath(fixedPort, pointer, [], { sourceAxis: axis, targetAxis: axis })
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
    kind: 'endpoint' | 'segment'
    which?: 'source' | 'target'
    otherEndId: string
    originalWaypoints: ProcessGraphWaypoint[]
    segmentIndex: number
    axis: 'x' | 'y'
    /** BF20261013-032：被拖的是端口腿时标记所属端口——拖动即沿节点边框滑动端口落点。 */
    port: 'source' | 'target' | null
    startScreen: { x: number; y: number }
    /** 拖动阈值（≥3px 才生效）：点击选中连线不再改变形状。 */
    armed: boolean
  }>(null)
  /** BF20261013-029：端点拖拽实时改形——固定端节点 + 指针 + 命中节点（真实连线跟随，不再是虚线预览）。 */
  const edgeEditPoint = ref<PathPoint | null>(null)
  const edgeEditHoverId = ref<string | null>(null)

  /**
   * BF20261013-036：拖动会话期间固定光标。拖动中预览几何每帧重算，指针下方的元素在
   * 「节点盒(move) / 命中路径(pointer) / 空白(default) / 端点圆(grab)」之间不断切换，
   * 光标就跟着乱跳；拖动期间改为整个画布统一用一个会话光标（吸附时不再闪烁）。
   */
  const activeDragCursor = computed(() =>
    edgeEdit.value ? edgeDragCursor(edgeEdit.value.kind, edgeEdit.value.axis) : null,
  )

  /**
   * BF20261013-036：连线拖动期间捕获指针——指针滑出画布（如到右侧属性面板）时仍能收到
   * pointermove/pointerup，拖动会话不会悬空（松手不生效、光标停在拖动态）。
   * 合成事件没有活动指针，setPointerCapture 会抛 NotFoundError，忽略即可。
   */
  function captureEdgeDragPointer(event: PointerEvent) {
    try {
      svgRef.value?.setPointerCapture(event.pointerId)
    } catch {
      // 无活动指针（合成事件）时无需捕获
    }
  }

  function beginEndpointDrag(
    event: PointerEvent,
    edge: PositionedEdge,
    which: 'source' | 'target',
  ) {
    if (isVersionPreview()) return
    const points = pathPoints(edge.path)
    if (points.length < 2) return
    captureEdgeDragPointer(event)
    edgeEdit.value = {
      edgeId: edge.id,
      kind: 'endpoint',
      which,
      otherEndId: which === 'source' ? edge.targetId : edge.sourceId,
      originalWaypoints: [...edge.waypoints],
      segmentIndex: -1,
      axis: 'x',
      port: null,
      startScreen: { x: event.clientX, y: event.clientY },
      armed: false,
    }
    edgeEditPoint.value = screenToGraph(event)
    edgeEditHoverId.value = null
  }

  /**
   * BF20261013-030/032 段拖动：按住任意一段——垂直段左右拖、水平段上下拖。
   * 内段移动该段本身；端口腿（贴节点的一段）沿节点边框滑动端口落点。
   * 形状只在指针移动超过阈值后实时落模型；单击（含再次点击已选中连线）不改形。
   */
  function beginSegmentDrag(
    event: PointerEvent,
    edge: PositionedEdge,
    index: number,
    axis: 'x' | 'y',
    port: 'source' | 'target' | null = null,
  ) {
    if (isVersionPreview()) return
    captureEdgeDragPointer(event)
    edgeEdit.value = {
      edgeId: edge.id,
      kind: 'segment',
      otherEndId: '',
      originalWaypoints: edge.waypoints.map((point) => ({ ...point })),
      segmentIndex: index,
      axis,
      port,
      startScreen: { x: event.clientX, y: event.clientY },
      armed: false,
    }
  }

  /** 选中连线段手柄（每一段都可拖；整条直线给合成中点手柄）。 */
  function edgeSegmentHandlesOf(edge: PositionedEdge): EdgeSegmentHandle[] {
    return edgeSegmentHandles(pathPoints(edgePathOf(edge)))
  }

  /** 命中最近的可拖段手柄（每段都有，含端口腿）。 */
  function edgeHandleAt(points: PathPoint[], point: PathPoint): EdgeSegmentHandle | null {
    const index = nearestSegment(points, point)
    return edgeSegmentHandles(points).find((handle) => handle.index === index) ?? null
  }

  /**
   * BF20261013-031 拖动上下文：端口腿外向取自**端口几何**（节点中心 → 端口方向），
   * 不再取自折线当前方向——节点移动后折线方向可能已反向，会把可拖区间锁成单向。
   */
  function edgeDragContext(edge: PositionedEdge, points: PathPoint[]) {
    const nodes = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
    const source = nodes.get(edge.sourceId)
    const target = nodes.get(edge.targetId)
    if (!source || !target || points.length < 2) return {}
    const outward = (port: PathPoint, node: PositionedNode, axis: 'x' | 'y') => {
      const delta = axis === 'x' ? port.x - node.x : port.y - node.y
      return delta >= 0 ? 1 : -1
    }
    const last = points[points.length - 1]
    const beforeLast = points[points.length - 2]
    return {
      sourceOutward: outward(points[0], source, points[0].x === points[1].x ? 'y' : 'x'),
      targetOutward: outward(last, target, beforeLast.x === last.x ? 'y' : 'x'),
    }
  }

  /** BF20261013-034：落点最近的端口侧（拖端点换到节点其他端口）。 */
  function nearestPortSide(
    point: PathPoint,
    node: PositionedNode,
  ): 'left' | 'right' | 'top' | 'bottom' {
    const half = nodePortHalf(node)
    const distances = {
      left: Math.abs(point.x - (node.x - half.w)),
      right: Math.abs(point.x - (node.x + half.w)),
      top: Math.abs(point.y - (node.y - half.h)),
      bottom: Math.abs(point.y - (node.y + half.h)),
    }
    let best: 'left' | 'right' | 'top' | 'bottom' = 'left'
    for (const side of ['right', 'top', 'bottom'] as const) {
      if (distances[side] < distances[best]) best = side
    }
    return best
  }

  function beginSegmentDragFromHandle(
    event: PointerEvent,
    edge: PositionedEdge,
    handle: EdgeSegmentHandle,
  ) {
    if (isVersionPreview()) return
    beginSegmentDrag(event, edge, handle.index, handle.axis, handle.port)
  }

  /** 连线按下：未选中→仅选中（不改形）；已选中→端点改接 / 内段拖动会话，点击本身不产生形状变化。 */
  function onEdgePointerDown(event: PointerEvent, edge: PositionedEdge) {
    if (selectionId() !== edge.id) {
      selectEdge(event, edge.id)
      return
    }
    if (!model()) return
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
    const handle = edgeHandleAt(points, p)
    if (!handle) return
    beginSegmentDrag(event, edge, handle.index, handle.axis, handle.port)
  }

  /** 选中连线上悬停可拖段 → 按拖动轴展示方向光标（左右可拖=ew-resize / 上下可拖=ns-resize）。 */
  const edgeHoverAxis = ref<{ edgeId: string; axis: 'x' | 'y' } | null>(null)

  function onEdgeHoverMove(event: PointerEvent, edge: PositionedEdge) {
    if (selectionId() !== edge.id) {
      edgeHoverAxis.value = null
      return
    }
    const points = pathPoints(edge.path)
    const handle = edgeHandleAt(points, screenToGraph(event))
    if (!handle) {
      edgeHoverAxis.value = null
      return
    }
    if (edgeHoverAxis.value?.edgeId !== edge.id || edgeHoverAxis.value.axis !== handle.axis) {
      edgeHoverAxis.value = { edgeId: edge.id, axis: handle.axis }
    }
  }

  function onEdgeHoverLeave(edge: PositionedEdge) {
    if (edgeHoverAxis.value?.edgeId === edge.id) edgeHoverAxis.value = null
  }

  function edgeHitCursor(edge: PositionedEdge): string {
    const edit = edgeEdit.value
    if (edit?.kind === 'segment' && edit.edgeId === edge.id) {
      return edit.axis === 'x' ? 'ew-resize' : 'ns-resize'
    }
    const hover = edgeHoverAxis.value
    if (hover?.edgeId === edge.id) {
      return hover.axis === 'x' ? 'ew-resize' : 'ns-resize'
    }
    return 'pointer'
  }

  /* ─────────── 面板节点拖入 / 点选添加 ─────────── */

  const SNAP_X = 20
  const SNAP_Y = 20

  function onCanvasDrop(event: DragEvent) {
    event.preventDefault()
    if (isVersionPreview()) return
    const raw = event.dataTransfer?.getData('application/json')
    if (!raw) return
    let capability: BpmNodeCapability | null
    try {
      capability = (JSON.parse(raw) as PaletteDrag).capability ?? null
    } catch {
      capability = null
    }
    if (!capability || !model()) return
    const point = screenToGraph(event)
    const x = Math.round(point.x / SNAP_X) * SNAP_X
    const y = Math.round(point.y / SNAP_Y) * SNAP_Y
    // V011-BUG-020：拖放到连线上 = 在该连线中间插入节点（初始 START→END 线可直接
    // 「拖入节点」建流程，无需先选中节点再连线）
    const element = document.elementFromPoint(event.clientX, event.clientY)
    const edgeId = element?.closest('path[data-edge-id]')?.getAttribute('data-edge-id') ?? null
    const nodeId = edgeId
      ? model()!.insertNodeOnEdge(edgeId, capability.type, capability.displayName, x, y)
      : model()!.addNode(capability.type, capability.displayName, x, y)
    if (nodeId) select(nodeId)
    options.snapshot()
  }

  /** V011-BUG-020：组件库点击添加（拖拽之外的可见创建路径），落点为画布中心。 */
  function addNodeFromCapability(cap: BpmNodeCapability) {
    if (!cap.supports.design || !model() || isVersionPreview()) return
    const x = Math.round((viewBox.value.x + viewBox.value.w / 2) / SNAP_X) * SNAP_X
    const y = Math.round((viewBox.value.y + viewBox.value.h / 2) / SNAP_Y) * SNAP_Y
    // P62 FD01：点击落点命中既有连线时与拖放同语义（插入该连线），避免产生
    // 视觉压线而图中断连的节点（此前固定 addNode 导致发布校验 2004/2005）。
    const state = model()!.state()
    const edgeId = hitTestEdgeAtPoint(state.nodes, state.edges, x, y)
    const id = edgeId
      ? model()!.insertNodeOnEdge(edgeId, cap.type, cap.displayName, x, y)
      : model()!.addNode(cap.type, cap.displayName, x, y)
    select(id)
    options.snapshot()
  }

  /** 错误定位：把指定节点居中（画布视口平移，不改缩放）。 */
  function centerOnNode(elementId: string) {
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

  /** 节点标签两行拆行（画布文本 42px 起排版）。 */
  function nodeLabelLines(label: string) {
    return label.length > 8 ? [label.slice(0, 8), label.slice(8)] : [label]
  }

  /**
   * 网关类节点（菱形渲染）：GATEWAY 为既有口径；P63 将 CONDITION 与
   * PARALLEL_GATEWAY（并行网关，1入多出分叉/多入1出到齐汇合）归入同一菱形分支。
   */
  function isGatewayShape(type: string): boolean {
    return type === 'GATEWAY' || type === 'CONDITION' || type === 'PARALLEL_GATEWAY'
  }

  return {
    // 视口
    svgRef,
    viewBox,
    fitZoom,
    zoomPercent,
    zoomView,
    fitViewport,
    // 交互
    canvasNodes,
    canvasEdges,
    onWheel,
    onBgPointerDown,
    onPointerMove,
    onPointerUp,
    startNodeDrag,
    onNodePointerUp,
    startConnect,
    pendingConnectPos,
    pendingConnectTarget,
    onCanvasDrop,
    // 连线编辑
    pathPoints,
    edgePathOf,
    edgeHitCursor,
    onEdgePointerDown,
    onEdgeHoverMove,
    onEdgeHoverLeave,
    edgeSegmentHandlesOf,
    beginEndpointDrag,
    beginSegmentDragFromHandle,
    activeDragCursor,
    // 展示辅助
    isGatewayShape,
    nodeLabelLines,
    centerOnNode,
    addNodeFromCapability,
  }
}
