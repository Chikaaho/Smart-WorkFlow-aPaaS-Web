import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const pushMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/modules/agent/api', () => ({
  pageProviders: vi.fn(),
  pageModels: vi.fn(),
  pageGraphDefs: vi.fn(),
  pageKnowledgeBases: vi.fn(),
  pageGraphExecutionsWithVersion: vi.fn(),
}))

import {
  pageGraphDefs,
  pageGraphExecutionsWithVersion,
  pageKnowledgeBases,
  pageModels,
  pageProviders,
} from '@/modules/agent/api'
import AgentHome from './AgentHome.vue'

const stubs = {
  'el-card': { template: '<div><slot name="header"/><slot/></div>' },
  'el-button': {
    template: '<button class="test-button" @click="$emit(\'click\')"><slot/></button>',
  },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-empty': { template: '<div class="empty">{{ description }}</div>', props: ['description'] },
  'el-tag': { template: '<span><slot/></span>' },
  'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
}

function mountHome() {
  return mount(AgentHome, {
    global: {
      stubs,
      directives: { loading: {} },
    },
  })
}

describe('AgentHome.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageProviders).mockResolvedValue({ list: [], total: 2, pageNum: 1, pageSize: 1 })
    vi.mocked(pageModels).mockResolvedValue({ list: [], total: 3, pageNum: 1, pageSize: 1 })
    vi.mocked(pageGraphDefs).mockResolvedValue({ list: [], total: 4, pageNum: 1, pageSize: 1 })
    vi.mocked(pageKnowledgeBases).mockResolvedValue({ list: [], total: 5, pageNum: 1, pageSize: 1 })
    vi.mocked(pageGraphExecutionsWithVersion).mockResolvedValue({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 5,
    })
  })

  it('工作台展示供应商/模型、图定义、知识库与最近执行概览', async () => {
    const wrapper = mountHome()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('2 个供应商 / 3 个模型')
    expect(text).toContain('4 个图')
    expect(text).toContain('5 个知识库')
    expect(text).toContain('暂无执行记录')
  })

  it('快捷入口点击后打开对应页面', async () => {
    const wrapper = mountHome()
    await flushPromises()

    const modelEntry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('大模型管理'))
    expect(modelEntry).toBeTruthy()
    await modelEntry!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/agent/model')
  })
})
