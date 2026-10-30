/**
 * 工作台数据组件配置模型与展示工具。
 *
 * 只描述客户端可编辑的受控配置；字段/记录权限仍由服务端解析，
 * 这里的字段清单来自服务端“当前账号可见字段”端点。
 */
import type { WorkspaceAgg, WorkspaceFilter, WorkspaceFilterOp } from '../api/workspace-analytics'

export type WorkspaceChartType =
  | 'bar'
  | 'hbar'
  | 'line'
  | 'area'
  | 'combo'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'radar'
  | 'funnel'
  | 'gauge'
  | 'heatmap'

export type WorkspacePaletteKey = 'classic' | 'fresh' | 'warm' | 'custom'

export interface WorkspaceMetricConfig {
  field: string
  /** 图表面向用户展示的字段名（不参与查询）。 */
  label?: string
  agg: WorkspaceAgg
  axis: 'left' | 'right'
  presentation: 'bar' | 'line' | 'area'
  unit: string
  color: string
}

export interface WorkspaceColumnConfig {
  field: string
  label: string
  /** 列宽（px）；缺省表示沿用列表自适应布局。 */
  width?: number
}

export interface WorkspaceChartStyle {
  palette: WorkspacePaletteKey
  seriesColors: Record<string, string>
  legend: boolean
  labels: boolean
  grid: boolean
  stack: 'group' | 'stack'
  legendPosition: 'top' | 'bottom'
  gradient: [string, string]
}

export interface WorkspaceAxisScale {
  /** 固定上限；null/缺省表示自动取当前数据最大值。 */
  left?: number | null
  right?: number | null
}

export interface WorkspaceDataConfig {
  title?: string
  formKey?: string
  formVersion?: number
  groupBy?: string
  groupBy2?: string
  metrics?: WorkspaceMetricConfig[]
  metricField?: string
  metricAgg?: WorkspaceAgg
  metricFormat?: 'integer' | 'decimal' | 'percent'
  filters?: WorkspaceFilter[]
  columns?: WorkspaceColumnConfig[]
  sortField?: string
  sortOrder?: 'ASC' | 'DESC'
  presentation?: 'paged' | 'auto'
  pageSize?: number
  chartType?: WorkspaceChartType
  /** 散点图 X 轴数值字段。 */
  xField?: string
  /** 散点图 Y 轴数值字段。 */
  yField?: string
  /** 仪表盘目标值。 */
  target?: number
  /** 直角坐标系的左右轴上限；null/缺省为自动。 */
  axisScale?: WorkspaceAxisScale
  style?: WorkspaceChartStyle
}

export const PALETTES: Record<WorkspacePaletteKey, string[]> = {
  classic: ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'],
  fresh: ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e'],
  warm: ['#f97316', '#ec4899', '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6'],
  custom: ['#ec4899', '#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'],
}

export function defaultChartStyle(): WorkspaceChartStyle {
  return {
    palette: 'classic',
    seriesColors: {},
    legend: true,
    labels: true,
    grid: true,
    stack: 'group',
    legendPosition: 'top',
    gradient: ['#dbeafe', '#7c3aed'],
  }
}

export function paletteColors(style?: WorkspaceChartStyle): string[] {
  return PALETTES[style?.palette ?? 'classic'] ?? PALETTES.classic
}

export function seriesColor(style: WorkspaceChartStyle | undefined, index: number, key?: string) {
  if (key && style?.seriesColors?.[key]) return style.seriesColors[key]
  return paletteColors(style)[index % paletteColors(style).length]
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export interface ParsedHexColor {
  hex: string
  opacity: number
}

/** 解析 #RGB/#RRGGBB/#RRGGBBAA；非法值回退，透明度按 0—100 返回。 */
export function parseHexColor(value: string | undefined, fallback = '#7c3aed'): ParsedHexColor {
  const raw = (value ?? '').trim()
  if (!HEX_COLOR.test(raw)) return { hex: fallback, opacity: 100 }
  let digits = raw.slice(1)
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((char) => char + char)
      .join('')
  }
  const opacity =
    digits.length === 8 ? Math.round((Number.parseInt(digits.slice(6, 8), 16) / 255) * 100) : 100
  return { hex: `#${digits.slice(0, 6).toLowerCase()}`, opacity }
}

/** 6 位 HEX + 0—100 不透明度 → 8 位 HEX（100% 时省略 alpha）。 */
export function composeHexColor(hex: string, opacity: number): string {
  const base = parseHexColor(hex).hex
  const alpha = Math.max(0, Math.min(100, Math.round(opacity)))
  if (alpha >= 100) return base
  const byte = Math.round((alpha / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${base}${byte}`
}

export function defaultMetrics(style?: WorkspaceChartStyle): WorkspaceMetricConfig[] {
  return [
    {
      field: '',
      agg: 'COUNT',
      axis: 'left',
      presentation: 'bar',
      unit: '次',
      color: seriesColor(style, 0),
    },
  ]
}

export function defaultChartConfig(chartType: WorkspaceChartType): Partial<WorkspaceDataConfig> {
  const base = {
    chartType,
    style: defaultChartStyle(),
    metrics: defaultMetrics(defaultChartStyle()),
  }
  if (chartType === 'scatter') {
    return { ...base, xField: '', yField: '' }
  }
  if (chartType === 'gauge') {
    return { ...base, target: 100 }
  }
  return base
}

export function formatMetricValue(
  value: unknown,
  format: WorkspaceDataConfig['metricFormat'] = 'integer',
  unit = '',
): string {
  if (value == null || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numeric)) return String(value)
  let text: string
  if (format === 'percent') text = `${numeric.toFixed(1)}%`
  else if (format === 'decimal') text = numeric.toFixed(2)
  else text = String(Math.round(numeric))
  return unit ? `${text} ${unit}` : text
}

export function formatChartValue(value: unknown, unit = ''): string {
  if (value == null || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numeric)) return String(value)
  const text = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
  return unit ? `${text}${unit}` : text
}

export function isGroupableType(type: string): boolean {
  return [
    'TEXT',
    'NUMBER',
    'DATE',
    'TIME',
    'BOOL',
    'DICT',
    'REFERENCE',
    'USER',
    'DEPT',
    'FORMULA',
  ].includes(type)
}

export function isNumericType(type: string): boolean {
  return type === 'NUMBER' || type === 'FORMULA'
}

export function isListableType(type: string): boolean {
  return isGroupableType(type)
}

export function opsForFieldType(type: string): WorkspaceFilterOp[] {
  if (type === 'TEXT') return ['EQ', 'LIKE']
  if (type === 'NUMBER') return ['EQ', 'GE', 'LE']
  if (type === 'DATE' || type === 'TIME') return ['EQ', 'GE', 'LE']
  if (type === 'BOOL' || type === 'DICT' || type === 'REFERENCE') return ['EQ']
  return ['EQ']
}

/** 图表默认维度字段：优先字典/文本，其次第一个可用字段。 */
export function pickDefaultGroupField(fields: Array<{ name: string; type: string }>): string {
  const preferred = fields.find(
    (field) => field.type === 'DICT' || field.type === 'TEXT' || field.type === 'BOOL',
  )
  return preferred?.name ?? fields[0]?.name ?? ''
}

/** 图表默认数值字段：优先 NUMBER，其次 FORMULA。 */
export function pickDefaultNumericField(fields: Array<{ name: string; type: string }>): string {
  return (
    fields.find((field) => field.type === 'NUMBER')?.name ??
    fields.find((field) => field.type === 'FORMULA')?.name ??
    ''
  )
}

/** 新卡片实例标识：稳定、可读、避免同类型冲突。 */
export function newInstanceId(typeCode: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${typeCode.replace(/_/g, '-')}-${Date.now().toString(36)}-${random}`
}
