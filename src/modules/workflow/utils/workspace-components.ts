/**
 * 工作台内置组件目录（服务端安全注册器的前端镜像）。
 *
 * 数据组件不写入租户 sys_workspace_card_type；布局保存时由后端内置白名单
 * 校验，同一类型可用 instanceId 多实例。系统卡片仍来自租户卡片类型目录。
 */
import type { WorkspaceCardType, WorkspaceRendererKey } from '@/contracts/catalog'
import type { WorkspaceChartType } from './workspace-data'

export interface BuiltinWorkspaceComponent {
  typeCode: string
  rendererKey: WorkspaceRendererKey
  labelKey: string
  chartType?: WorkspaceChartType
  defaultSpan: number
  defaultHeight: number
}

export const SYSTEM_LIBRARY: BuiltinWorkspaceComponent[] = [
  {
    typeCode: 'statTodo',
    rendererKey: 'statMetric',
    labelKey: 'workspace.library.statTodo',
    defaultSpan: 3,
    defaultHeight: 112,
  },
  {
    typeCode: 'statInitiated',
    rendererKey: 'statMetric',
    labelKey: 'workspace.library.statInitiated',
    defaultSpan: 3,
    defaultHeight: 112,
  },
  {
    typeCode: 'statProcessed',
    rendererKey: 'statMetric',
    labelKey: 'workspace.library.statProcessed',
    defaultSpan: 3,
    defaultHeight: 112,
  },
  {
    typeCode: 'statDrafts',
    rendererKey: 'statMetric',
    labelKey: 'workspace.library.statDrafts',
    defaultSpan: 3,
    defaultHeight: 112,
  },
  {
    typeCode: 'todo',
    rendererKey: 'todo',
    labelKey: 'workspace.library.todo',
    defaultSpan: 6,
    defaultHeight: 300,
  },
  {
    typeCode: 'favoriteItems',
    rendererKey: 'favorites',
    labelKey: 'workspace.library.quickLaunch',
    defaultSpan: 6,
    defaultHeight: 300,
  },
  {
    typeCode: 'activity',
    rendererKey: 'activity',
    labelKey: 'workspace.library.activity',
    defaultSpan: 12,
    defaultHeight: 260,
  },
  {
    typeCode: 'efficiency',
    rendererKey: 'efficiency',
    labelKey: 'workspace.library.efficiency',
    defaultSpan: 6,
    defaultHeight: 280,
  },
]

export const DATA_LIBRARY: BuiltinWorkspaceComponent[] = [
  {
    typeCode: 'metric',
    rendererKey: 'metric',
    labelKey: 'workspace.library.metric',
    defaultSpan: 3,
    defaultHeight: 112,
  },
  {
    typeCode: 'chart_bar',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.bar',
    chartType: 'bar',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_hbar',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.hbar',
    chartType: 'hbar',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_line',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.line',
    chartType: 'line',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_area',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.area',
    chartType: 'area',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_combo',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.combo',
    chartType: 'combo',
    defaultSpan: 6,
    defaultHeight: 340,
  },
  {
    typeCode: 'chart_pie',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.pie',
    chartType: 'pie',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_donut',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.donut',
    chartType: 'donut',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_scatter',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.scatter',
    chartType: 'scatter',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_radar',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.radar',
    chartType: 'radar',
    defaultSpan: 4,
    defaultHeight: 340,
  },
  {
    typeCode: 'chart_funnel',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.funnel',
    chartType: 'funnel',
    defaultSpan: 4,
    defaultHeight: 320,
  },
  {
    typeCode: 'chart_gauge',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.gauge',
    chartType: 'gauge',
    defaultSpan: 3,
    defaultHeight: 300,
  },
  {
    typeCode: 'chart_heatmap',
    rendererKey: 'chart',
    labelKey: 'workspace.chartType.heatmap',
    chartType: 'heatmap',
    defaultSpan: 6,
    defaultHeight: 340,
  },
  {
    typeCode: 'dataList',
    rendererKey: 'list',
    labelKey: 'workspace.library.dataList',
    defaultSpan: 12,
    defaultHeight: 280,
  },
]

export const BUILTIN_COMPONENTS = [...SYSTEM_LIBRARY, ...DATA_LIBRARY]

export const BUILTIN_BY_CODE = new Map(BUILTIN_COMPONENTS.map((item) => [item.typeCode, item]))

export function isBuiltinType(typeCode: string): boolean {
  return BUILTIN_BY_CODE.has(typeCode)
}

export function rendererKeyFor(
  typeCode: string,
  cardTypes: WorkspaceCardType[] = [],
): WorkspaceRendererKey | string {
  const builtin = BUILTIN_BY_CODE.get(typeCode)
  if (builtin) return builtin.rendererKey
  return cardTypes.find((type) => type.typeCode === typeCode)?.rendererKey ?? typeCode
}

export function builtinLabelKey(typeCode: string): string | undefined {
  return BUILTIN_BY_CODE.get(typeCode)?.labelKey
}

export function builtinChartType(typeCode: string): WorkspaceChartType | undefined {
  return BUILTIN_BY_CODE.get(typeCode)?.chartType
}
