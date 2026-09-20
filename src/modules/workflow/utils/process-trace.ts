/**
 * process-trace —— 任务图轨迹派生（TaskDetail / TaskGraphView 共用同一规则）。
 *
 * 只消费真实可得数据：
 * - 已完成 = 审批历史中已完结行（nodeKey 对不上图元素时按节点名回退匹配）；
 * - 活跃 = 当前任务节点 + 当前节点名匹配（双通道）；
 * - 路由前缀推断：起点到当前节点所有简单路径的公共前缀节点必然已流转完成
 *   （线性必经段以已完成态呈现；分支/汇聚语义不外推）。
 */
import type { ApprovalHistoryItem } from '@/contracts/bpm'
import type { ProcessGraphElement } from '@/contracts/process-graph'

export interface ProcessTraceResult {
  activeNodeIds: string[]
  completedNodeIds: string[]
}

export function deriveProcessTrace(input: {
  approvalHistory: ApprovalHistoryItem[]
  currentNodeKey: string
  currentNodeName: string
  elements: ProcessGraphElement[]
}): ProcessTraceResult {
  const { approvalHistory, currentNodeKey, currentNodeName, elements } = input
  const doneKeys = new Set<string>()
  const doneNames = new Set<string>()
  for (const row of approvalHistory) {
    if (row.endTime == null) continue
    if (typeof row.nodeKey === 'string' && row.nodeKey) doneKeys.add(row.nodeKey)
    if (row.taskName) doneNames.add(row.taskName)
  }
  const completedNodeIds = [...doneKeys]
  const activeNodeIds = currentNodeKey ? [currentNodeKey] : []
  for (const el of elements) {
    if (el.kind !== 'node') continue
    const elId = String(el.id)
    const name = String((el.config as { name?: unknown } | undefined)?.name ?? '')
    const isCurrentNode = (name && currentNodeName && name === currentNodeName) || activeNodeIds.includes(elId)
    if (isCurrentNode) {
      if (!activeNodeIds.includes(elId)) activeNodeIds.push(elId)
      continue
    }
    if (!completedNodeIds.includes(elId) && name && doneNames.has(name)) {
      completedNodeIds.push(elId)
    }
  }
  const outgoing = new Map<string, string[]>()
  let startId: string | null = null
  for (const el of elements) {
    if (el.kind !== 'edge' || !el.source || !el.target) continue
    outgoing.set(el.source, [...(outgoing.get(el.source) ?? []), el.target])
  }
  for (const el of elements) {
    if (el.kind === 'node' && el.type === 'START') startId = String(el.id)
  }
  const elementIds = new Set(
    elements.filter((el) => el.kind === 'node').map((el) => String(el.id)),
  )
  const currentId = activeNodeIds.find((id) => elementIds.has(id)) ?? null
  if (startId && currentId && startId !== currentId) {
    // 收集 start→current 的所有简单路径（节点数上限内 DFS）
    const paths: string[][] = []
    const walk = (node: string, trail: string[]) => {
      if (trail.length > 64 || paths.length >= 64) return
      for (const next of outgoing.get(node) ?? []) {
        if (trail.includes(next)) continue
        if (next === currentId) paths.push([...trail, next])
        else walk(next, [...trail, next])
      }
    }
    walk(startId, [startId])
    if (paths.length > 0) {
      const prefix = paths[0]
      for (const id of prefix) {
        if (id === currentId || completedNodeIds.includes(id)) continue
        if (paths.every((p) => p.includes(id))) completedNodeIds.push(id)
      }
    }
  }
  return {
    activeNodeIds,
    completedNodeIds: completedNodeIds.filter((id) => !activeNodeIds.includes(id)),
  }
}
