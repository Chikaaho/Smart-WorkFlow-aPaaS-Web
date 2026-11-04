import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/agent/api', () => ({
  pageModels: vi.fn(),
  getModel: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  deleteModel: vi.fn(),
  testModelConnection: vi.fn(),
  pageProviders: vi.fn(),
  listEnabledProviders: vi.fn(),
  getProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
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
  pageModels,
  deleteModel,
  testModelConnection,
  pageProviders,
  deleteProvider,
} from '@/modules/agent/api'
import type { AgentModel, AgentProvider, AgentModelTestConnectionResp } from '@/contracts/agent'
import { useUserStore } from '@/stores/user'
import ModelList from './ModelList.vue'

// el-table-column 与仓库先例一致用 <div/> 桩（列内 scoped slot 的 row 无法在桩下注入，
// 行内按钮交互经 vm 暴露的包装函数断言，按钮级权限经 canManage/canTest computed + 工具栏按钮 DOM 断言）。
const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  ModelFormDialog: {
    template: '<div class="model-form-dialog-stub"/>',
    props: ['visible', 'modelId'],
    emits: ['update:visible', 'saved'],
  },
  ProviderFormDialog: {
    template: '<div class="provider-form-dialog-stub"/>',
    props: ['visible', 'providerId'],
    emits: ['update:visible', 'saved'],
  },
  ListActionsColumn: { template: '<div/>' },
  ListFilterItem: {
    template: '<div class="list-filter-item"><slot/></div>',
    props: ['label'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
  'el-tabs': {
    template: '<div class="el-tabs"><slot/></div>',
    props: ['modelValue'],
    emits: ['tabChange'],
  },
  'el-tab-pane': { template: '<div><slot/></div>', props: ['label', 'name'] },
  'el-select': { template: '<div/>' },
  'el-input': { template: '<input/>' },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
  },
  'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
}

const mockProviders: AgentProvider[] = [
  {
    id: 101,
    name: 'OpenAI 官方',
    apiFormat: 'OPENAI_CHAT',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk****abcd',
    enabled: true,
    remark: null,
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 102,
    name: 'Anthropic 官方',
    apiFormat: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com',
    apiKeyMasked: null,
    enabled: false,
    remark: null,
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
]

const mockModels: AgentModel[] = [
  {
    id: 1,
    providerId: 101,
    providerName: 'OpenAI 官方',
    providerApiFormat: 'OPENAI_CHAT',
    name: 'OpenAI GPT-4o 主模型',
    modelName: 'gpt-4o',
    capabilities: 'CHAT',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '生产主模型',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 2,
    providerId: 101,
    providerName: 'OpenAI 官方',
    providerApiFormat: 'OPENAI_CHAT',
    name: '多Key轮询-主Key',
    modelName: 'gpt-4o',
    capabilities: 'CHAT',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: null,
    groupKey: 'gpt4o-pool',
    sort: 1,
    lockedUntil: '2030-01-01T00:00:00',
    quotaCooldownSeconds: 300,
    createTime: '2026-07-14 10:00:00',
    updateTime: '2026-07-15 08:00:00',
  },
]

const testSuccess: AgentModelTestConnectionResp = {
  success: true,
  message: '模型调用成功',
  latencyMs: 320,
}

const testFail: AgentModelTestConnectionResp = {
  success: false,
  message: '网络不可达：请检查服务地址',
  latencyMs: 1500,
}

const testAuthFail: AgentModelTestConnectionResp = {
  success: false,
  message: '鉴权失败（HTTP 401）：请检查 API Key 或权限',
  latencyMs: 120,
}

function stubPage(models: AgentModel[] = mockModels) {
  vi.mocked(pageModels).mockResolvedValue({
    list: models,
    total: models.length,
    pageNum: 1,
    pageSize: 10,
  })
}

function stubProviders(providers: AgentProvider[] = mockProviders) {
  vi.mocked(pageProviders).mockResolvedValue({
    list: providers,
    total: providers.length,
    pageNum: 1,
    pageSize: 10,
  })
}

function mountList(pinia?: ReturnType<typeof createPinia>) {
  return mount(ModelList, {
    global: { plugins: [pinia ?? createPinia()], stubs },
  })
}

describe('ModelList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    stubProviders()
  })

  it('mount 时以 pageNum=1 pageSize=10 调用 pageModels（默认无供应商过滤）并渲染分页数据', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    expect(pageModels).toHaveBeenCalledOnce()
    expect(pageModels).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, undefined, '')
    const vm = wrapper.vm as unknown as {
      total: number
      list: AgentModel[]
      currentKeyword: string
    }
    expect(vm.total).toBe(2)
    expect(vm.list).toHaveLength(2)
    expect(vm.currentKeyword).toBe('')
  })

  it('关键字查询：pageModels 携带 nameKeyword（trim 后）；重置清空关键字并回第 1 页', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      filter: { name: string }
      handleQuery: () => void
      handleReset: () => void
    }
    vm.filter.name = '  GPT  '
    vm.handleQuery()
    await nextTick()
    expect(pageModels).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, undefined, 'GPT')

    vm.handleReset()
    await nextTick()
    expect(pageModels).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, undefined, '')
    expect(vm.filter.name).toBe('')
  })

  it('供应商 Tab：切到 providers 调 pageProviders，供应商编辑/删除走 ProviderFormDialog 与 deleteProvider', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      activeTab: string
      handleTabChange: (tab: string | number) => void
      openProviderEdit: (row: AgentProvider) => void
      editingProviderId: number | null
      providerDialogVisible: boolean
      handleProviderDelete: (row: AgentProvider) => Promise<void>
    }
    vm.handleTabChange('providers')
    await nextTick()
    expect(vm.activeTab).toBe('providers')
    expect(pageProviders).toHaveBeenCalled()

    vm.openProviderEdit(mockProviders[0])
    await nextTick()
    expect(vm.providerDialogVisible).toBe(true)
    expect(vm.editingProviderId).toBe(101)

    confirmMock.mockResolvedValueOnce('confirm')
    await vm.handleProviderDelete(mockProviders[1])
    expect(deleteProvider).toHaveBeenCalledWith(102)
  })

  it('编辑：行内按钮入口（editRow→openEdit）打开 ModelFormDialog 并携带行 id', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      editRow: (r: unknown) => void
      editingId: number | null
      dialogVisible: boolean
    }
    expect(vm.dialogVisible).toBe(false)
    vm.editRow(mockModels[1])
    await nextTick()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.editingId).toBe(2)
  })

  it('删除：二次确认后调用 deleteModel 并刷新列表', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    confirmMock.mockResolvedValueOnce('confirm')

    const vm = wrapper.vm as unknown as { handleDelete: (row: AgentModel) => Promise<void> }
    await vm.handleDelete(mockModels[1])

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(deleteModel).toHaveBeenCalledWith(2)
    expect(pageModels).toHaveBeenCalledTimes(2)
  })

  it('删除：取消确认时不调用 deleteModel', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    confirmMock.mockRejectedValueOnce('cancel')

    const vm = wrapper.vm as unknown as { handleDelete: (row: AgentModel) => Promise<void> }
    await vm.handleDelete(mockModels[0])

    expect(deleteModel).not.toHaveBeenCalled()
    expect(pageModels).toHaveBeenCalledTimes(1)
  })

  it('连通性测试：调用 testModelConnection 并展示后端 message/latencyMs（成功）', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    vi.mocked(testModelConnection).mockResolvedValueOnce(testSuccess)

    const vm = wrapper.vm as unknown as {
      handleTest: (row: AgentModel) => Promise<void>
      testResult: AgentModelTestConnectionResp | null
      testDialogVisible: boolean
    }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(testModelConnection).toHaveBeenCalledWith(1)
    expect(vm.testResult).toEqual(testSuccess)
    expect(vm.testDialogVisible).toBe(true)
    expect(wrapper.text()).toContain(testSuccess.message)
    expect(wrapper.text()).toContain('320')
  })

  it('连通性测试：success=false 时展示后端结论（不改判语义）', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    vi.mocked(testModelConnection).mockResolvedValueOnce(testFail)

    const vm = wrapper.vm as unknown as {
      handleTest: (row: AgentModel) => Promise<void>
      testResult: AgentModelTestConnectionResp | null
    }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(testModelConnection).toHaveBeenCalledWith(1)
    expect(vm.testResult).toEqual(testFail)
    expect(wrapper.text()).toContain(testFail.message)
    expect(wrapper.text()).toContain('1500')
    expect(wrapper.text()).toContain('测试结果：网络不可达')
  })

  it('连通性测试标题：401 鉴权失败显示失败类别，不显示“网络不可达”', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    vi.mocked(testModelConnection).mockResolvedValueOnce(testAuthFail)

    const vm = wrapper.vm as unknown as { handleTest: (row: AgentModel) => Promise<void> }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(wrapper.text()).toContain('测试结果：鉴权失败（HTTP 401）')
    expect(wrapper.text()).not.toContain('测试结果：网络不可达')
    expect(wrapper.text()).toContain(testAuthFail.message)
  })

  it('连通性测试标题：成功显示“服务可达”', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    vi.mocked(testModelConnection).mockResolvedValueOnce(testSuccess)

    const vm = wrapper.vm as unknown as { handleTest: (row: AgentModel) => Promise<void> }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(wrapper.text()).toContain('测试结果：服务可达')
  })

  it('权限：manage 缺失 → canManage=false、新建按钮（工具栏+空态）隐藏；test 仍可用', async () => {
    stubPage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useUserStore()
    store.permissions = new Set(['agent:model:view', 'agent:model:test'])
    const wrapper = mountList(pinia)
    await nextTick()

    const vm = wrapper.vm as unknown as { canManage: boolean; canTest: boolean }
    expect(vm.canManage).toBe(false)
    expect(vm.canTest).toBe(true)
    const buttons = wrapper.findAll('.el-button')
    expect(buttons.some((b) => b.text().includes('新建'))).toBe(false)
    expect(buttons.some((b) => b.text().includes('查询'))).toBe(true)
    expect(buttons.some((b) => b.text().includes('重置'))).toBe(true)
  })

  it('权限：test 缺失 → canTest=false（连通性测试按钮隐藏）；manage 可用', async () => {
    stubPage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useUserStore()
    store.permissions = new Set(['agent:model:view', 'agent:model:manage'])
    const wrapper = mountList(pinia)
    await nextTick()

    const vm = wrapper.vm as unknown as { canManage: boolean; canTest: boolean }
    expect(vm.canTest).toBe(false)
    expect(vm.canManage).toBe(true)
    const buttons = wrapper.findAll('.el-button')
    expect(buttons.some((b) => b.text().includes('新建'))).toBe(true)
  })

  it('无 Key 泄漏：模型列表数据不含任何 Key 字段，页面文本不含明文 Key 形态', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { list: AgentModel[] }
    for (const m of vm.list) {
      // F1 两级模型：密钥只在供应商侧，模型行不含 apiKeyMasked/apiKey
      expect('apiKey' in m).toBe(false)
      expect('apiKeyMasked' in m).toBe(false)
    }
    expect(wrapper.text()).not.toContain('sk-mock-plaintext')
    expect(wrapper.html()).not.toContain('sk-mock-plaintext')
  })
})
