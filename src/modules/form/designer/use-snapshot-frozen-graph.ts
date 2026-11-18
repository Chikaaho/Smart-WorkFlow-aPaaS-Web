import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useI18n } from '@/locales'
import type { SnapshotProcessSource } from './published-snapshot'
import { asRecord } from './use-snapshot-labels'

/* ── G14（272:1518）冻结消费者：冻结图渲染 / 通知 / 编号 / 表单事件 / 字段类型属性 ── */

export type FrozenGraphNode = { id: string; type: string; label: string; x: number; y: number }
export type FrozenGraphEdge = {
  id: string
  source: string
  target: string
  waypoints: Array<{ x: number; y: number }>
}
export type FrozenLayoutNode = FrozenGraphNode & { derived: boolean }

export const FROZEN_EVENT_TYPES = new Set(['START', 'END'])
export const FROZEN_GATEWAY_TYPES = new Set(['GATEWAY', 'CONDITION', 'PARALLEL_GATEWAY'])

/**
 * 冻结图查看层：从选中冻结流程版本派生只读图布局、视盒、通知、编号与表单事件投影。
 * selectedProcess / rawDefinition 由主文件的数据面提供。
 */
export function useSnapshotFrozenGraph(
  selectedProcess: ComputedRef<SnapshotProcessSource | null>,
  rawDefinition: Ref<Record<string, unknown> | null>,
) {
  const { t } = useI18n()

  const frozenGraph = computed<{ nodes: FrozenGraphNode[]; edges: FrozenGraphEdge[] }>(() => {
    const graph = asRecord(selectedProcess.value?.graph)
    const elements = Array.isArray(graph?.elements) ? (graph?.elements as unknown[]) : []
    const nodes: FrozenGraphNode[] = []
    const edges: FrozenGraphEdge[] = []
    for (const entry of elements) {
      const el = asRecord(entry)
      const id = el && typeof el.id === 'string' ? el.id : ''
      if (!el || !id) continue
      if (el.kind === 'node') {
        const config = asRecord(el.config) ?? {}
        nodes.push({
          id,
          type: typeof el.type === 'string' ? el.type : 'NODE',
          label: typeof config.name === 'string' && config.name ? config.name : id,
          x: typeof el.x === 'number' ? el.x : 0,
          y: typeof el.y === 'number' ? el.y : 0,
        })
      } else if (el.kind === 'edge') {
        edges.push({
          id,
          source: typeof el.source === 'string' ? el.source : '',
          target: typeof el.target === 'string' ? el.target : '',
          waypoints: Array.isArray(el.waypoints)
            ? (el.waypoints as Array<Record<string, unknown>>).map((w) => ({
                x: Number(w.x) || 0,
                y: Number(w.y) || 0,
              }))
            : [],
        })
      }
    }
    return { nodes, edges }
  })

  const nodeById = computed(() => new Map(frozenLayoutNodes.value.map((n) => [n.id, n])))

  /* 272:1518（执行提示14）：缺坐标的冻结节点仅在查看层按真实拓扑确定性分离（不写回版本）；
     有真实坐标的节点原样保留。 */
  const frozenLayoutNodes = computed<FrozenLayoutNode[]>(() => {
    const { nodes, edges } = frozenGraph.value
    const laid: FrozenLayoutNode[] = nodes.map((n) => ({ ...n, derived: n.x === 0 && n.y === 0 }))
    if (!laid.some((n) => n.derived)) return laid
    const layerOf = new Map<string, number>()
    for (const n of laid) layerOf.set(n.id, 0)
    let changed = true
    while (changed) {
      changed = false
      for (const e of edges) {
        const sourceLayer = layerOf.get(e.source)
        if (sourceLayer == null) continue
        const targetLayer = layerOf.get(e.target)
        if (targetLayer == null || targetLayer < sourceLayer + 1) {
          layerOf.set(e.target, sourceLayer + 1)
          changed = true
        }
      }
    }
    const rowsPerLayer = new Map<number, number>()
    for (const n of laid) {
      if (!n.derived) continue
      const layer = layerOf.get(n.id) ?? 0
      const row = rowsPerLayer.get(layer) ?? 0
      rowsPerLayer.set(layer, row + 1)
      n.x = 140 + layer * 300
      n.y = 80 + row * 90
    }
    return laid
  })

  function frozenNodeCenter(id: string): { x: number; y: number } | null {
    const node = nodeById.value.get(id)
    return node ? { x: node.x, y: node.y } : null
  }

  function frozenEdgePoints(edge: FrozenGraphEdge): Array<{ x: number; y: number }> {
    const source = frozenNodeCenter(edge.source)
    const target = frozenNodeCenter(edge.target)
    if (!source || !target) return []
    return [source, ...edge.waypoints, target]
  }

  const frozenViewBoxRect = computed<{ x: number; y: number; w: number; h: number } | null>(() => {
    const nodes = frozenLayoutNodes.value
    if (nodes.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    for (const node of nodes) {
      const halfW = FROZEN_EVENT_TYPES.has(node.type)
        ? 64
        : FROZEN_GATEWAY_TYPES.has(node.type)
          ? 14
          : 115
      grow(node.x - halfW, node.y - 22)
      grow(node.x + halfW, node.y + 22)
    }
    for (const edge of frozenGraph.value.edges)
      for (const p of frozenEdgePoints(edge)) grow(p.x, p.y)
    if (!Number.isFinite(minX)) return null
    return { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 }
  })

  /* 初始展示 1:1：宽高属性等于视盒尺寸，不做放大。 */
  const frozenViewBox = computed<string | null>(() => {
    const r = frozenViewBoxRect.value
    return r ? [r.x, r.y, r.w, r.h].join(' ') : null
  })

  const frozenNotification = computed<Record<string, unknown> | null>(() => {
    const graph = asRecord(selectedProcess.value?.graph)
    return asRecord(graph?.notification)
  })

  function notificationText(key: string): string {
    const value = frozenNotification.value?.[key]
    if (key === 'channels') {
      return Array.isArray(value) && value.length
        ? value
            .map((c) => (c === 'IN_APP' ? t('form.snapshotViewer.channelInApp') : String(c)))
            .join('、')
        : t('form.snapshotViewer.propNotConfigured')
    }
    if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
    return value ? String(value) : t('form.snapshotViewer.propNotConfigured')
  }

  const frozenNumbering = computed<unknown>(() => {
    const raw = asRecord(rawDefinition.value)
    return raw?.numbering ?? null
  })

  const frozenFormEvents = computed<
    Array<{
      kind: string
      rows: Array<{ id: string; name: string; script: string; enabled: boolean }>
    }>
  >(() => {
    const events = asRecord(asRecord(rawDefinition.value)?.events)
    if (!events) return []
    const kinds: Array<[string, string]> = [
      ['onLoad', 'eventOnLoad'],
      ['beforeSubmitHandler', 'eventBeforeSubmit'],
      ['afterSubmitHandler', 'eventAfterSubmit'],
    ]
    return kinds
      .map(([key, labelKey]) => ({
        kind: t('form.snapshotViewer.' + labelKey),
        rows: (Array.isArray(events[key]) ? (events[key] as unknown[]) : [])
          .map((row) => asRecord(row))
          .filter((row): row is Record<string, unknown> => !!row)
          .map((row) => ({
            id: typeof row.id === 'string' ? row.id : '',
            name: typeof row.name === 'string' ? row.name : '',
            script: typeof row.script === 'string' ? row.script : '',
            enabled: row.enabled !== false,
          })),
      }))
      .filter((group) => group.rows.length > 0)
  })

  return {
    frozenGraph,
    nodeById,
    frozenLayoutNodes,
    frozenNodeCenter,
    frozenEdgePoints,
    frozenViewBoxRect,
    frozenViewBox,
    frozenNotification,
    notificationText,
    frozenNumbering,
    frozenFormEvents,
  }
}
