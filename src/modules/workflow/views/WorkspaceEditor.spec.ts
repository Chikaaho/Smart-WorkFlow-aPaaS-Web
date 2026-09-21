import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

const queryCatalogItems = vi.fn()
const getWorkspaceLayout = vi.fn()
const saveWorkspaceLayout = vi.fn()
const resetWorkspaceLayout = vi.fn()

vi.mock('@/modules/workflow/api/oa', () => ({
  getWorkspaceLayout: (...args: unknown[]) => getWorkspaceLayout(...args),
  saveWorkspaceLayout: (...args: unknown[]) => saveWorkspaceLayout(...args),
  resetWorkspaceLayout: (...args: unknown[]) => resetWorkspaceLayout(...args),
  queryCatalogItems: (...args: unknown[]) => queryCatalogItems(...args),
  queryMyCopies: vi.fn(),
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
      template: '<button :disabled="disabled"><slot/></button>',
      props: ['icon', 'text', 'size', 'link', 'type', 'disabled'],
    },
    'el-checkbox': { template: '<input type="checkbox"/>', props: ['modelValue'] },
    'el-icon': { template: '<i><slot/></i>' },
    'el-message': { template: '<div/>' },
  },
  directives: { loading: {} },
}

describe('WorkspaceEditor 独立全屏编辑页（V011-BUG-002）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([
        { key: 'todo', visible: true, order: 1, span: 2 },
        { key: 'favoriteItems', visible: true, order: 2 },
      ]),
    )
    queryCatalogItems.mockResolvedValue({ list: [] })
  })

  it('独立页面直接渲染编辑器顶栏、组件侧栏与空白画布', async () => {
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
    expect(wrapper.find('.we-topbar').exists()).toBe(true)
    expect(wrapper.find('.we-topbar__badge').text()).toContain('默认布局')
    expect(wrapper.find('.we-palette').exists()).toBe(true)
    expect(wrapper.find('.we-canvas').exists()).toBe(true)
    expect(wrapper.findAll('.we-node')).toHaveLength(2)
    expect(wrapper.find('.wsd-hero').exists()).toBe(false)
  })

  it('组件库点击可重新启用隐藏块并标记待保存', async () => {
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([
        { key: 'todo', visible: true, order: 1, span: 2 },
        { key: 'messages', visible: true, order: 2 },
      ]),
    )
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    const paletteItems = wrapper.findAll('.we-palette-item')
    expect(paletteItems).toHaveLength(2)
    const nodes = wrapper.findAll('.we-node')
    expect(nodes).toHaveLength(2)
    await nodes[1].find('.we-node__btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.we-node.is-hidden').exists()).toBe(true)

    await paletteItems[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.we-node.is-hidden').exists()).toBe(false)
    const saveButton = wrapper.findAll('.we-topbar__actions button')[1]
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('保存布局时把画布几何写入卡片元数据', async () => {
    saveWorkspaceLayout.mockResolvedValue(undefined)
    getWorkspaceLayout.mockResolvedValue(
      layoutResp([{ key: 'todo', visible: true, order: 1, span: 2 }]),
    )
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    await wrapper.find('.we-node__btn').trigger('click')
    await wrapper.findAll('.we-topbar__actions button')[1].trigger('click')
    await flushPromises()

    expect(saveWorkspaceLayout).toHaveBeenCalledTimes(1)
    const payload = saveWorkspaceLayout.mock.calls[0][0]
    expect(payload.cards[0].metadata.geometry).toEqual({ x: 0, y: 0, w: 1200, h: 360 })
  })

  it('退出编辑返回工作台', async () => {
    const wrapper = mount(WorkspaceEditor, { global })
    await flushPromises()
    mockPush.mockClear()
    await wrapper.findAll('.we-topbar__actions button')[2].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/workspace')
  })
})
