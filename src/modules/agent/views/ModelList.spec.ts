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

import { pageModels, deleteModel, testModelConnection } from '@/modules/agent/api'
import type { AgentModelConfig, AgentModelTestConnectionResp } from '@/contracts/agent'
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
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
  },
  'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
}

const mockModels: AgentModelConfig[] = [
  {
    id: 1,
    name: 'OpenAI GPT-4o 主模型',
    protocolType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
    apiKeyMasked: 'sk****abcd',
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
    name: '多Key轮询-主Key',
    protocolType: 'openai',
    baseUrl: 'https://api.example.com/v1',
    modelName: 'gpt-4o',
    apiKeyMasked: 'sk****1111',
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
  {
    id: 3,
    name: 'Ollama 本地 Llama3',
    protocolType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    modelName: 'llama3',
    apiKeyMasked: null,
    temperature: 0.5,
    maxTokens: 2048,
    topP: 0.9,
    timeoutSeconds: 30,
    retryCount: 0,
    enabled: true,
    remark: null,
    groupKey: null,
    sort: 0,
    lockedUntil: '2026-01-01T00:00:00',
    quotaCooldownSeconds: 60,
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
]

const testSuccess: AgentModelTestConnectionResp = {
  success: true,
  message: '服务可达，鉴权通过',
  latencyMs: 320,
}

const testFail: AgentModelTestConnectionResp = {
  success: false,
  message: '连接被拒绝：网络不可达',
  latencyMs: 1500,
}

function stubPage(models: AgentModelConfig[] = mockModels) {
  vi.mocked(pageModels).mockResolvedValue({
    list: models,
    total: models.length,
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
  })

  it('mount 时以 pageNum=1 pageSize=10 调用 pageModels 并渲染分页数据', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    expect(pageModels).toHaveBeenCalledOnce()
    expect(pageModels).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, '')
    const vm = wrapper.vm as unknown as {
      total: number
      list: AgentModelConfig[]
      currentKeyword: string
    }
    expect(vm.total).toBe(3)
    expect(vm.list).toHaveLength(3)
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
    expect(pageModels).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, 'GPT')

    vm.handleReset()
    await nextTick()
    expect(pageModels).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, '')
    expect(vm.filter.name).toBe('')
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

    const vm = wrapper.vm as unknown as { handleDelete: (row: AgentModelConfig) => Promise<void> }
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

    const vm = wrapper.vm as unknown as { handleDelete: (row: AgentModelConfig) => Promise<void> }
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
      handleTest: (row: AgentModelConfig) => Promise<void>
      testResult: AgentModelTestConnectionResp | null
      testDialogVisible: boolean
    }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(testModelConnection).toHaveBeenCalledWith(1)
    expect(vm.testResult).toEqual(testSuccess)
    expect(vm.testDialogVisible).toBe(true)
    expect(wrapper.text()).toContain('服务可达')
    expect(wrapper.text()).toContain('服务可达，鉴权通过')
    expect(wrapper.text()).toContain('320')
  })

  it('连通性测试：success=false 时展示后端结论（不改判语义）', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()
    vi.mocked(testModelConnection).mockResolvedValueOnce(testFail)

    const vm = wrapper.vm as unknown as {
      handleTest: (row: AgentModelConfig) => Promise<void>
      testResult: AgentModelTestConnectionResp | null
    }
    await vm.handleTest(mockModels[0])
    await nextTick()

    expect(testModelConnection).toHaveBeenCalledWith(1)
    expect(vm.testResult).toEqual(testFail)
    expect(wrapper.text()).toContain('网络不可达')
    expect(wrapper.text()).toContain('连接被拒绝：网络不可达')
    expect(wrapper.text()).toContain('1500')
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
    // 工具栏新建与空态新建均绑定 canManage
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

  it('无 Key 泄漏：列表数据只透传后端脱敏值，页面文本不含明文 Key 形态', async () => {
    stubPage()
    const wrapper = mountList()
    await nextTick()

    const vm = wrapper.vm as unknown as { list: AgentModelConfig[] }
    // 列表透传的只有后端 apiKeyMasked（脱敏），无明文字段
    for (const m of vm.list) {
      expect(m.apiKeyMasked === null || m.apiKeyMasked.startsWith('sk****')).toBe(true)
      expect('apiKey' in m).toBe(false)
    }
    expect(wrapper.text()).not.toContain('sk-mock-plaintext')
    expect(wrapper.html()).not.toContain('sk-mock-plaintext')
    // 无 Key 的模型不展示任何脱敏残留
    const noKey = vm.list.find((m) => m.id === 3)
    expect(noKey?.apiKeyMasked).toBeNull()
  })
})
