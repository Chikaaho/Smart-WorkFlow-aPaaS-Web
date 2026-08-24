import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/agent/api', () => ({
  pageInternalTools: vi.fn(),
  pageExternalTools: vi.fn(),
  deleteInternalTool: vi.fn(),
  deleteExternalTool: vi.fn(),
  toggleInternalTool: vi.fn(),
  toggleExternalTool: vi.fn(),
}))

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: confirmMock },
  }
})

import { pageExternalTools, toggleExternalTool } from '@/modules/agent/api'
import type { AgentToolExternalConfig } from '@/contracts/agent'
import { ElMessage } from 'element-plus'
import ToolList from './ToolList.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  InternalToolFormDialog: {
    template: '<div class="internal-tool-dialog-stub"/>',
    props: ['visible', 'toolId'],
    emits: ['update:visible', 'saved'],
  },
  ExternalToolFormDialog: {
    template: '<div class="external-tool-dialog-stub"/>',
    props: ['visible', 'toolId'],
    emits: ['update:visible', 'saved'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
  },
  'el-tabs': { template: '<div class="el-tabs"><slot/></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div/>', props: ['label', 'name'] },
  'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
}

const mockExternalTools: AgentToolExternalConfig[] = [
  {
    id: 10,
    name: 'web_search',
    description: '网络搜索',
    url: 'https://api.search.com/v1/search',
    httpMethod: 'POST',
    timeoutSeconds: 30,
    inputSchema: '{"type":"object","properties":{"query":{"type":"string"}}}',
    enabled: true,
    remark: null,
    createTime: '2026-08-20 10:00:00',
    updateTime: '2026-08-20 10:00:00',
  },
]

function stubExternalPage(tools: AgentToolExternalConfig[] = mockExternalTools) {
  vi.mocked(pageExternalTools).mockResolvedValue({
    list: tools,
    total: tools.length,
    pageNum: 1,
    pageSize: 10,
  })
}

function mountList(pinia?: ReturnType<typeof createPinia>) {
  return mount(ToolList, {
    global: { plugins: [pinia ?? createPinia()], stubs },
  })
}

describe('K6: 外部页面成功反馈', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('外部工具启用成功 → 显示成功消息 + 列表刷新', async () => {
    stubExternalPage()
    vi.mocked(toggleExternalTool).mockResolvedValueOnce(undefined as unknown as void)

    const wrapper = mountList()
    await nextTick()

    // 切换到外部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleToggle: (row: AgentToolExternalConfig) => Promise<void>
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    // 执行启用操作
    const tool = { ...mockExternalTools[0], enabled: false }
    await vm.handleToggle(tool)

    // 验证成功消息
    expect(ElMessage.success).toHaveBeenCalledWith('已启用')

    // 验证列表刷新
    expect(pageExternalTools).toHaveBeenCalledTimes(2) // 初始加载 + 刷新
  })

  it('外部工具停用成功 → 显示成功消息 + 列表刷新', async () => {
    stubExternalPage()
    vi.mocked(toggleExternalTool).mockResolvedValueOnce(undefined as unknown as void)

    const wrapper = mountList()
    await nextTick()

    // 切换到外部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleToggle: (row: AgentToolExternalConfig) => Promise<void>
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    // 执行停用操作
    const tool = { ...mockExternalTools[0], enabled: true }
    await vm.handleToggle(tool)

    // 验证成功消息
    expect(ElMessage.success).toHaveBeenCalledWith('已停用')

    // 验证列表刷新
    expect(pageExternalTools).toHaveBeenCalledTimes(2)
  })

  it('外部工具操作失败 → 显示错误消息 + 列表不被伪改', async () => {
    stubExternalPage()
    vi.mocked(toggleExternalTool).mockRejectedValueOnce(new Error('操作失败'))

    const wrapper = mountList()
    await nextTick()

    // 切换到外部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleToggle: (row: AgentToolExternalConfig) => Promise<void>
      externalList: AgentToolExternalConfig[]
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    const originalList = [...vm.externalList]

    // 执行操作（会失败）
    await vm.handleToggle(mockExternalTools[0])

    // 验证错误消息
    expect(ElMessage.error).toHaveBeenCalledWith('启停操作失败')

    // 验证列表未被伪改
    expect(vm.externalList).toEqual(originalList)
  })

  it('外部工具操作中显示加载状态', async () => {
    stubExternalPage()
    // 创建一个永远不会 resolve 的 promise 来模拟加载状态
    let resolveToggle: () => void
    const togglePromise = new Promise<void>((resolve) => {
      resolveToggle = resolve
    })
    vi.mocked(toggleExternalTool).mockReturnValueOnce(togglePromise)

    const wrapper = mountList()
    await nextTick()

    // 切换到外部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleToggle: (row: AgentToolExternalConfig) => Promise<void>
      togglingId: number | null
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    // 开始操作（不等待完成）
    const togglePromise2 = vm.handleToggle(mockExternalTools[0])

    // 验证加载状态
    expect(vm.togglingId).toBe(mockExternalTools[0].id)

    // 完成操作
    resolveToggle!()
    await togglePromise2

    // 验证加载状态清除
    expect(vm.togglingId).toBeNull()
  })

  it('外部工具操作完成后列表状态与服务端一致', async () => {
    // 初始状态：工具启用
    stubExternalPage([{ ...mockExternalTools[0], enabled: true }])

    const wrapper = mountList()
    await nextTick()

    // 切换到外部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleToggle: (row: AgentToolExternalConfig) => Promise<void>
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    // 模拟停用成功后刷新列表
    vi.mocked(toggleExternalTool).mockResolvedValueOnce(undefined as unknown as void)
    stubExternalPage([{ ...mockExternalTools[0], enabled: false }])

    // 执行停用
    await vm.handleToggle({ ...mockExternalTools[0], enabled: true })

    // 验证列表刷新后状态一致
    expect(pageExternalTools).toHaveBeenCalledTimes(2)
  })
})
