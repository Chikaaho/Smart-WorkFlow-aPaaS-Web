import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/agent/api', () => ({
  createInternalTool: vi.fn(),
  getInternalTool: vi.fn(),
  updateInternalTool: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { createInternalTool, getInternalTool, updateInternalTool } from '@/modules/agent/api'
import type { AgentToolInternalConfig } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import InternalToolFormDialog from './InternalToolFormDialog.vue'

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog"><slot/></div>',
    props: ['modelValue'],
    emits: ['update:modelValue', 'closed'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-input': {
    template:
      '<input class="el-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
    props: ['modelValue', 'placeholder', 'type', 'rows'],
    emits: ['update:modelValue'],
  },
  'el-input-number': {
    template:
      '<input class="el-input-number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))"/>',
    props: ['modelValue', 'min', 'max', 'step'],
    emits: ['update:modelValue'],
  },
  'el-switch': {
    template: '<button class="el-switch" @click="$emit(\'update:modelValue\', !modelValue)"/>',
    props: ['modelValue', 'activeText', 'inactiveText'],
    emits: ['update:modelValue'],
  },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'loading', 'disabled'],
  },
  StandardFormTemplate: {
    template: '<div class="standard-form"><slot name="alert"/><slot/><slot name="actions"/></div>',
    props: ['embedded'],
  },
  FormSection: {
    template: '<div class="form-section"><h3>{{ title }}</h3><slot/></div>',
    props: ['title'],
  },
  FormGrid: {
    template: '<div class="form-grid"><slot/></div>',
    props: ['columns'],
  },
}

const mockDetail: AgentToolInternalConfig = {
  id: 1,
  name: 'get_weather',
  description: '获取天气信息',
  beanName: 'weatherTool',
  methodName: 'execute',
  inputSchema: '{"type":"object","properties":{"city":{"type":"string"}}}',
  enabled: true,
  remark: '测试备注',
  createTime: '2026-08-20 10:00:00',
  updateTime: '2026-08-20 10:00:00',
}

function mountDialog(props: { visible?: boolean; toolId?: number | null } = {}) {
  return mount(InternalToolFormDialog, {
    props: { visible: props.visible ?? true, toolId: props.toolId ?? null },
    global: { plugins: [createPinia()], stubs },
  })
}

describe('InternalToolFormDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('新增模式：toolId=null 时不调用 getInternalTool', async () => {
    vi.mocked(getInternalTool).mockResolvedValue(mockDetail)
    mountDialog({ toolId: null })
    await nextTick()
    expect(getInternalTool).not.toHaveBeenCalled()
  })

  it('编辑模式：toolId 存在时调用 getInternalTool 回填表单', async () => {
    vi.mocked(getInternalTool).mockResolvedValue(mockDetail)
    const wrapper = mountDialog({ toolId: 1 })
    await nextTick()
    await nextTick()
    expect(getInternalTool).toHaveBeenCalledWith(1)
    const vm = wrapper.vm as unknown as { form: Record<string, unknown> }
    expect(vm.form.name).toBe('get_weather')
    expect(vm.form.description).toBe('获取天气信息')
    expect(vm.form.beanName).toBe('weatherTool')
    expect(vm.form.methodName).toBe('execute')
    expect(vm.form.inputSchema).toBe('{"type":"object","properties":{"city":{"type":"string"}}}')
    expect(vm.form.enabled).toBe(true)
    expect(vm.form.remark).toBe('测试备注')
  })

  it('校验：工具名为空 → 提示错误，不调用 API', async () => {
    vi.mocked(createInternalTool).mockResolvedValue({} as unknown as number)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: { name: string; description: string; beanName: string; methodName: string }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = ''
    vm.form.description = 'desc'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    await vm.handleSubmit()

    expect(createInternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('工具名不能为空')
  })

  it('校验：工具名非法格式 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: { name: string; description: string; beanName: string; methodName: string }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = '123-invalid'
    vm.form.description = 'desc'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    await vm.handleSubmit()

    expect(createInternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('英文字母、数字和下划线')
  })

  it('校验：描述为空 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: { name: string; description: string; beanName: string; methodName: string }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = ''
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    await vm.handleSubmit()

    expect(createInternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('描述不能为空')
  })

  it('校验：inputSchema 非法 JSON → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        beanName: string
        methodName: string
        inputSchema: string
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    vm.form.inputSchema = '{invalid json'
    await vm.handleSubmit()

    expect(createInternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('合法的 JSON')
  })

  it('新增成功：校验通过后调用 createInternalTool 并 emit saved', async () => {
    vi.mocked(createInternalTool).mockResolvedValueOnce({} as unknown as number)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        beanName: string
        methodName: string
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'new_tool'
    vm.form.description = '新工具'
    vm.form.beanName = 'newBean'
    vm.form.methodName = 'run'
    vm.form.inputSchema = ''
    vm.form.enabled = true
    vm.form.remark = ''
    await vm.handleSubmit()

    expect(createInternalTool).toHaveBeenCalledWith({
      name: 'new_tool',
      description: '新工具',
      beanName: 'newBean',
      methodName: 'run',
      inputSchema: null,
      enabled: true,
      remark: null,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('update:visible')).toBeTruthy()
  })

  it('编辑成功：调用 updateInternalTool 并 emit saved', async () => {
    vi.mocked(getInternalTool).mockResolvedValue(mockDetail)
    vi.mocked(updateInternalTool).mockResolvedValueOnce({} as unknown as void)
    const wrapper = mountDialog({ toolId: 1 })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        beanName: string
        methodName: string
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'updated_tool'
    vm.form.description = '更新后'
    vm.form.beanName = 'updatedBean'
    vm.form.methodName = 'runV2'
    vm.form.inputSchema = '{"type":"object"}'
    vm.form.enabled = false
    vm.form.remark = '已更新'
    await vm.handleSubmit()

    expect(updateInternalTool).toHaveBeenCalledWith(1, {
      name: 'updated_tool',
      description: '更新后',
      beanName: 'updatedBean',
      methodName: 'runV2',
      inputSchema: '{"type":"object"}',
      enabled: false,
      remark: '已更新',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('API 失败：createInternalTool 抛出 ApiError 时显示错误信息', async () => {
    vi.mocked(createInternalTool).mockRejectedValueOnce(new ApiError(400, '名称已存在'))
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: { name: string; description: string; beanName: string; methodName: string }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'dup_tool'
    vm.form.description = 'desc'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    await vm.handleSubmit()

    expect(vm.formError).toBe('名称已存在')
  })

  it('submitting 状态：提交期间 submitting=true 阻止重复提交', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveSubmit: (v: any) => void
    vi.mocked(createInternalTool).mockImplementation(
      () =>
        new Promise((r) => {
          resolveSubmit = r
        }),
    )
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: { name: string; description: string; beanName: string; methodName: string }
      handleSubmit: () => Promise<void>
      submitting: boolean
    }
    vm.form.name = 'tool'
    vm.form.description = 'desc'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'

    const p = vm.handleSubmit()
    await nextTick()
    expect(vm.submitting).toBe(true)

    resolveSubmit!({})
    await p
    expect(vm.submitting).toBe(false)
  })

  // ═══════════════════════════════════════════════════════
  // G5: 合法结构与契约（保存后重开语义一致）
  // ═══════════════════════════════════════════════════════

  it('合法 inputSchema 保存后重开语义一致', async () => {
    const schema =
      '{"type":"object","properties":{"city":{"type":"string"},"unit":{"type":"string"}}}'
    vi.mocked(createInternalTool).mockResolvedValueOnce(99)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        beanName: string
        methodName: string
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'schema_roundtrip'
    vm.form.description = 'Schema 往返测试'
    vm.form.beanName = 'bean'
    vm.form.methodName = 'method'
    vm.form.inputSchema = schema
    vm.form.enabled = true
    vm.form.remark = ''
    await vm.handleSubmit()

    // 保存时 inputSchema 原样传递
    expect(createInternalTool).toHaveBeenCalledWith(
      expect.objectContaining({ inputSchema: schema }),
    )

    // 编辑模式回填：相同 Schema 值
    vi.mocked(getInternalTool).mockResolvedValue({
      id: 99,
      name: 'schema_roundtrip',
      description: 'Schema 往返测试',
      beanName: 'bean',
      methodName: 'method',
      inputSchema: schema,
      enabled: true,
      remark: null,
      createTime: '2026-08-24 10:00:00',
      updateTime: '2026-08-24 10:00:00',
    })
    const editWrapper = mountDialog({ toolId: 99 })
    await nextTick()
    await nextTick()

    const editVm = editWrapper.vm as unknown as { form: { inputSchema: string } }
    expect(editVm.form.inputSchema).toBe(schema)
  })

  it('HTTP 方法与必填字段与后端契约一致', async () => {
    vi.mocked(createInternalTool).mockResolvedValueOnce(100)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        beanName: string
        methodName: string
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'contract_check'
    vm.form.description = '契约验证'
    vm.form.beanName = 'requiredBean'
    vm.form.methodName = 'requiredMethod'
    vm.form.inputSchema = ''
    vm.form.enabled = true
    vm.form.remark = ''
    await vm.handleSubmit()

    // 必填字段：beanName 和 methodName 不为空
    expect(createInternalTool).toHaveBeenCalledWith(
      expect.objectContaining({
        beanName: 'requiredBean',
        methodName: 'requiredMethod',
      }),
    )
    // 空 inputSchema → null
    expect(createInternalTool).toHaveBeenCalledWith(expect.objectContaining({ inputSchema: null }))
  })
})
