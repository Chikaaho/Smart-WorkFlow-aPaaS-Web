/**
 * Agent 图目录接缝（0.2.4）：iot 规则页对已发布图下拉的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；跨模块交互
 * 经本 adapter 薄接缝收敛——动态 import 保持懒加载（失败不阻塞规则管理主链），
 * 视图类型经类型查询导出（不建立运行时依赖）。后续若沉淀正式 facade，仅换本文件数据源。
 */

/** 图下拉选项：value 为已发布图 key（发布后冻结），label 为业务可读名称。 */
export interface AgentGraphOption {
  label: string
  value: string
}

/** 已发布 Agent 图选项列表（失败由调用方按空列表处理，退化为手输图 key）。 */
export async function listPublishedGraphOptions(): Promise<AgentGraphOption[]> {
  const { pageGraphDefs } = await import('@/modules/agent/api')
  const page = await pageGraphDefs({ pageNum: 1, pageSize: 100 })
  return page.list
    .filter((g) => g.status === 'PUBLISHED')
    .map((g) => ({ label: `${g.name} (${g.graphKey})`, value: g.graphKey }))
}

/* ── 1.2.0 P67（E1-1）：流程设计器 Graph 执行器节点的绑定数据源 ── */

import type { AgentGraphDef, AgentGraphSnapshot, AgentGraphVersionBinding } from '@/contracts/agent'

export type { AgentGraphDef, AgentGraphSnapshot, AgentGraphVersionBinding }

/** 已发布图定义列表（含 id/最新版本/执行超时；设计器绑定下拉数据源）。 */
export async function listPublishedGraphDefs(): Promise<AgentGraphDef[]> {
  const { pageGraphDefs } = await import('@/modules/agent/api')
  const page = await pageGraphDefs({ pageNum: 1, pageSize: 100 })
  return page.list.filter((g) => g.status === 'PUBLISHED')
}

/** 指定图的历史发布版本（新版本在前）。 */
export async function listGraphVersions(id: number | string): Promise<AgentGraphSnapshot[]> {
  const { listGraphDefVersions } = await import('@/modules/agent/api')
  return listGraphDefVersions(id)
}

/** 固定版本绑定描述：开始/结束参数声明、执行超时上限、是否含人工节点。 */
export async function getGraphVersionBinding(
  id: number | string,
  version: number,
): Promise<AgentGraphVersionBinding> {
  const { getGraphVersionBinding: fetch } = await import('@/modules/agent/api')
  return fetch(id, version)
}
