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

import {
  pageInternalTools,
  pageExternalTools,
  deleteInternalTool,
  deleteExternalTool,
  toggleInternalTool,
  toggleExternalTool,
} from '@/modules/agent/api'
import type { AgentToolInternalConfig, AgentToolExternalConfig } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import { useUserStore } from '@/stores/user'
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

const mockInternalTools: AgentToolInternalConfig[] = [
  {
    id: 1,
    name: 'get_weather',
    description: '获取天气信息',
    beanName: 'weatherTool',
    methodName: 'execute',
    inputSchema: '{"type":"object","properties":{"city":{"type":"string"}}}',
    enabled: true,
    remark: null,
    createTime: '2026-08-20 10:00:00',
    updateTime: '2026-08-20 10:00:00',
  },
  {
    id: 2,
    name: 'send_email',
    description: '发送邮件',
    beanName: 'emailTool',
    methodName: 'execute',
    inputSchema: null,
    enabled: false,
    remark: '停用中',
    createTime: '2026-08-21 10:00:00',
    updateTime: '2026-08-21 10:00:00',
  },
]

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

function stubInternalPage(tools: AgentToolInternalConfig[] = mockInternalTools) {
  vi.mocked(pageInternalTools).mockResolvedValue({
    list: tools,
    total: tools.length,
    pageNum: 1,
    pageSize: 10,
  })
}

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

describe('ToolList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('mount 时加载内部工具列表（默认 Tab）', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()
    expect(pageInternalTools).toHaveBeenCalledOnce()
    expect(pageInternalTools).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, '')
    const vm = wrapper.vm as unknown as {
      internalList: AgentToolInternalConfig[]
      internalTotal: number
      activeTab: string
    }
    expect(vm.activeTab).toBe('internal')
    expect(vm.internalTotal).toBe(2)
    expect(vm.internalList).toHaveLength(2)
  })

  it('关键字查询：pageInternalTools 携带 nameKeyword', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      filter: { name: string }
      handleQuery: () => void
      handleReset: () => void
    }
    vm.filter.name = '  weather  '
    vm.handleQuery()
    await nextTick()
    expect(pageInternalTools).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, 'weather')

    vm.handleReset()
    await nextTick()
    expect(pageInternalTools).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, '')
    expect(vm.filter.name).toBe('')
  })

  it('编辑内部工具：editRow 打开弹窗并携带行 id', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      editRow: (r: unknown) => void
      editingId: number | null
      dialogVisible: boolean
    }
    expect(vm.dialogVisible).toBe(false)
    vm.editRow(mockInternalTools[0])
    await nextTick()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.editingId).toBe(1)
  })

  it('删除内部工具：二次确认后调用 deleteInternalTool 并刷新列表', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()
    confirmMock.mockResolvedValueOnce('confirm')

    const vm = wrapper.vm as unknown as {
      handleDelete: (row: AgentToolInternalConfig) => Promise<void>
    }
    await vm.handleDelete(mockInternalTools[0])

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(deleteInternalTool).toHaveBeenCalledWith(1)
    expect(pageInternalTools).toHaveBeenCalledTimes(2)
  })

  it('删除内部工具：取消确认时不调用 deleteInternalTool', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()
    confirmMock.mockRejectedValueOnce('cancel')

    const vm = wrapper.vm as unknown as {
      handleDelete: (row: AgentToolInternalConfig) => Promise<void>
    }
    await vm.handleDelete(mockInternalTools[0])

    expect(deleteInternalTool).not.toHaveBeenCalled()
    expect(pageInternalTools).toHaveBeenCalledTimes(1)
  })

  it('启停内部工具：toggleInternalTool 被调用并刷新列表', async () => {
    stubInternalPage()
    stubExternalPage()
    vi.mocked(toggleInternalTool).mockResolvedValueOnce(undefined as unknown as void)
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleToggle: (row: AgentToolInternalConfig) => Promise<void>
    }
    await vm.handleToggle(mockInternalTools[0])

    expect(toggleInternalTool).toHaveBeenCalledWith(1, false)
    expect(pageInternalTools).toHaveBeenCalledTimes(2)
  })

  it('权限：manage 缺失 → canManage=false、新建按钮隐藏', async () => {
    stubInternalPage()
    stubExternalPage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useUserStore()
    store.permissions = new Set(['agent:tool:view'])
    const wrapper = mountList(pinia)
    await nextTick()

    const vm = wrapper.vm as unknown as { canManage: boolean }
    expect(vm.canManage).toBe(false)
    const buttons = wrapper.findAll('.el-button')
    expect(buttons.some((b) => b.text().includes('新建'))).toBe(false)
  })

  it('权限：manage 可用 → 新建按钮可见', async () => {
    stubInternalPage()
    stubExternalPage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useUserStore()
    store.permissions = new Set(['agent:tool:view', 'agent:tool:manage'])
    const wrapper = mountList(pinia)
    await nextTick()

    const vm = wrapper.vm as unknown as { canManage: boolean }
    expect(vm.canManage).toBe(true)
    const buttons = wrapper.findAll('.el-button')
    expect(buttons.some((b) => b.text().includes('新建'))).toBe(true)
  })

  it('空态：列表为空时显示空态', async () => {
    stubInternalPage([])
    stubExternalPage([])
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { isEmpty: boolean }
    expect(vm.isEmpty).toBe(true)
  })

  it('错误态：API 报错时设置 errorMsg', async () => {
    vi.mocked(pageInternalTools).mockRejectedValueOnce(new Error('网络异常'))
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { errorMsg: string }
    expect(vm.errorMsg).toBe('加载内部工具列表失败')
  })

  // ═══════════════════════════════════════════════════════
  // G2: 外部 HTTP Tab 行为
  // ═══════════════════════════════════════════════════════

  it('外部 Tab 切换后加载外部工具列表', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    // 初始在内部 Tab
    const vm = wrapper.vm as unknown as {
      activeTab: string
      externalList: AgentToolExternalConfig[]
      externalTotal: number
      handleTabChange: () => void
    }
    expect(vm.activeTab).toBe('internal')
    expect(pageExternalTools).not.toHaveBeenCalled()

    // 切换到外部 Tab
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    expect(pageExternalTools).toHaveBeenCalledOnce()
    expect(pageExternalTools).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, '')
    expect(vm.externalTotal).toBe(1)
    expect(vm.externalList).toHaveLength(1)
    expect(vm.externalList[0].name).toBe('web_search')
  })

  it('外部 Tab 查询/重置：携带 nameKeyword', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      activeTab: string
      filter: { name: string }
      handleQuery: () => void
      handleReset: () => void
      handleTabChange: () => void
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    vm.filter.name = '  email  '
    vm.handleQuery()
    await nextTick()
    expect(pageExternalTools).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, 'email')

    vm.handleReset()
    await nextTick()
    expect(pageExternalTools).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, '')
    expect(vm.filter.name).toBe('')
  })

  it('外部 Tab 空态：列表为空时显示空态', async () => {
    stubInternalPage()
    stubExternalPage([])
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      activeTab: string
      isEmpty: boolean
      handleTabChange: () => void
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    expect(vm.isEmpty).toBe(true)
  })

  it('外部 Tab 错误态：API 报错时设置 errorMsg', async () => {
    stubInternalPage()
    vi.mocked(pageExternalTools).mockRejectedValueOnce(new Error('网络异常'))
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      activeTab: string
      errorMsg: string
      handleTabChange: () => void
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    expect(vm.errorMsg).toBe('加载外部工具列表失败')
  })

  it('外部 Tab 切换不串用内部状态', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      activeTab: string
      internalList: AgentToolInternalConfig[]
      externalList: AgentToolExternalConfig[]
      filter: { name: string }
      handleTabChange: () => void
    }
    // 内部有2条数据
    expect(vm.internalList).toHaveLength(2)

    // 切到外部
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    // 外部独立数据，内部不受影响
    expect(vm.externalList).toHaveLength(1)
    expect(vm.internalList).toHaveLength(2)
    // filter 被清空
    expect(vm.filter.name).toBe('')
  })

  // ═══════════════════════════════════════════════════════
  // G6: 启停/删除服务端失败后反馈与列表不被伪改
  // ═══════════════════════════════════════════════════════

  it('内部启停失败：ApiError 反馈 + 列表不被伪改', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    const originalList = [
      ...(wrapper.vm as unknown as { internalList: AgentToolInternalConfig[] }).internalList,
    ]
    vi.mocked(toggleInternalTool).mockRejectedValueOnce(new ApiError(403, '无权限'))

    const vm = wrapper.vm as unknown as {
      handleToggle: (row: AgentToolInternalConfig) => Promise<void>
    }
    await vm.handleToggle(mockInternalTools[0])

    // 列表未被伪改（仍为原始数据）
    const afterList = (wrapper.vm as unknown as { internalList: AgentToolInternalConfig[] })
      .internalList
    expect(afterList).toEqual(originalList)
  })

  it('内部删除失败：ApiError 反馈 + 列表不被伪改', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    confirmMock.mockResolvedValueOnce('confirm')
    vi.mocked(deleteInternalTool).mockRejectedValueOnce(new ApiError(403, '无权限'))

    const vm = wrapper.vm as unknown as {
      handleDelete: (row: AgentToolInternalConfig) => Promise<void>
    }
    await vm.handleDelete(mockInternalTools[0])

    // 列表未被伪改
    expect(pageInternalTools).toHaveBeenCalledTimes(1) // 未触发刷新
  })

  it('外部启停失败：ApiError 反馈 + 列表不被伪改', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    // 切到外部
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
    vi.mocked(toggleExternalTool).mockRejectedValueOnce(new ApiError(403, '无权限'))

    await vm.handleToggle(mockExternalTools[0])

    // 列表未被伪改
    expect(vm.externalList).toEqual(originalList)
  })

  it('外部删除失败：ApiError 反馈 + 列表不被伪改', async () => {
    stubInternalPage()
    stubExternalPage()
    const wrapper = mountList()
    await nextTick()

    // 切到外部
    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: () => void
      handleDelete: (row: AgentToolExternalConfig) => Promise<void>
    }
    vm.activeTab = 'external'
    vm.handleTabChange()
    await nextTick()

    confirmMock.mockResolvedValueOnce('confirm')
    vi.mocked(deleteExternalTool).mockRejectedValueOnce(new ApiError(403, '无权限'))

    await vm.handleDelete(mockExternalTools[0])

    // 列表未被伪改
    expect(pageExternalTools).toHaveBeenCalledTimes(1) // 未触发刷新
  })
})
