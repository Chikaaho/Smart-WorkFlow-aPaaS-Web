import { describe, expect, it } from 'vitest'
import {
  applyFieldDefaults,
  defaultCard,
  fromWorkspaceCard,
  packCards,
  pixelRects,
  toWorkspaceCards,
  type StudioCard,
} from './workspace-studio'
import type { WorkspaceField } from '../api/workspace-analytics'

const fields: WorkspaceField[] = [
  { name: 'type', label: '类型', type: 'DICT' },
  { name: 'amount', label: '金额', type: 'NUMBER' },
  { name: 'count', label: '数量', type: 'NUMBER' },
  { name: 'date', label: '日期', type: 'DATE' },
  { name: 'note', label: '说明', type: 'TEXT' },
]

let cardSeq = 0

function card(typeCode: string, span: number, height = 300): StudioCard {
  return {
    ...defaultCard(typeCode, typeCode),
    id: `${typeCode}-${span}-${++cardSeq}`,
    span,
    height,
  }
}

describe('workspace-studio 12 列布局', () => {
  it('按顺序流式排布：4 张 3 列卡同排，超宽换行且行高取最大值', () => {
    const cards = [
      card('metric', 3, 112),
      card('metric', 3, 150),
      card('metric', 3, 120),
      card('metric', 3, 130),
      card('chart_bar', 6, 320),
    ]
    const packed = packCards(cards)
    expect(packed.positions[cards[0].id]).toMatchObject({ col: 0, y: 0, h: 112 })
    expect(packed.positions[cards[1].id]).toMatchObject({ col: 3, y: 0 })
    expect(packed.positions[cards[3].id]).toMatchObject({ col: 9, y: 0 })
    expect(packed.positions[cards[4].id]).toMatchObject({ col: 0, y: 174 })
    expect(packed.height).toBe(174 + 320)
  })

  it('保存几何折算为首页画布使用的 x/w 分数与 y/h 像素', () => {
    const cards = [card('chart_line', 6, 320), card('chart_pie', 6, 300)]
    const positions = pixelRects(cards, 1200)
    expect(positions[cards[0].id]).toMatchObject({ x: 0, y: 0, h: 320 })
    expect(positions[cards[0].id].w).toBeCloseTo(588, 0)
    expect(positions[cards[1].id].x).toBeCloseTo(612, 0)
    const payload = toWorkspaceCards(cards, positions, 1200)
    expect(payload[0].instanceId).toBe(cards[0].id)
    expect(payload[0].span).toBe(6)
    expect(payload[0].height).toBe(320)
    const geometry = payload[0].metadata?.geometry as { x: number; y: number; w: number; h: number }
    expect(geometry.x).toBe(0)
    expect(geometry.w).toBeCloseTo(0.49, 3)
    expect(geometry.h).toBe(320)
    expect(payload[1].metadata?.geometry as { x: number }).toMatchObject({ x: 0.51 })
  })

  it('旧布局卡片按既有 span/geometry 折算列宽，并保留标题与 dataConfig', () => {
    const studio = fromWorkspaceCard(
      {
        typeCode: 'chart_bar',
        visible: true,
        order: 1,
        span: 1,
        metadata: {
          title: '已保存图表',
          dataConfig: { chartType: 'bar', groupBy: 'type' },
          geometry: { x: 0.25, y: 120, w: 0.5, h: 280 },
        },
      },
      0,
      () => '柱状图',
    )
    expect(studio.span).toBe(6)
    expect(studio.height).toBe(280)
    expect(studio.title).toBe('已保存图表')
    expect(studio.config.groupBy).toBe('type')
  })
})

describe('workspace-studio 字段默认值', () => {
  it('图表选择表单后补齐维度/数值指标；热力图补第二维度', () => {
    const base = card('chart_heatmap', 6, 340)
    const filled = applyFieldDefaults(
      { ...base, config: { ...base.config, formKey: 'f1', chartType: 'heatmap' } },
      fields,
    )
    expect(filled.config.groupBy).toBe('type')
    expect(filled.config.groupBy2).toBe('amount')
    expect(filled.config.metrics?.[0].field).toBe('amount')
    expect(filled.config.metrics?.[0].agg).toBe('SUM')
  })

  it('散点图补 X/Y 数值字段；列表补前 4 列与排序字段', () => {
    const scatter = applyFieldDefaults(
      { ...card('chart_scatter', 4), config: { chartType: 'scatter', metrics: [], filters: [] } },
      fields,
    )
    expect(scatter.config.xField).toBe('amount')
    expect(scatter.config.yField).toBe('count')

    const list = applyFieldDefaults(
      { ...card('dataList', 12), config: { columns: [], filters: [] } },
      fields,
    )
    expect(list.config.columns).toHaveLength(4)
    expect(list.config.columns?.[0]).toEqual({ field: 'type', label: '类型' })
    expect(list.config.sortField).toBe('type')
  })
})
