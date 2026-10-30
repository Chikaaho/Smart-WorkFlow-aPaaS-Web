import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkspaceSystemCard from './WorkspaceSystemCard.vue'

const push = vi.fn()
const catalogItems = [
  { itemKey: 'a16', name: 'A16 全链流程', formKey: 'form_a16' },
  { itemKey: 'u020', name: 'U020 子流程父流程', formKey: 'form_u020' },
  { itemKey: 'opinion', name: 'U020 意见流转', formKey: 'form_opinion' },
]

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('../api', () => ({
  queryTodoTasks: () => Promise.resolve({ list: [], total: 17 }),
  myProcessed: () => Promise.resolve({ list: [], total: 7 }),
  myInstances: () => Promise.resolve({ list: [], total: 22 }),
  myDrafts: () => Promise.resolve({ list: [], total: 2 }),
}))

vi.mock('../api/oa', () => ({
  queryMyCopies: () => Promise.resolve({ list: [], total: 0 }),
  queryCatalogItems: () => Promise.resolve({ list: catalogItems, total: catalogItems.length }),
}))

vi.mock('../api/i4', () => ({
  queryAnalyticsSummary: () => Promise.resolve(null),
}))

const stubs = {
  'el-icon': { template: '<i><slot /></i>' },
}

describe('WorkspaceSystemCard 旧版统计概览兼容', () => {
  it('旧 stats 卡读取四类真实计数而不是空卡', async () => {
    const wrapper = mount(WorkspaceSystemCard, {
      props: { typeCode: 'stats' },
      global: { stubs },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('17')
    expect(text).toContain('22')
    expect(text).toContain('7')
    expect(text).toContain('2')
    expect(wrapper.findAll('.wsys__stat')).toHaveLength(4)
  })
})

describe('WorkspaceSystemCard 快捷发起候选/已选一致性', () => {
  beforeEach(() => {
    push.mockReset()
  })

  it('未选择常用事项时保持明确空态，不把目录候选冒充已配置项', async () => {
    const wrapper = mount(WorkspaceSystemCard, {
      props: { typeCode: 'favoriteItems', favoriteKeys: [] },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无常用事项')
    expect(wrapper.text()).not.toContain('A16 全链流程')
    expect(wrapper.findAll('.wsys__quick-item')).toHaveLength(0)
  })

  it('仅渲染已选常用事项，并可合法发起', async () => {
    const wrapper = mount(WorkspaceSystemCard, {
      props: { typeCode: 'favoriteItems', favoriteKeys: ['u020'] },
      global: { stubs },
    })
    await flushPromises()
    const buttons = wrapper.findAll('.wsys__quick-item')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.text()).toBe('U020 子流程父流程')
    expect(wrapper.text()).not.toContain('A16 全链流程')

    await buttons[0]?.trigger('click')
    expect(push).toHaveBeenCalledWith('/form/form-render/form_u020')
  })
})
