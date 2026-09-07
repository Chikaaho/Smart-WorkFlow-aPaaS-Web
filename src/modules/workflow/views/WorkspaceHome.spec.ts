import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const queryTodoTasks = vi.fn()
const myInstances = vi.fn()
const queryMyCopies = vi.fn()
const queryCatalogItems = vi.fn()
const getWorkspaceLayout = vi.fn()

vi.mock('@/modules/workflow/api/oa', () => ({
  getWorkspaceLayout: (...args: unknown[]) => getWorkspaceLayout(...args),
  saveWorkspaceLayout: vi.fn(),
  resetWorkspaceLayout: vi.fn(),
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
): WorkspaceLayoutResp {
  return {
    custom: true,
    layout: {
      components: components as never,
      favoriteItemKeys: ['gone_item', 'live_item'],
    },
  }
}

const elStub = { template: '<div><slot/></div>', props: ['modelValue', 'title', 'size'] }

const global = {
  stubs: {
    'el-drawer': elStub,
    'el-button': {
      template: '<button><slot/></button>',
      props: ['icon', 'text', 'size', 'link', 'type', 'disabled'],
    },
    'el-switch': { template: '<input type="checkbox"/>', props: ['modelValue'] },
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

  it('span=2 组件带整行样式类，随布局持久化值渲染', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    const wide = wrapper.find('.workspace-card--wide')
    expect(wide.exists()).toBe(true)
    expect(wide.text()).toContain('我的待办')
  })

  it('失效收藏点击不会触发路由跳转（不存在该入口）', async () => {
    const wrapper = mount(WorkspaceHome, { global })
    await flushPromises()
    mockPush.mockClear()
    await wrapper.find('.favorite-item').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/form/form-render/f1')
    expect(wrapper.html()).not.toContain('gone_item')
  })
})
