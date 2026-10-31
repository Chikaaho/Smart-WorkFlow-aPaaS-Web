/**
 * 全屏工作台配置的卡片模型、12 列布局与旧布局映射。
 *
 * 保存时仍写入既有 /system/workspace/layout：cards[] + metadata，
 * 同时把 12 列几何折算为既有首页画布使用的 x/w 分数与 y/h 像素。
 */
import type { WorkspaceCard } from '@/contracts/catalog'
import {
  defaultChartConfig,
  defaultChartStyle,
  newInstanceId,
  pickDefaultGroupField,
  pickDefaultNumericField,
  type WorkspaceChartType,
  type WorkspaceDataConfig,
} from './workspace-data'
import {
  BUILTIN_BY_CODE,
  rendererKeyFor,
  type BuiltinWorkspaceComponent,
} from './workspace-components'
import type { WorkspaceField } from '../api/workspace-analytics'

export const GRID_COLUMNS = 12
export const GRID_GAP = 16

export interface StudioCard {
  id: string
  typeCode: string
  title: string
  span: number
  height: number
  config: WorkspaceDataConfig
  /** 旧布局的原始 metadata（系统卡片配置等）原样保留。 */
  metadata: Record<string, unknown>
  /**
   * 设计 3:2 参考预设几何（canvas 相对：y/h 像素、x/w 分数）。
   * 重置后的未拖动状态直接采用；拖动/调宽后清除，回退 12 列流式排布。
   */
  presetGeometry?: { x: number; y: number; w: number; h: number }
}

/**
 * 设计 3:2 默认几何（B021-007 批次5：四张独立指标卡替代统计概览组合卡，
 * WorkspaceBoard.DEFAULT_CARD_GEOMETRY 同源数值）：
 * 指标卡 4×(0.25,0,?,112) / 待办(0,128,0.632,486) / 快捷(0.644,128,0.356,208) /
 * 效能(0.644,368,0.356,262) / 动态(0,646,1,260)。
 * 右栏「快捷+效能」纵向堆叠无法由 12 列行模型表达，重置态按此绝对几何保存。
 */
export const DESIGN_PRESET_GEOMETRY: Record<
  string,
  { x: number; y: number; w: number; h: number }
> = {
  stats: { x: 0, y: 0, w: 1, h: 96 },
  statTodo: { x: 0, y: 0, w: 0.25, h: 112 },
  statInitiated: { x: 0.25, y: 0, w: 0.25, h: 112 },
  statProcessed: { x: 0.5, y: 0, w: 0.25, h: 112 },
  statDrafts: { x: 0.75, y: 0, w: 0.25, h: 112 },
  todo: { x: 0, y: 128, w: 0.632, h: 486 },
  favoriteItems: { x: 0.644, y: 128, w: 0.356, h: 208 },
  efficiency: { x: 0.644, y: 368, w: 0.356, h: 262 },
  activity: { x: 0, y: 646, w: 1, h: 260 },
}

export interface PackedRect {
  x: number
  y: number
  w: number
  h: number
  col: number
  row: number
}

export interface PackResult {
  positions: Record<string, PackedRect>
  height: number
}

export function componentOf(typeCode: string): BuiltinWorkspaceComponent | undefined {
  return BUILTIN_BY_CODE.get(typeCode)
}

export function kindOf(typeCode: string): 'system' | 'metric' | 'chart' | 'list' {
  const renderer = rendererKeyFor(typeCode)
  if (renderer === 'metric') return 'metric'
  if (renderer === 'chart') return 'chart'
  if (renderer === 'list') return 'list'
  return 'system'
}

export function chartTypeOf(card: StudioCard): WorkspaceChartType {
  return card.config.chartType ?? componentOf(card.typeCode)?.chartType ?? 'bar'
}

export function defaultCard(
  typeCode: string,
  title: string,
  chartType?: WorkspaceChartType,
): StudioCard {
  const builtin = componentOf(typeCode)
  const kind = kindOf(typeCode)
  let config: WorkspaceDataConfig = {}
  if (kind === 'metric') {
    config = { metricAgg: 'COUNT', metricFormat: 'integer', filters: [] }
  } else if (kind === 'chart') {
    config = {
      ...defaultChartConfig(chartType ?? builtin?.chartType ?? 'bar'),
      filters: [],
    }
    config.chartType = chartType ?? builtin?.chartType ?? 'bar'
    config.style = defaultChartStyle()
  } else if (kind === 'list') {
    config = {
      columns: [],
      sortOrder: 'DESC',
      presentation: 'paged',
      pageSize: 5,
      filters: [],
    }
  }
  if (kind !== 'system' && chartType) {
    config.chartType = chartType
  }
  return {
    id: newInstanceId(typeCode),
    typeCode,
    title,
    span: builtin?.defaultSpan ?? 6,
    height: builtin?.defaultHeight ?? 280,
    config,
    metadata: {},
  }
}

/** 旧布局卡片 → 编辑模型。旧卡片按既有 x/w 分数折算列宽。 */
export function fromWorkspaceCard(
  card: WorkspaceCard,
  index: number,
  label: (typeCode: string) => string,
): StudioCard {
  const typeCode = card.typeCode
  const builtin = componentOf(typeCode)
  const kind = kindOf(typeCode)
  const metadata = { ...(card.metadata ?? {}) }
  const geometry = metadata.geometry as
    | { x?: number; y?: number; w?: number; h?: number }
    | undefined
  const span = card.instanceId
    ? Math.max(1, Math.min(12, card.span ?? 6))
    : card.span === 2
      ? 12
      : geometry?.w
        ? Math.max(1, Math.min(12, Math.round(geometry.w * GRID_COLUMNS)))
        : 6
  const height =
    card.height ??
    (Number(geometry?.h) >= 120 ? Number(geometry?.h) : (builtin?.defaultHeight ?? 280))
  const chartType =
    (metadata.dataConfig as WorkspaceDataConfig | undefined)?.chartType ?? builtin?.chartType
  const legacyConfig = (metadata.dataConfig as WorkspaceDataConfig | undefined) ?? {}
  return {
    id: card.instanceId || `${typeCode}-${index}`,
    typeCode,
    title: String(metadata.title ?? label(typeCode)),
    span,
    height,
    config:
      kind === 'system'
        ? legacyConfig
        : { ...defaultCard(typeCode, label(typeCode), chartType).config, ...legacyConfig },
    metadata,
  }
}

/** 12 列顺序流式排布；不足一行的尾卡保持原列宽。 */
export function packCards(cards: StudioCard[]): PackResult {
  const positions: Record<string, PackedRect> = {}
  let row = 0
  let col = 0
  let rowHeight = 0
  let y = 0
  for (const card of cards) {
    const span = Math.max(1, Math.min(GRID_COLUMNS, Math.round(card.span)))
    if (col + span > GRID_COLUMNS) {
      y += rowHeight + GRID_GAP
      row += 1
      col = 0
      rowHeight = 0
    }
    positions[card.id] = { x: 0, y, w: 0, h: card.height, col, row }
    col += span
    rowHeight = Math.max(rowHeight, card.height)
    if (col === GRID_COLUMNS) {
      y += rowHeight + GRID_GAP
      row += 1
      col = 0
      rowHeight = 0
    }
  }
  return { positions, height: y + (rowHeight || cards[0]?.height || 0) }
}

/** 按实测画布宽度把列位置折算为像素；保存时再折算为 x/w 分数。 */
export function pixelRects(cards: StudioCard[], canvasWidth: number): Record<string, PackedRect> {
  // 重置后的未拖动卡片直接采用设计 3:2 预设几何（右栏堆叠等行模型外形态）。
  if (cards.every((card) => card.presetGeometry)) {
    const positions: Record<string, PackedRect> = {}
    for (const card of cards) {
      const preset = card.presetGeometry!
      positions[card.id] = {
        x: preset.x * canvasWidth,
        y: preset.y,
        w: preset.w * canvasWidth,
        h: preset.h,
        col: 0,
        row: 0,
      }
    }
    const height = Math.max(...cards.map((card) => card.presetGeometry!.y + card.presetGeometry!.h))
    void height
    return positions
  }
  const packed = packCards(cards)
  const usable = Math.max(320, canvasWidth)
  const columnWidth = (usable - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  for (const card of cards) {
    const position = packed.positions[card.id]
    if (!position) continue
    position.x = position.col * (columnWidth + GRID_GAP)
    position.w = card.span * columnWidth + (card.span - 1) * GRID_GAP
  }
  return packed.positions
}

export function toWorkspaceCards(
  cards: StudioCard[],
  positions: Record<string, PackedRect>,
  canvasWidth: number,
): WorkspaceCard[] {
  return cards.map((card, index) => {
    const position = positions[card.id] ?? { x: 0, y: 0, w: canvasWidth, h: card.height }
    const width = Math.max(1, canvasWidth)
    return {
      typeCode: card.typeCode,
      instanceId: card.id,
      visible: true,
      order: index + 1,
      span: card.span,
      height: card.height,
      metadata: {
        ...card.metadata,
        title: card.title,
        componentType: card.typeCode,
        dataConfig: card.config,
        geometry: {
          x: Number((position.x / width).toFixed(4)),
          y: Math.round(position.y),
          w: Number((position.w / width).toFixed(4)),
          h: Math.round(card.height),
        },
      },
    }
  })
}

/** 选择表单后补齐字段默认值；已有同字段配置保留。 */
export function applyFieldDefaults(card: StudioCard, fields: WorkspaceField[]): StudioCard {
  const kind = kindOf(card.typeCode)
  if (kind === 'system' || !fields.length) return card
  const groupFields = fields.filter((field) =>
    [
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
    ].includes(field.type),
  )
  const numericFields = fields.filter(
    (field) => field.type === 'NUMBER' || field.type === 'FORMULA',
  )
  const config = { ...card.config }
  if (kind === 'metric') {
    if (!config.metricField && numericFields.length) config.metricField = numericFields[0].name
    if (!config.metricAgg) config.metricAgg = numericFields.length ? 'SUM' : 'COUNT'
  } else if (kind === 'chart') {
    if (!config.groupBy) config.groupBy = pickDefaultGroupField(groupFields)
    if (config.chartType === 'scatter') {
      if (!config.xField) config.xField = pickDefaultNumericField(fields)
      if (!config.yField) {
        config.yField =
          numericFields.find((field) => field.name !== config.xField)?.name ??
          pickDefaultNumericField(fields)
      }
    }
    if (config.chartType === 'heatmap' && !config.groupBy2) {
      config.groupBy2 = groupFields.find((field) => field.name !== config.groupBy)?.name ?? ''
    }
    const hasConfiguredMetric = (config.metrics ?? []).some(
      (metric) => Boolean(metric.field) || metric.agg !== 'COUNT',
    )
    if (!hasConfiguredMetric) {
      const numeric = numericFields[0]
      config.metrics = [
        {
          field: numeric?.name ?? '',
          agg: numeric ? 'SUM' : 'COUNT',
          axis: 'left',
          presentation: 'bar',
          unit: '次',
          color: '',
        },
      ]
    }
  } else if (kind === 'list') {
    if (!config.columns?.length) {
      config.columns = groupFields.slice(0, 4).map((field) => ({
        field: field.name,
        label: field.label,
      }))
    }
    if (!config.sortField) config.sortField = groupFields[0]?.name
  }
  config.filters = config.filters ?? []
  return { ...card, config }
}
