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
