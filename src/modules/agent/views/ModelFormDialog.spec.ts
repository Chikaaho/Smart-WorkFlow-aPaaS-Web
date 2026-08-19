import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/agent/api', () => ({
  createModel: vi.fn(),
  getModel: vi.fn(),
  updateModel: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { createModel, getModel, updateModel } from '@/modules/agent/api'
import type { AgentModelConfig } from '@/contracts/agent'
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

interface FormShape {
  name: string
  protocolType: string
  baseUrl: string
  modelName: string
  apiKey: string
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
  maskedApiKey: string | null
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
  vm.form.name = '测试模型'
  vm.form.protocolType = 'openai'
  vm.form.baseUrl = 'https://api.example.com/v1'
  vm.form.modelName = 'gpt-4o'
}

const editDetail: AgentModelConfig = {
  id: 7,
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
  })

  it('新增初始态：空表单 + 契约默认值（timeout=30/retry=0/sort=0/cooldown=60）', async () => {
    const wrapper = mountCreate()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    expect(getModel).not.toHaveBeenCalled()
    expect(vm.form.name).toBe('')
    expect(vm.form.apiKey).toBe('')
    expect(vm.form.timeoutSeconds).toBe(30)
    expect(vm.form.retryCount).toBe(0)
    expect(vm.form.sort).toBe(0)
    expect(vm.form.quotaCooldownSeconds).toBe(60)
    expect(vm.form.enabled).toBe(true)
    expect(vm.maskedApiKey).toBeNull()
    expect(vm.lockedUntil).toBeNull()
  })

  it('协议切换：显示与协议对应的差异提示文案', async () => {
    const wrapper = mountCreate()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    expect(wrapper.text()).toContain('OpenAI 兼容协议：需配置 API Key')

    vm.form.protocolType = 'ollama'
    await nextTick()
    expect(wrapper.text()).toContain('Ollama 本地协议：本地服务无需 API Key')

    vm.form.protocolType = 'other'
    await nextTick()
    expect(wrapper.text()).toContain('其他协议：仅做可达性探测')
  })

  it('校验拦截：必填缺失 / URL 非法 / 数值越界时不提交', async () => {
    const wrapper = mountCreate()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    // 必填缺失
    await vm.handleSubmit()
    expect(vm.formError).toBe('名称不能为空')
    expect(createModel).not.toHaveBeenCalled()

    fillRequired(vm)
    // URL 非法
    vm.form.baseUrl = 'not-a-url'
    await vm.handleSubmit()
    expect(vm.formError).toContain('API 地址格式不正确')
    expect(createModel).not.toHaveBeenCalled()
    vm.form.baseUrl = 'https://api.example.com/v1'

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

  it('编辑回填：getModel 数据回填、apiKey 输入框为空、lockedUntil 只读展示', async () => {
    vi.mocked(getModel).mockResolvedValueOnce(editDetail)
    const wrapper = mountEdit(7)
    await flushPromises()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm

    expect(getModel).toHaveBeenCalledWith(7)
    expect(vm.form.name).toBe('OpenAI GPT-4o 主模型')
    expect(vm.form.baseUrl).toBe('https://api.openai.com/v1')
    expect(vm.form.timeoutSeconds).toBe(60)
    expect(vm.form.groupKey).toBe('gpt4o-pool')
    expect(vm.form.sort).toBe(1)
    expect(vm.form.quotaCooldownSeconds).toBe(300)
    // 密钥安全：输入框恒空，只展示脱敏值
    expect(vm.form.apiKey).toBe('')
    expect(vm.maskedApiKey).toBe('sk****abcd')
    expect(wrapper.text()).toContain('sk****abcd')
    // lockedUntil 只读展示（冷却中 warning 信息条）
    expect(vm.lockedUntil).toBe('2099-01-01T00:00:00')
    expect(wrapper.text()).toContain('冷却至 2099-01-01T00:00:00')
  })

  it('空 Key 提交：请求体不含 apiKey（新增=不配置 / 编辑=保持旧密钥）', async () => {
    const wrapper = mountCreate()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    vi.mocked(createModel).mockResolvedValueOnce(1)

    await vm.handleSubmit()
    const createArg = vi.mocked(createModel).mock.calls[0][0] as unknown as Record<string, unknown>
    expect('apiKey' in createArg).toBe(false)

    // 编辑路径：留空提交同样不携带 apiKey
    vi.mocked(getModel).mockResolvedValueOnce(editDetail)
    const editWrapper = mountEdit(7)
    await flushPromises()
    const editVm = editWrapper.vm as unknown as DialogVm
    vi.mocked(updateModel).mockResolvedValueOnce(undefined)
    await editVm.handleSubmit()
    // updateModel(modelId, req)：请求体是第二个参数
    const updateCall = vi.mocked(updateModel).mock.calls[0]
    expect(updateCall[0]).toBe(7)
    expect(typeof updateCall[1]).toBe('object')
    const updateArg = updateCall[1] as unknown as Record<string, unknown>
    expect('apiKey' in updateArg).toBe(false)
  })

  it('新 Key 提交：请求体 apiKey 为用户输入的新值', async () => {
    const wrapper = mountCreate()
    await nextTick()
    const vm = wrapper.vm as unknown as DialogVm
    fillRequired(vm)
    vm.form.apiKey = 'sk-test-new-key-001'
    vi.mocked(createModel).mockResolvedValueOnce(1)

    await vm.handleSubmit()
    const createArg = vi.mocked(createModel).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(createArg.apiKey).toBe('sk-test-new-key-001')
  })

  it('提交成功：emit saved 与 update:visible=false', async () => {
    const wrapper = mountCreate()
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
