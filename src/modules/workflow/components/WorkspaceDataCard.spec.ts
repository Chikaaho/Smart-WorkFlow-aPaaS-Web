import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkspaceDataCard from './WorkspaceDataCard.vue'
import { ApiError } from '@/foundation/request'

const getWorkspaceFields = vi.fn()
const aggregateWorkspace = vi.fn()
const queryWorkspaceRows = vi.fn()

vi.mock('../api/workspace-analytics', () => ({
  getWorkspaceFields: (...args: unknown[]) => getWorkspaceFields(...args),
  aggregateWorkspace: (...args: unknown[]) => aggregateWorkspace(...args),
  queryWorkspaceRows: (...args: unknown[]) => queryWorkspaceRows(...args),
}))

const fields = {
  formKey: 'f1',
  formVersion: 3,
  fields: [
    { name: 'type', label: '类型', type: 'DICT', options: [{ label: '告警', value: 'A' }] },
    { name: 'amount', label: '金额', type: 'NUMBER' },
    { name: 'count', label: '数量', type: 'NUMBER' },
  ],
}

const groups = [
  { key: 'A', values: [30, 2] },
  { key: 'B', values: [20, 1] },
]

function mountCard(kind: 'metric' | 'chart' | 'list', config: Record<string, unknown>) {
  return mount(WorkspaceDataCard, {
    props: { kind, config: { formKey: 'f1', ...config } },
  })
}

describe('WorkspaceDataCard 真实数据链', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceFields.mockResolvedValue(fields)
    aggregateWorkspace.mockResolvedValue({
      formKey: 'f1',
      formVersion: 3,
      groups,
      totalRecords: 3,
    })
    queryWorkspaceRows.mockResolvedValue({
      records: [{ id: 'r1', type: 'A', amount: 30 }],
      total: 1,
      pageNum: 1,
      pageSize: 5,
    })
  })

  it('指标卡走无维度聚合，显示真实值/记录数', async () => {
    const wrapper = mountCard('metric', {
      metricField: 'amount',
      metricAgg: 'SUM',
      metricFormat: 'integer',
    })
    await flushPromises()
    expect(aggregateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        formKey: 'f1',
        groupBy: null,
        metrics: [{ field: 'amount', agg: 'SUM' }],
      }),
    )
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('共 3 条记录')
  })

  it('图表按维度+多指标聚合，DICT 值显示标签', async () => {
    const wrapper = mountCard('chart', {
      chartType: 'bar',
      groupBy: 'type',
      metrics: [
        {
          field: 'amount',
          agg: 'SUM',
          axis: 'left',
          presentation: 'bar',
          unit: '次',
          color: '#7c3aed',
        },
      ],
    })
    await flushPromises()
    expect(aggregateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: 'type', groupBy2: null }),
    )
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('告警')
  })

  it('数据列表按列/排序/分页查询并展示真实行', async () => {
    const wrapper = mountCard('list', {
      columns: [
        { field: 'type', label: '类型' },
        { field: 'amount', label: '金额' },
      ],
      sortField: 'amount',
      sortOrder: 'DESC',
      presentation: 'paged',
      pageSize: 5,
    })
    await flushPromises()
    expect(queryWorkspaceRows).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ['type', 'amount'], sortField: 'amount', pageSize: 5 }),
    )
    expect(wrapper.text()).toContain('类型')
    expect(wrapper.text()).toContain('金额')
    expect(wrapper.text()).toContain('告警')
    expect(wrapper.text()).toContain('30')
  })

  it('接口拒绝显示可定位错误，不静默空态', async () => {
    aggregateWorkspace.mockRejectedValue(
      new ApiError(1106, '当前身份无该字段查看权限', 'PERMISSION_DENIED'),
    )
    const wrapper = mountCard('chart', {
      chartType: 'bar',
      groupBy: 'type',
      metrics: [],
    })
    await flushPromises()
    expect(wrapper.text()).toContain('当前身份无该字段查看权限')
    expect(wrapper.find('.wdata__retry').exists()).toBe(true)
  })

  it('未关联表单显示配置提示，不发起查询', async () => {
    const wrapper = mount(WorkspaceDataCard, {
      props: { kind: 'metric', config: {} },
    })
    await flushPromises()
    expect(getWorkspaceFields).not.toHaveBeenCalled()
    expect(aggregateWorkspace).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请在右侧选择关联表单')
  })
})
