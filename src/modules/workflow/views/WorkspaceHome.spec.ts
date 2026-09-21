import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

const queryTodoTasks = vi.fn()
const myInstances = vi.fn()
const queryMyCopies = vi.fn()
const queryCatalogItems = vi.fn()
const getWorkspaceLayout = vi.fn()

vi.mock('@/modules/workflow/api/oa', () => ({
  getWorkspaceLayout: (...args: unknown[]) => getWorkspaceLayout(...args),
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

import WorkspaceHome from './WorkspaceHome.vue'
import type { WorkspaceLayoutResp } from '@/contracts/catalog'

function layoutResp(
  components: Array<{ key: string; visible: boolean; order: number; span?: number }>,
  custom = true,
): WorkspaceLayoutResp {
  return {
    custom,
    cardTypes: components.map((component, index) => ({
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
    })),
    layout: {
      cards: components.map((component) => ({
        typeCode: component.key,
        visible: component.visible,
        order: component.order,
        span: component.span === 2 ? 2 : 1,
      })),
      favoriteItemKeys: ['gone_item', 'live_item'],
    },
  }
}

const global = {
  // P53 起工作台读取 userStore（问候语 displayName），测试装配补 pinia，断言不变。
  plugins: [createPinia()],
  stubs: {
    'el-button': {
      template: '<button><slot/></button>',
      props: ['icon', 'text', 'size', 'link', 'type', 'disabled'],
    },
    'el-checkbox': { template: '<input type="checkbox"/>', props: ['modelValue'] },
    'el-tag': { template: '<span><slot/></span>' },
    'el-icon': { template: '<i><slot/></i>' },
    'el-message': { template: '<div/>' },
  },
  directives: { loading: {} },
}

describe('WorkspaceHome 布局与查询收敛（R4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([
        { key: 'todo', visible: true, order: 1, span: 2 },
        { key: 'myInitiated', visible: false, order: 2 },
        { key: 'cc', visible: false, order: 3 },
        { key: 'favoriteItems', visible: true, order: 4 },
      ]),
    )
    queryTodoTasks.mockResolvedValue({ list: [{ taskId: 't1', name: '任务一' }] })
    queryCatalogItems.mockResolvedValue({
      // 普通视角目录由服务端过滤：已失效/无权事项不在返回中
      list: [
        {
          itemKey: 'live_item',
          name: '在办事项',
          formKey: 'f1',
          categoryId: null,
          status: 'PUBLISHED',
          formPublished: true,
          bindingActive: true,
        },
      ],
    })
  })

  it('隐藏组件（myInitiated/cc）不发起任何数据查询', async () => {
    await mount(WorkspaceHome, { global }).vm.$nextTick()
    await flushPromises()
    expect(myInstances).not.toHaveBeenCalled()
    expect(queryMyCopies).not.toHaveBeenCalled()
    expect(queryTodoTasks).toHaveBeenCalledTimes(1)
  })

  it('失效收藏（不在当前可见目录）不渲染为可执行入口，有效收藏保留', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    const html = wrapper.html()
    // 收藏键 gone_item 不在当前可见目录 → 不渲染为入口；live_item 保留
    expect(html).not.toContain('已失效事项')
    expect(html).toContain('在办事项')
  })

  it('P53 新版信息架构：todo 面板随布局渲染（span 值仅保留在持久化契约）', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    // 新版（P53 设计01）：我的待办=固定设计面板（wsd-tasklist），span 不再驱动宽窄类
    expect(wrapper.find('.wsd-tasklist, .wsd-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('我的待办')
  })

  it('快捷发起渲染有效收藏并路由发起页；失效收藏不渲染入口', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    mockPush.mockClear()
    // gone_item 不在目录返回 → 快捷网格只有 live_item + 固定「更多事项」瓦片（P53 设计01）
    const quicks = wrapper.findAll('.wsd-quick')
    expect(quicks.length).toBe(2)
    expect(quicks[1].text()).toContain('更多事项')
    await quicks[0].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/form/form-render/f1')
  })

  it('齿轮跳转独立编辑页', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    mockPush.mockClear()
    const gear = wrapper.find('.wsd-hero__config')
    expect(gear.attributes('aria-label')).toBe('配置工作台')
    await gear.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/workspace/edit')
  })

  it('V011-BUG-003：保存的分数几何按当前画布宽度展开为像素渲染', async () => {
    const base = layoutResp([{ key: 'todo', visible: true, order: 1, span: 2 }])
    getWorkspaceLayout.mockResolvedValue({
      ...base,
      layout: {
        ...base.layout,
        cards: [
          {
            typeCode: 'todo',
            visible: true,
            order: 1,
            span: 1,
            metadata: { geometry: { x: 0.5, y: 0, w: 0.5, h: 360 } },
          },
        ],
      },
    })
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    // jsdom 无布局 → 名义画布宽 1200：分数 x/w=0.5 展开为 left/width 600px
    const style = wrapper.find('.wsd-canvas-item').attributes('style')
    expect(style).toContain('left: 600px')
    expect(style).toContain('width: 600px')
    expect(style).toContain('height: 360px')
  })

  it('V011-BUG-003：BUG-002 旧像素布局按设计宽度等比展开到当前画布', async () => {
    const base = layoutResp([{ key: 'todo', visible: true, order: 1, span: 2 }])
    getWorkspaceLayout.mockResolvedValue({
      ...base,
      layout: {
        ...base.layout,
        cards: [
          {
            typeCode: 'todo',
            visible: true,
            order: 1,
            span: 1,
            // 旧像素布局：设计宽度=600（单卡右缘），当前画布名义宽 1200 → 等比 ×2
            metadata: { geometry: { x: 0, y: 0, w: 600, h: 360 } },
          },
        ],
      },
    })
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    const style = wrapper.find('.wsd-canvas-item').attributes('style')
    expect(style).toContain('left: 0px')
    expect(style).toContain('width: 1200px')
    expect(style).toContain('height: 360px')
  })
})
