import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

const queryTodoTasks = vi.fn()
const myInstances = vi.fn()
const queryMyCopies = vi.fn()
const queryCatalogItems = vi.fn()
const getWorkspaceLayout = vi.fn()
const saveWorkspaceLayout = vi.fn()
const resetWorkspaceLayout = vi.fn()

vi.mock('@/modules/workflow/api/oa', () => ({
  getWorkspaceLayout: (...args: unknown[]) => getWorkspaceLayout(...args),
  saveWorkspaceLayout: (...args: unknown[]) => saveWorkspaceLayout(...args),
  resetWorkspaceLayout: (...args: unknown[]) => resetWorkspaceLayout(...args),
  queryCatalogItems: (...args: unknown[]) => queryCatalogItems(...args),
  queryMyCopies: (...args: unknown[]) => queryMyCopies(...args),
}))
vi.mock('@/modules/workflow/api', () => ({
  queryTodoTasks: (...args: unknown[]) => queryTodoTasks(...args),
  myInstances: (...args: unknown[]) => myInstances(...args),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import WorkspaceEditor from './WorkspaceEditor.vue'
import type { WorkspaceCardType, WorkspaceLayoutResp } from '@/contracts/catalog'

function layoutResp(
  components: Array<{ key: string; visible: boolean; order: number; span?: number }>,
  custom = true,
): WorkspaceLayoutResp {
  const cardTypes: WorkspaceCardType[] = components.map((component, index) => ({
    id: index + 1,
    typeCode: component.key,
    displayName: component.key,
    rendererKey:
      component.key === 'favoriteItems'
        ? 'favorites'
        : component.key === 'myProcessed' ||
            component.key === 'myInitiated' ||
            component.key === 'cc'
          ? 'activity'
          : (component.key as never),
    metadataJson: '{}',
    defaultSpan: 1,
    defaultOrder: component.order,
    status: 0,
  }))
  return {
    custom,
    cardTypes,
    layout: {
      cards: components.map((component) => ({
        typeCode: component.key,
        visible: component.visible,
        order: component.order,
        span: component.span === 2 ? 2 : 1,
      })),
      favoriteItemKeys: [],
    },
  }
}

const global = {
  plugins: [createPinia()],
  stubs: {
    'el-button': {
      template: '<button><slot/></button>',
      props: ['icon', 'text', 'size', 'link', 'type', 'disabled'],
    },
    'el-checkbox': { template: '<input type="checkbox"/>', props: ['modelValue'] },
    'el-icon': { template: '<i><slot/></i>' },
    'el-message': { template: '<div/>' },
  },
  directives: { loading: {} },
}

describe('WorkspaceEditor 独立全屏编辑页 —— 所见即所得（V011-BUG-002）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([
        { key: 'todo', visible: true, order: 1, span: 2 },
        { key: 'favoriteItems', visible: true, order: 2 },
      ]),
    )
    queryTodoTasks.mockResolvedValue({ list: [{ taskId: 't1', name: '任务一' }] })
    queryCatalogItems.mockResolvedValue({ list: [] })
  })

  it('编辑页渲染工具栏、组件侧栏与真实卡片画布（所见即所得）', async () => {
    getWorkspaceLayout.mockResolvedValue(
      layoutResp(
        [
          { key: 'todo', visible: true, order: 1, span: 2 },
          { key: 'favoriteItems', visible: true, order: 2 },
        ],
        false,
      ),
    )
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    expect(wrapper.find('.wsd-toolbar').exists()).toBe(true)
    expect(wrapper.find('.wsd-palette').exists()).toBe(true)
    expect(wrapper.find('.wsd-toolbar__badge').text()).toContain('默认布局')
    expect(wrapper.findAll('.wsd-canvas-item')).toHaveLength(2)
    // WYSIWYG：画布内是与首页一致的真实卡片内容（我的待办面板 + 真实任务行）
    expect(wrapper.find('.wsd-panel--todo').exists()).toBe(true)
    expect(wrapper.find('.wsd-panel--todo').text()).toContain('我的待办')
    expect(wrapper.find('.wsd-panel--todo').text()).toContain('任务一')
    // 编辑页无首页欢迎区与齿轮
    expect(wrapper.find('.wsd-hero').exists()).toBe(false)
  })

  it('组件库点击可重新启用隐藏卡片并标记待保存', async () => {
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([
        { key: 'todo', visible: true, order: 1, span: 2 },
        { key: 'messages', visible: true, order: 2 },
      ]),
    )
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    const paletteItems = wrapper.findAll('.wsd-palette-item')
    expect(paletteItems).toHaveLength(2)
    const nodes = wrapper.findAll('.wsd-canvas-item')
    expect(nodes).toHaveLength(2)
    await nodes[1].find('.wsd-canvas-item__btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.wsd-canvas-item.is-hidden').exists()).toBe(true)

    await paletteItems[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.wsd-canvas-item.is-hidden').exists()).toBe(false)
    expect(
      wrapper.find('.wsd-toolbar__actions .wsd-btn--primary').attributes('disabled'),
    ).toBeUndefined()
  })

  it('保存布局时把画布几何写入卡片元数据', async () => {
    saveWorkspaceLayout.mockResolvedValue(undefined)
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([{ key: 'todo', visible: true, order: 1, span: 2 }]),
    )
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    await wrapper.find('.wsd-canvas-item__btn').trigger('click')
    await wrapper.find('.wsd-toolbar__actions .wsd-btn--primary').trigger('click')
    await flushPromises()

    expect(saveWorkspaceLayout).toHaveBeenCalledTimes(1)
    const payload = saveWorkspaceLayout.mock.calls[0][0]
    expect(payload.cards[0].metadata.geometry).toEqual({ x: 0, y: 0, w: 1200, h: 360 })
  })

  it('退出编辑返回工作台', async () => {
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    mockPush.mockClear()
    await wrapper.find('.wsd-toolbar__actions .wsd-btn:last-child').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/workspace')
  })
})
