import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { WorkspaceCardType, WorkspaceComponent } from '@/contracts/catalog'
import {
  WORKSPACE_MIN_W,
  WORKSPACE_NOMINAL_W,
  WORKSPACE_SNAP,
  applyDragRect,
  collectCandidates,
  dragAxisOffsets,
  isLegacyGeometry,
  rescaleRects,
  snapDelta,
  toAbsoluteRect,
  type CardRect,
} from '@/modules/workflow/utils/workspace-canvas'

export const EDGES = ['n', 's', 'e', 'w'] as const
export const CORNERS = ['ne', 'nw', 'se', 'sw'] as const

/** 自由画布拖拽会话：move=标题栏/卡片体拖动，resize=8 向手柄缩放。 */
export type CanvasDragState = {
  key: string
  mode: 'move' | 'resize'
  handle: string
  startX: number
  startY: number
  orig: CardRect
  pointerId: number
  moved: boolean
}

export interface WorkspaceCanvasDeps {
  components: Ref<WorkspaceComponent[]>
  cardTypes: Ref<WorkspaceCardType[]>
  editing: ComputedRef<boolean>
  dirty: Ref<boolean>
  rendererKeyOf: (key: string) => string
  defaultMetadata: (type: WorkspaceCardType) => Record<string, unknown>
}

/**
 * 自由画布几何与拖拽（整页编辑模式）：卡片几何水合/等比缩放、8 向拖拽缩放会话、
 * 对齐线吸附、组件库拖放新增、画布宽度实测（ResizeObserver）。
 */
export function useWorkspaceCanvas(deps: WorkspaceCanvasDeps) {
  const { components, cardTypes, editing, dirty, rendererKeyOf, defaultMetadata } = deps

  const canvasRef = ref<globalThis.HTMLElement | null>(null)
  /** 响应式画布宽度（ResizeObserver 实测）；宽度变化时全部卡片 x/w 等比缩放。 */
  const canvasWidth = ref(0)
  let canvasResizeObserver: InstanceType<typeof globalThis.ResizeObserver> | null = null

  /** 供模板 :ref 绑定：把画布容器元素写入 canvasRef（挂载赋元素、卸载置 null，等价原字符串 ref）。 */
  function setCanvasRef(el: unknown): void {
    canvasRef.value = (el as globalThis.HTMLElement | null) ?? null
  }
  const geometryMap = ref<Record<string, CardRect>>({})
  const guides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const draggingPayload = ref('')
  const dragState = ref<CanvasDragState | null>(null)
  const selectedKey = ref<string | null>(null)

  // ─── 自由画布几何（整页编辑模式） ───
  /** 各渲染器的默认卡片高度；缺省 320 保证面板内容可见。 */
  const DEFAULT_CARD_HEIGHTS: Record<string, number> = {
    stats: 168,
    statMetric: 112,
    todo: 360,
    favorites: 300,
    activity: 320,
    efficiency: 340,
    drafts: 220,
    messages: 220,
    metric: 150,
    chart: 320,
    list: 280,
  }
  /**
   * 默认画布按设计稿 3:2 分层（内容宽 1656 @1920）：
   * 统计卡 96、主区 112—598（左 1047 / 右 589）、动态通栏 614—874。
   */
  const DEFAULT_CARD_GEOMETRY: Record<string, { x: number; y: number; w: number; h: number }> = {
    stats: { x: 0, y: 0, w: 1, h: 96 },
    todo: { x: 0, y: 112, w: 0.632, h: 486 },
    favorites: { x: 0.644, y: 112, w: 0.356, h: 208 },
    efficiency: { x: 0.644, y: 336, w: 0.356, h: 262 },
    activity: { x: 0, y: 614, w: 1, h: 260 },
    drafts: { x: 0, y: 901, w: 0.48, h: 220 },
    messages: { x: 0.52, y: 901, w: 0.48, h: 220 },
  }

  function defaultCardHeight(key: string): number {
    return DEFAULT_CARD_HEIGHTS[rendererKeyOf(key)] ?? 320
  }

  /** 当前画布宽度：真实测量优先，无布局环境（单测）退回名义宽度。 */
  function currentCanvasWidth(): number {
    return canvasRef.value?.clientWidth || canvasWidth.value || WORKSPACE_NOMINAL_W
  }

  /**
   * 用户保存的 geometry 按分数契约（x/w=画布宽度分数，y/h 像素，BUG-003）展开为
   * 当前画布像素；缺失/非法时回落自动布局。BUG-002 旧像素几何先按当前画布钳制，
   * 再按其设计宽度（全部旧卡片最大右缘）等比展开到当前画布——旧布局同样随分辨率自适应。
   */
  function hydrateGeometry() {
    const width = currentCanvasWidth()
    const legacyKeys: string[] = []
    for (const component of components.value) {
      const raw = component.metadata?.geometry
      const rect = toAbsoluteRect(raw, width)
      if (rect) {
        geometryMap.value[component.key] = rect
        if (isLegacyGeometry(raw)) legacyKeys.push(component.key)
      }
    }
    if (!legacyKeys.length) return
    const designWidth = legacyKeys.reduce(
      (max, key) => Math.max(max, geometryMap.value[key]!.x + geometryMap.value[key]!.w),
      0,
    )
    if (designWidth < WORKSPACE_MIN_W) return
    const legacyMap: Record<string, CardRect> = {}
    for (const key of legacyKeys) legacyMap[key] = geometryMap.value[key]!
    const scaled = rescaleRects(legacyMap, designWidth, width)
    for (const key of legacyKeys) geometryMap.value[key] = scaled[key] ?? legacyMap[key]!
  }

  /** 首次渲染/恢复默认时按 order 生成整行堆叠的默认几何。 */
  function ensureGeometry() {
    const width = currentCanvasWidth()
    let bottom = 0
    for (const component of [...components.value].sort((a, b) => a.order - b.order)) {
      if (!geometryMap.value[component.key]) {
        const design = DEFAULT_CARD_GEOMETRY[rendererKeyOf(component.key)]
        geometryMap.value[component.key] = design
          ? {
              x: Math.round(width * design.x),
              y: design.y,
              w: Math.max(WORKSPACE_MIN_W, Math.round(width * design.w)),
              h: design.h,
            }
          : {
              x: 0,
              y: bottom,
              w: Math.max(WORKSPACE_MIN_W, Math.round(width)),
              h: defaultCardHeight(component.key),
            }
      }
      const rect = geometryMap.value[component.key]
      bottom = Math.max(bottom, rect.y + rect.h + 20)
    }
  }

  function rectOf(key: string): CardRect {
    return (
      geometryMap.value[key] ?? { x: 0, y: 0, w: WORKSPACE_NOMINAL_W, h: defaultCardHeight(key) }
    )
  }

  const canvasItems = computed(() =>
    components.value
      .filter((c) => c.visible || editing.value)
      .slice()
      .sort((a, b) => a.order - b.order),
  )

  const canvasHeight = computed(() => {
    // 只按实际呈现的卡片计算高度：隐藏组件不制造底部空白滚动。
    const bottom = canvasItems.value.reduce((max, component) => {
      const r = rectOf(component.key)
      return Math.max(max, r.y + r.h)
    }, 0)
    return Math.round(Math.max(editing.value ? 720 : 520, bottom + (editing.value ? 80 : 24)))
  })

  function itemStyle(key: string) {
    const rect = rectOf(key)
    return {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
      zIndex: dragState.value?.key === key ? 40 : 1,
    }
  }

  function startPaletteDrag(typeCode: string, event: globalThis.DragEvent) {
    draggingPayload.value = `palette:${typeCode}`
    event.dataTransfer?.setData('text/plain', draggingPayload.value)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  /** 组件库新增/重新启用卡片：默认半幅宽，落在画布最低端或指针释放处。 */
  function addComponent(typeCode: string, at?: { x: number; y: number }) {
    const type = cardTypes.value.find((t) => t.typeCode === typeCode)
    if (!type) return
    const canvasW = currentCanvasWidth()
    const w = Math.min(640, Math.max(WORKSPACE_MIN_W, Math.round(canvasW / 2)))
    const h = defaultCardHeight(typeCode)
    const bottom = Object.values(geometryMap.value).reduce((max, r) => Math.max(max, r.y + r.h), 0)
    const pos = at ?? { x: 24, y: bottom + 20 }
    const existing = components.value.find((c) => c.key === typeCode)
    if (existing) {
      existing.visible = true
    } else {
      components.value.push({
        key: typeCode,
        visible: true,
        order: components.value.length + 1,
        span: type.defaultSpan,
        metadata: defaultMetadata(type),
      })
    }
    geometryMap.value[typeCode] = {
      x: Math.max(0, Math.round(pos.x)),
      y: Math.max(0, Math.round(pos.y)),
      w,
      h,
    }
    selectedKey.value = typeCode
    dirty.value = true
  }

  function dropPaletteCard(event: globalThis.DragEvent) {
    const payload = event.dataTransfer?.getData('text/plain') || draggingPayload.value
    draggingPayload.value = ''
    if (!payload.startsWith('palette:')) return
    const typeCode = payload.slice('palette:'.length)
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) {
      addComponent(typeCode)
      return
    }
    addComponent(typeCode, {
      x: event.clientX - rect.left - 180,
      y: event.clientY - rect.top - 90,
    })
  }

  /** 卡片体/标题栏按下进入移动；交互元素（按钮、链接等）不触发拖拽。 */
  function startCardDrag(
    event: globalThis.PointerEvent,
    key: string,
    mode: 'move' | 'resize',
    handle = '',
  ) {
    if (!editing.value || event.button !== 0) return
    const target = event.target as globalThis.HTMLElement | null
    if (mode === 'move' && target?.closest('button, a, input, textarea, select, label')) return
    event.preventDefault()
    selectedKey.value = key
    dragState.value = {
      key,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...rectOf(key) },
      pointerId: event.pointerId,
      moved: false,
    }
    canvasRef.value?.setPointerCapture?.(event.pointerId)
  }

  /** 点击空白画布取消选中。 */
  function onCanvasPointerDown(event: globalThis.PointerEvent) {
    const target = event.target as globalThis.HTMLElement | null
    if (target?.closest('.wsd-canvas-item')) return
    selectedKey.value = null
  }

  function onCanvasPointerMove(event: globalThis.PointerEvent) {
    const st = dragState.value
    if (!st || st.pointerId !== event.pointerId) return
    const dxRaw = event.clientX - st.startX
    const dyRaw = event.clientY - st.startY
    if (!st.moved && Math.hypot(dxRaw, dyRaw) > 2) {
      st.moved = true
      dirty.value = true
    }
    if (!st.moved) return
    const handle = st.mode === 'resize' ? st.handle : ''
    const raw = applyDragRect(st.orig, handle, dxRaw, dyRaw)
    const canvasW = canvasRef.value?.clientWidth ?? 1200
    const others = canvasItems.value.filter((c) => c.key !== st.key).map((c) => rectOf(c.key))
    const offsets = dragAxisOffsets(handle, st.orig)
    const snap = snapDelta(
      raw,
      collectCandidates(others, canvasW, canvasHeight.value),
      offsets.xs,
      offsets.ys,
      WORKSPACE_SNAP,
    )
    geometryMap.value[st.key] = applyDragRect(st.orig, handle, dxRaw + snap.dx, dyRaw + snap.dy)
    guides.value = {
      v: snap.guideX == null ? [] : [snap.guideX],
      h: snap.guideY == null ? [] : [snap.guideY],
    }
  }

  function onCanvasPointerUp(event: globalThis.PointerEvent) {
    const st = dragState.value
    if (!st || st.pointerId !== event.pointerId) return
    dragState.value = null
    guides.value = { v: [], h: [] }
    canvasRef.value?.releasePointerCapture?.(event.pointerId)
  }

  /** 观察画布实际宽度：分辨率或编辑态组件栏开合变化时等比缩放全部卡片几何。 */
  function attachCanvasObserver() {
    const Observer = globalThis.ResizeObserver
    if (!Observer) return
    canvasResizeObserver = new Observer((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      if (!next || next === canvasWidth.value) return
      const prev = canvasWidth.value
      canvasWidth.value = next
      if (prev > 0) geometryMap.value = rescaleRects(geometryMap.value, prev, next)
    })
    if (canvasRef.value) canvasResizeObserver.observe(canvasRef.value)
  }

  onMounted(() => {
    attachCanvasObserver()
  })

  onBeforeUnmount(() => {
    canvasResizeObserver?.disconnect()
    canvasResizeObserver = null
  })

  return {
    setCanvasRef,
    canvasWidth,
    geometryMap,
    guides,
    draggingPayload,
    dragState,
    selectedKey,
    canvasItems,
    canvasHeight,
    defaultCardHeight,
    currentCanvasWidth,
    hydrateGeometry,
    ensureGeometry,
    rectOf,
    itemStyle,
    startPaletteDrag,
    addComponent,
    dropPaletteCard,
    startCardDrag,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
  }
}
