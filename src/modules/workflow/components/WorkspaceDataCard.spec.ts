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

describe('WorkspaceDataCard 数据列表自动滚动', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceFields.mockResolvedValue(fields)
    queryWorkspaceRows.mockResolvedValue({
      records: [
        { id: 'r1', type: 'A', amount: 30 },
        { id: 'r2', type: 'A', amount: 20 },
        { id: 'r3', type: 'B', amount: 10 },
      ],
      total: 9,
      pageNum: 1,
      pageSize: 3,
    })
  })

  function mountList(config: Record<string, unknown>) {
    return mountCard('list', {
      columns: [{ field: 'type', label: '类型' }],
      presentation: 'auto',
      pageSize: 3,
      ...config,
    })
  }

  it('未配置滚动间隔时按 3 秒翻页，配置后按配置间隔翻页', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountList({})
      await vi.advanceTimersByTimeAsync(0)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 1 }))
      expect(wrapper.text()).toContain('告警')
      // 3 秒内不翻页
      await vi.advanceTimersByTimeAsync(2999)
      expect(queryWorkspaceRows).toHaveBeenCalledTimes(1)
      // 缺省 3 秒触发翻到第 2 页
      await vi.advanceTimersByTimeAsync(1)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }))

      // 配置 5 秒间隔后按 5 秒翻页
      await wrapper.setProps({
        config: {
          formKey: 'f1',
          presentation: 'auto',
          pageSize: 3,
          autoScrollInterval: 5,
          columns: [{ field: 'type', label: '类型' }],
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }))
      await vi.advanceTimersByTimeAsync(4999)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }))
      await vi.advanceTimersByTimeAsync(1)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 3 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('悬停暂停翻页，移开恢复；悬停暂停关闭时不暂停', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountList({})
      await vi.advanceTimersByTimeAsync(0)
      const list = wrapper.find('[data-testid="wdata-list"]')
      await list.trigger('mouseenter')
      expect(list.attributes('data-auto-hover-paused')).toBe('true')
      await vi.advanceTimersByTimeAsync(9000)
      expect(queryWorkspaceRows).toHaveBeenCalledTimes(1)
      await list.trigger('mouseleave')
      expect(list.attributes('data-auto-hover-paused')).toBe('false')
      await vi.advanceTimersByTimeAsync(3000)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }))

      // 关闭悬停暂停后，悬停不再阻断翻页
      await wrapper.setProps({
        config: {
          formKey: 'f1',
          presentation: 'auto',
          pageSize: 3,
          autoScrollHoverPause: false,
          columns: [{ field: 'type', label: '类型' }],
        },
      })
      await vi.advanceTimersByTimeAsync(0)
      await list.trigger('mouseenter')
      await vi.advanceTimersByTimeAsync(3000)
      expect(queryWorkspaceRows).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 3 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('切回手动翻页后不再自动翻页', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountList({})
      await vi.advanceTimersByTimeAsync(0)
      await wrapper.setProps({
        config: {
          formKey: 'f1',
          presentation: 'paged',
          pageSize: 3,
          columns: [{ field: 'type', label: '类型' }],
        },
      })
      await vi.advanceTimersByTimeAsync(12000)
      expect(queryWorkspaceRows).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
