import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/agent/api', () => ({
  createModel: vi.fn(),
  getModel: vi.fn(),
  updateModel: vi.fn(),
  listEnabledProviders: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { createModel, getModel, updateModel, listEnabledProviders } from '@/modules/agent/api'
import type { AgentModel, AgentProvider } from '@/contracts/agent'
import ModelFormDialog from './ModelFormDialog.vue'

const stubs = {
  StandardFormTemplate: {
    template: '<div><slot name="alert"/><slot/><slot name="actions"/></div>',
    props: ['title', 'subtitle', 'embedded'],
  },
  FormSection: { template: '<section><slot/></section>', props: ['title'] },
  FormGrid: { template: '<div><slot/></div>', props: ['columns'] },
  'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
  'el-input': { template: '<input/>', props: ['modelValue', 'type', 'placeholder'] },
  'el-select': { template: '<select/>', props: ['modelValue'] },
  'el-option': { template: '<option/>' },
  'el-switch': { template: '<div/>', props: ['modelValue'] },
  'el-input-number': { template: '<input/>', props: ['modelValue'] },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'loading', 'disabled'],
  },
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
    id: 103,
    name: 'Command Code 网关',
    apiFormat: 'OPENAI_RESPONSES',
    baseUrl: 'https://gateway.example.com/v1',
    apiKeyMasked: null,
    enabled: true,
    remark: null,
    createTime: '2026-07-12 10:00:00',
    updateTime: '2026-07-12 10:00:00',
  },
]

interface FormShape {
  providerId: number | null
  name: string
  modelName: string
  capabilities: string
  temperature: number | null
  maxTokens: number | null
  topP: number | null
  timeoutSeconds: number | null
  retryCount: number | null
  enabled: boolean
  remark: string
  groupKey: string
  sort: number | null
  quotaCooldownSeconds: number | null
}

interface DialogVm {
  form: FormShape
  providerOptions: AgentProvider[]
  lockedUntil: string | null
  formError: string
  handleSubmit: () => Promise<void>
}

function mountCreate(visible = true) {
  return mount(ModelFormDialog, {
    props: { visible, modelId: null },
    global: { stubs },
  })
}

function mountEdit(modelId: number) {
  return mount(ModelFormDialog, {
    props: { visible: true, modelId },
    global: { stubs },
  })
}

function fillRequired(vm: DialogVm) {
  vm.form.providerId = 101
  vm.form.name = '测试模型'
  vm.form.modelName = 'gpt-4o'
}

const editDetail: AgentModel = {
  id: 7,
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
  groupKey: 'gpt4o-pool',
  sort: 1,
  lockedUntil: '2099-01-01T00:00:00',
  quotaCooldownSeconds: 300,
  createTime: '2026-07-10 10:00:00',
  updateTime: '2026-07-10 10:00:00',
}

describe('ModelFormDialog.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listEnabledProviders).mockResolvedValue(mockProviders)
  })

  it('新增初始态：空表单 + 契约默认值（timeout=30/retry=0/sort=0/cooldown=60），加载启用中供应商下拉', async () => {
    const wrapper = mountCreate()
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    expect(getModel).not.toHaveBeenCalled()
    expect(listEnabledProviders).toHaveBeenCalledOnce()
    expect(vm.providerOptions).toEqual(mockProviders)
    expect(vm.form.providerId).toBeNull()
    expect(vm.form.name).toBe('')
    expect(vm.form.modelName).toBe('')
    expect(vm.form.capabilities).toBe('CHAT')
    expect(vm.form.timeoutSeconds).toBe(30)
    expect(vm.form.retryCount).toBe(0)
    expect(vm.form.sort).toBe(0)
    expect(vm.form.quotaCooldownSeconds).toBe(60)
    expect(vm.form.enabled).toBe(true)
    expect(vm.lockedUntil).toBeNull()
  })

  it('供应商下拉加载失败：不阻塞表单，选项为空数组', async () => {
    vi.mocked(listEnabledProviders).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountCreate()
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm
    expect(vm.providerOptions).toEqual([])
  })

  it('校验拦截：供应商未选 / 必填缺失 / 数值越界时不提交', async () => {
    const wrapper = mountCreate()
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    // 供应商未选
    vm.form.name = '测试模型'
    vm.form.modelName = 'gpt-4o'
    await vm.handleSubmit()
    expect(vm.formError).toBe('请选择供应商（在供应商页签管理）')
    expect(createModel).not.toHaveBeenCalled()

    // 名称缺失
    vm.form.providerId = 101
    vm.form.name = ''
    await vm.handleSubmit()
    expect(vm.formError).toBe('名称不能为空')
    expect(createModel).not.toHaveBeenCalled()

    fillRequired(vm)

    // 数值越界：temperature > 2
    vm.form.temperature = 3
    await vm.handleSubmit()
    expect(vm.formError).toContain('temperature')
    expect(createModel).not.toHaveBeenCalled()
    vm.form.temperature = 0.7

    // 数值越界：maxTokens < 1
    vm.form.maxTokens = 0
    await vm.handleSubmit()
    expect(vm.formError).toContain('maxTokens')
    expect(createModel).not.toHaveBeenCalled()
  })

  it('编辑回填：getModel 数据回填 providerId/capabilities/groupKey，lockedUntil 只读展示', async () => {
    vi.mocked(getModel).mockResolvedValueOnce(editDetail)
    const wrapper = mountEdit(7)
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    expect(getModel).toHaveBeenCalledWith(7)
    expect(vm.form.providerId).toBe(101)
    expect(vm.form.name).toBe('OpenAI GPT-4o 主模型')
    expect(vm.form.modelName).toBe('gpt-4o')
    expect(vm.form.capabilities).toBe('CHAT')
    expect(vm.form.timeoutSeconds).toBe(60)
    expect(vm.form.groupKey).toBe('gpt4o-pool')
    expect(vm.form.sort).toBe(1)
    expect(vm.form.quotaCooldownSeconds).toBe(300)
    // lockedUntil 只读展示（冷却中 warning 信息条）
    expect(vm.lockedUntil).toBe('2099-01-01T00:00:00')
    expect(wrapper.text()).toContain('冷却至 2099-01-01T00:00:00')
  })

  it('安全边界：两级模型表单无任何 API Key 字段，提交请求体不含 apiKey 形态字段', async () => {
    const wrapper = mountCreate()
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    vi.mocked(createModel).mockResolvedValueOnce(1)

    await vm.handleSubmit()
    expect(createModel).toHaveBeenCalledOnce()
    const createArg = vi.mocked(createModel).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(createArg.providerId).toBe(101)
    expect(createArg.name).toBe('测试模型')
    expect(createArg.modelName).toBe('gpt-4o')
    expect(createArg.capabilities).toBe('CHAT')
    for (const key of Object.keys(createArg)) {
      expect(key.toLowerCase()).not.toContain('apikey')
    }
    // 编辑路径同样不含
    vi.mocked(getModel).mockResolvedValueOnce(editDetail)
    const editWrapper = mountEdit(7)
    await flushPromises()
    const editVm = editWrapper.vm as unknown as DialogVm
    vi.mocked(updateModel).mockResolvedValueOnce(undefined)
    await editVm.handleSubmit()
    const updateCall = vi.mocked(updateModel).mock.calls[0]
    expect(updateCall[0]).toBe(7)
    const updateArg = updateCall[1] as unknown as Record<string, unknown>
    expect(updateArg.providerId).toBe(101)
    for (const key of Object.keys(updateArg)) {
      expect(key.toLowerCase()).not.toContain('apikey')
    }
  })

  it('提交成功：emit saved 与 update:visible=false', async () => {
    const wrapper = mountCreate()
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    vi.mocked(createModel).mockResolvedValueOnce(1)

    await vm.handleSubmit()

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(createModel).toHaveBeenCalledOnce()
  })
})
