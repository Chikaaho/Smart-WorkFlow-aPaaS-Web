import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkspaceStudio from './WorkspaceStudio.vue'
import type { WorkspaceLayoutResp } from '@/contracts/catalog'

const getWorkspaceLayout = vi.fn()
const saveWorkspaceLayout = vi.fn()
const listWorkspaceSources = vi.fn()
const getWorkspaceFields = vi.fn()
const push = vi.fn()

vi.mock('@/modules/workflow/api/oa', () => ({
  getWorkspaceLayout: (...args: unknown[]) => getWorkspaceLayout(...args),
  saveWorkspaceLayout: (...args: unknown[]) => saveWorkspaceLayout(...args),
  queryCatalogItems: () => Promise.resolve({ list: [], total: 0 }),
}))

vi.mock('../api/workspace-analytics', () => ({
  listWorkspaceSources: (...args: unknown[]) => listWorkspaceSources(...args),
  getWorkspaceFields: (...args: unknown[]) => getWorkspaceFields(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

function layout(): WorkspaceLayoutResp {
  return {
    custom: true,
    cardTypes: [
      {
        id: 1,
        typeCode: 'todo',
        displayName: '我的待办',
        rendererKey: 'todo',
        metadataJson: '{}',
        defaultSpan: 1,
        defaultOrder: 1,
        status: 0,
      },
    ],
    layout: {
      cards: [
        {
          typeCode: 'todo',
          instanceId: 'todo-1',
          visible: true,
          order: 1,
          span: 6,
          height: 300,
          metadata: { title: '我的待办' },
        },
      ],
      favoriteItemKeys: [],
    },
  }
}

const stubs = {
  WorkspaceStudioCard: true,
  WorkspaceInspector: true,
  WorkspaceFilterDialog: true,
  WorkspaceColumnsDialog: true,
  WorkspaceMetricsDialog: true,
  WorkspaceChartTypeDialog: true,
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-icon': { template: '<i><slot /></i>' },
}

describe('WorkspaceStudio 全屏配置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceLayout.mockResolvedValue(layout())
    saveWorkspaceLayout.mockResolvedValue(undefined)
    listWorkspaceSources.mockResolvedValue([{ formKey: 'f1', name: '演练申请', formVersion: 3 }])
    getWorkspaceFields.mockResolvedValue({
      formKey: 'f1',
      formVersion: 3,
      fields: [
        { name: 'type', label: '类型', type: 'DICT' },
        { name: 'amount', label: '金额', type: 'NUMBER' },
      ],
    })
  })

  it('加载既有布局并渲染三栏组件库/画布/属性区', async () => {
    const wrapper = mount(WorkspaceStudio, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.wstudio').exists()).toBe(true)
    expect(wrapper.find('.wstudio__library').exists()).toBe(true)
    expect(wrapper.find('.wstudio__canvas').exists()).toBe(true)
    expect(wrapper.text()).toContain('卡片与组件')
    expect(wrapper.text()).toContain('指标卡')
    expect(wrapper.text()).toContain('数据列表')
    expect(wrapper.text()).toContain('热力图')
    expect(getWorkspaceLayout).toHaveBeenCalled()
  })

  it('添加图表自动绑定可见表单/字段并保存 12 列几何与 dataConfig', async () => {
    const wrapper = mount(WorkspaceStudio, { global: { stubs } })
    await flushPromises()
    const chartItem = wrapper
      .findAll('.wstudio__item')
      .find((item) => item.text().includes('柱状图'))
    expect(chartItem).toBeTruthy()
    await chartItem!.trigger('click')
    await flushPromises()

    await wrapper.find('.wstudio__btn--primary').trigger('click')
    await flushPromises()

    expect(saveWorkspaceLayout).toHaveBeenCalledTimes(1)
    const payload = saveWorkspaceLayout.mock.calls[0][0] as {
      cards: Array<Record<string, unknown>>
    }
    const chart = payload.cards.find((card) => card.typeCode === 'chart_bar')
    expect(chart).toBeTruthy()
    expect(chart?.instanceId).toBeTruthy()
    expect(chart?.span).toBe(4)
    const metadata = chart?.metadata as {
      title: string
      dataConfig: { formKey: string; groupBy: string; metrics: unknown[] }
      geometry: { x: number; y: number; w: number; h: number }
    }
    expect(metadata.title).toBe('柱状图')
    expect(metadata.dataConfig.formKey).toBe('f1')
    expect(metadata.dataConfig.groupBy).toBe('type')
    expect(metadata.dataConfig.metrics.length).toBeGreaterThan(0)
    expect(metadata.geometry.w).toBeGreaterThan(0)
    expect(metadata.geometry.h).toBe(320)
  })

  it('新增后可撤销回加载时布局', async () => {
    const wrapper = mount(WorkspaceStudio, { global: { stubs } })
    await flushPromises()
    const item = wrapper.findAll('.wstudio__item').find((entry) => entry.text().includes('指标卡'))
    await item!.trigger('click')
    await flushPromises()
    // 撤销按钮是工具栏第一个按钮
    await wrapper.findAll('.wstudio__btn')[0].trigger('click')
    await flushPromises()
    await wrapper.find('.wstudio__btn--primary').trigger('click')
    await flushPromises()
    const payload = saveWorkspaceLayout.mock.calls[0][0] as {
      cards: Array<Record<string, unknown>>
    }
    expect(payload.cards.some((card) => card.typeCode === 'metric')).toBe(false)
    expect(payload.cards).toHaveLength(1)
  })
})
