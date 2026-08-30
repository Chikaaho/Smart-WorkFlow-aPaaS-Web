import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'

vi.mock('@/modules/agent/api', () => ({
  createGraphDef: vi.fn(),
  deleteGraphDef: vi.fn(),
  pageGraphDefs: vi.fn(),
  publishGraphDef: vi.fn(),
}))

const { push, promptMock, confirmMock } = vi.hoisted(() => ({
  push: vi.fn(),
  promptMock: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { prompt: promptMock, confirm: confirmMock },
  }
})

import { createGraphDef, deleteGraphDef, pageGraphDefs, publishGraphDef } from '@/modules/agent/api'
import type { AgentGraphDef } from '@/contracts/agent'
import GraphDefList from './GraphDefList.vue'

const stubs = {
  StandardListTemplate: {
    template: '<div><slot name="toolbar-actions"/><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link'],
  },
}

const mockDefs: AgentGraphDef[] = [
  {
    id: 1,
    graphKey: 'agent_abc123',
    name: '客服分流',
    defVersion: 2,
    status: 'PUBLISHED',
    createTime: '2026-08-11 10:00:00',
    updateTime: '2026-08-11 10:00:00',
  },
  {
    id: 2,
    graphKey: 'agent_def456',
    name: '内容摘要',
    defVersion: 1,
    status: 'DRAFT',
    createTime: '2026-08-11 11:00:00',
    updateTime: '2026-08-11 11:00:00',
  },
]

function mountList() {
  return mount(GraphDefList, {
    global: { plugins: [createPinia()], stubs },
  })
}

describe('GraphDefList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mount 时以 pageNum=1 pageSize=10 调用 pageGraphDefs 并渲染分页数据', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mountList()
    await nextTick()
    expect(pageGraphDefs).toHaveBeenCalledOnce()
    expect(pageGraphDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
    expect(wrapper.vm as unknown as { total: number }).toHaveProperty('total', 2)
    expect((wrapper.vm as unknown as { list: AgentGraphDef[] }).list).toHaveLength(2)
  })

  it('新建：prompt 输入名称后调用 createGraphDef 并跳转设计器', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    promptMock.mockResolvedValueOnce({ value: '新图', action: 'confirm' })
    vi.mocked(createGraphDef).mockResolvedValueOnce(99)

    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { handleCreate: () => Promise<void> }
    await vm.handleCreate()

    expect(promptMock).toHaveBeenCalledOnce()
    expect(createGraphDef).toHaveBeenCalledWith('新图')
    // 跳转参数化静态路由 agent/graph-designer/:id
    expect(push).toHaveBeenCalledWith('/agent/graph-designer/99')
  })

  it('发布：二次确认后调用 publishGraphDef 并刷新列表', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    confirmMock.mockResolvedValueOnce('confirm')
    vi.mocked(publishGraphDef).mockResolvedValueOnce({ ...mockDefs[0], defVersion: 3 })

    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { handlePublish: (row: AgentGraphDef) => Promise<void> }
    await vm.handlePublish(mockDefs[0])

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(publishGraphDef).toHaveBeenCalledWith(1)
    expect(pageGraphDefs).toHaveBeenCalledTimes(2) // 发布后刷新
  })

  it('发布：取消确认时不调用 publishGraphDef', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    confirmMock.mockRejectedValueOnce('cancel')

    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { handlePublish: (row: AgentGraphDef) => Promise<void> }
    await vm.handlePublish(mockDefs[0])

    expect(publishGraphDef).not.toHaveBeenCalled()
  })

  it('删除：二次确认后调用 deleteGraphDef 并刷新列表', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    confirmMock.mockResolvedValueOnce('confirm')

    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { handleDelete: (row: AgentGraphDef) => Promise<void> }
    await vm.handleDelete(mockDefs[1])

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(deleteGraphDef).toHaveBeenCalledWith(2)
    expect(pageGraphDefs).toHaveBeenCalledTimes(2)
  })

  it('编辑：跳转设计器路由 /agent/graph-designer/:id', async () => {
    vi.mocked(pageGraphDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { handleEdit: (row: AgentGraphDef) => void }
    vm.handleEdit(mockDefs[0])

    expect(push).toHaveBeenCalledWith('/agent/graph-designer/1')
  })
})
