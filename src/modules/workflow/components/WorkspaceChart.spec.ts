import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkspaceChart from './WorkspaceChart.vue'
import {
  defaultChartStyle,
  type WorkspaceChartType,
  type WorkspaceMetricConfig,
} from '../utils/workspace-data'
import type { WorkspaceAggregateGroup } from '../api/workspace-analytics'

const metrics: WorkspaceMetricConfig[] = [
  { field: 'amount', agg: 'SUM', axis: 'left', presentation: 'bar', unit: '次', color: '#7c3aed' },
  { field: 'count', agg: 'SUM', axis: 'right', presentation: 'line', unit: '%', color: '#3b82f6' },
]

const groups: WorkspaceAggregateGroup[] = [
  { key: 'A', key2: '甲', values: [10, 5] },
  { key: 'B', key2: '乙', values: [20, 8] },
  { key: 'C', key2: '甲', values: [15, 12] },
]

const types: WorkspaceChartType[] = [
  'bar',
  'hbar',
  'line',
  'area',
  'combo',
  'pie',
  'donut',
  'scatter',
  'radar',
  'funnel',
  'gauge',
  'heatmap',
]

function mountChart(type: WorkspaceChartType) {
  return mount(WorkspaceChart, {
    props: {
      chartType: type,
      groups,
      metrics,
      style: defaultChartStyle(),
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 5 },
        { x: 4, y: 3 },
      ],
      target: 20,
    },
  })
}

describe('WorkspaceChart 12 图型', () => {
  it.each(types)('%s 使用自身图型语义渲染且非空态', (type) => {
    const wrapper = mountChart(type)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('暂无数据')
  })

  it('柱状/条形/折线/面积/组合几何不同，不是同一静态柱图换名', () => {
    const rectCounts = types.slice(0, 5).map((type) => mountChart(type).findAll('rect').length)
    const polylineCounts = types
      .slice(0, 5)
      .map((type) => mountChart(type).findAll('polyline').length)
    // 条形图横向矩形 = 分类数 × 指标数，柱状图为分组矩形；折线/面积没有柱矩形。
    expect(rectCounts[1]).toBeGreaterThan(rectCounts[0])
    expect(rectCounts[2]).toBe(0)
    expect(polylineCounts[2]).toBeGreaterThan(0)
    expect(mountChart('area').findAll('path').length).toBeGreaterThan(0)
    expect(mountChart('combo').findAll('rect').length).toBeGreaterThan(0)
    expect(mountChart('combo').findAll('polyline').length).toBeGreaterThan(0)
  })

  it('饼图/环形图/雷达/漏斗/仪表盘/热力图保留各自语义', () => {
    expect(mountChart('pie').findAll('path').length).toBeGreaterThan(0)
    const donut = mountChart('donut')
    expect(donut.find('.wchart__donut-total').exists()).toBe(true)
    expect(mountChart('radar').findAll('polygon').length).toBeGreaterThan(0)
    expect(mountChart('funnel').text()).toContain('A')
    expect(mountChart('gauge').text()).toContain('目标')
    expect(mountChart('heatmap').findAll('rect').length).toBeGreaterThanOrEqual(6)
    expect(mountChart('scatter').findAll('circle').length).toBe(3)
  })
})
