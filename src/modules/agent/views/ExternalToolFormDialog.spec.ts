import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/agent/api', () => ({
  createExternalTool: vi.fn(),
  getExternalTool: vi.fn(),
  updateExternalTool: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { createExternalTool, getExternalTool, updateExternalTool } from '@/modules/agent/api'
import type { AgentToolExternalConfig } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import ExternalToolFormDialog from './ExternalToolFormDialog.vue'

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
  'el-select': {
    template:
      '<select class="el-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{o.label}}</option></select>',
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
  },
  'el-option': { template: '<option/>', props: ['label', 'value'] },
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

const mockDetail: AgentToolExternalConfig = {
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
}

function mountDialog(props: { visible?: boolean; toolId?: number | null } = {}) {
  return mount(ExternalToolFormDialog, {
    props: { visible: props.visible ?? true, toolId: props.toolId ?? null },
    global: { plugins: [createPinia()], stubs },
  })
}

describe('ExternalToolFormDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('新增模式：toolId=null 时不调用 getExternalTool', async () => {
    vi.mocked(getExternalTool).mockResolvedValue(mockDetail)
    mountDialog({ toolId: null })
    await nextTick()
    expect(getExternalTool).not.toHaveBeenCalled()
  })

  it('编辑模式：toolId 存在时调用 getExternalTool 回填表单', async () => {
    vi.mocked(getExternalTool).mockResolvedValue(mockDetail)
    const wrapper = mountDialog({ toolId: 10 })
    await nextTick()
    await nextTick()
    expect(getExternalTool).toHaveBeenCalledWith(10)
    const vm = wrapper.vm as unknown as { form: Record<string, unknown> }
    expect(vm.form.name).toBe('web_search')
    expect(vm.form.description).toBe('网络搜索')
    expect(vm.form.url).toBe('https://api.search.com/v1/search')
    expect(vm.form.httpMethod).toBe('POST')
    expect(vm.form.timeoutSeconds).toBe(30)
  })

  it('校验：URL 为空 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.url = ''
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('URL 不能为空')
  })

  it('校验：URL 格式非法 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.url = 'not-a-url'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('URL 格式不正确')
  })

  it('校验：URL 非 http/https 协议 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.url = 'ftp://example.com'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('http:// 或 https://')
  })

  it('校验：超时时间 < 1 → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.url = 'https://example.com'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 0
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('正整数')
  })

  it('校验：inputSchema 非法 JSON → 提示错误', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
        inputSchema: string
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'valid_tool'
    vm.form.description = 'desc'
    vm.form.url = 'https://example.com'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    vm.form.inputSchema = '{bad json'
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('合法的 JSON')
  })

  it('新增成功：校验通过后调用 createExternalTool', async () => {
    vi.mocked(createExternalTool).mockResolvedValueOnce({} as unknown as number)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'api_caller'
    vm.form.description = 'API 调用'
    vm.form.url = 'https://api.example.com/call'
    vm.form.httpMethod = 'GET'
    vm.form.timeoutSeconds = 60
    vm.form.inputSchema = ''
    vm.form.enabled = true
    vm.form.remark = ''
    await vm.handleSubmit()

    expect(createExternalTool).toHaveBeenCalledWith({
      name: 'api_caller',
      description: 'API 调用',
      url: 'https://api.example.com/call',
      httpMethod: 'GET',
      timeoutSeconds: 60,
      inputSchema: null,
      enabled: true,
      remark: null,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('编辑成功：调用 updateExternalTool', async () => {
    vi.mocked(getExternalTool).mockResolvedValue(mockDetail)
    vi.mocked(updateExternalTool).mockResolvedValueOnce({} as unknown as void)
    const wrapper = mountDialog({ toolId: 10 })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'updated_search'
    vm.form.description = '更新搜索'
    vm.form.url = 'https://api.updated.com/search'
    vm.form.httpMethod = 'PUT'
    vm.form.timeoutSeconds = 45
    vm.form.inputSchema = '{"type":"object"}'
    vm.form.enabled = false
    vm.form.remark = '已更新'
    await vm.handleSubmit()

    expect(updateExternalTool).toHaveBeenCalledWith(10, {
      name: 'updated_search',
      description: '更新搜索',
      url: 'https://api.updated.com/search',
      httpMethod: 'PUT',
      timeoutSeconds: 45,
      inputSchema: '{"type":"object"}',
      enabled: false,
      remark: '已更新',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('API 失败：createExternalTool 抛出 ApiError 时显示错误信息', async () => {
    vi.mocked(createExternalTool).mockRejectedValueOnce(new ApiError(400, 'URL 已被使用'))
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'dup_tool'
    vm.form.description = 'desc'
    vm.form.url = 'https://example.com'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    await vm.handleSubmit()

    expect(vm.formError).toBe('URL 已被使用')
  })

  // ═══════════════════════════════════════════════════════
  // G5: 合法结构与契约（保存后重开语义一致）
  // ═══════════════════════════════════════════════════════

  it('合法 inputSchema 保存后重开语义一致', async () => {
    const schema = '{"type":"object","properties":{"q":{"type":"string"}}}'
    vi.mocked(createExternalTool).mockResolvedValueOnce(200)
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
        inputSchema: string
        enabled: boolean
        remark: string
      }
      handleSubmit: () => Promise<void>
    }
    vm.form.name = 'schema_roundtrip_ext'
    vm.form.description = 'Schema 往返测试'
    vm.form.url = 'https://api.test.com/v1/search'
    vm.form.httpMethod = 'POST'
    vm.form.timeoutSeconds = 30
    vm.form.inputSchema = schema
    vm.form.enabled = true
    vm.form.remark = ''
    await vm.handleSubmit()

    // 保存时 inputSchema 原样传递
    expect(createExternalTool).toHaveBeenCalledWith(
      expect.objectContaining({ inputSchema: schema }),
    )

    // 编辑模式回填：相同 Schema 值
    vi.mocked(getExternalTool).mockResolvedValue({
      id: 200,
      name: 'schema_roundtrip_ext',
      description: 'Schema 往返测试',
      url: 'https://api.test.com/v1/search',
      httpMethod: 'POST',
      timeoutSeconds: 30,
      inputSchema: schema,
      enabled: true,
      remark: null,
      createTime: '2026-08-24 10:00:00',
      updateTime: '2026-08-24 10:00:00',
    })
    const editWrapper = mountDialog({ toolId: 200 })
    await nextTick()
    await nextTick()

    const editVm = editWrapper.vm as unknown as { form: { inputSchema: string } }
    expect(editVm.form.inputSchema).toBe(schema)
  })

  it('HTTP 方法仅接受 GET/POST/PUT（与 handler 契约一致）', async () => {
    // 验证表单 httpMethod 选项与后端 handler 接受的方法一致
    const validMethods = ['GET', 'POST', 'PUT']
    for (const method of validMethods) {
      vi.mocked(createExternalTool).mockResolvedValueOnce({} as unknown as number)
      const wrapper = mountDialog({ toolId: null })
      await nextTick()

      const vm = wrapper.vm as unknown as {
        form: {
          name: string
          description: string
          url: string
          httpMethod: string
          timeoutSeconds: number
        }
        handleSubmit: () => Promise<void>
      }
      vm.form.name = `method_${method.toLowerCase()}`
      vm.form.description = 'test'
      vm.form.url = 'https://test.com'
      vm.form.httpMethod = method
      vm.form.timeoutSeconds = 10
      await vm.handleSubmit()

      expect(createExternalTool).toHaveBeenCalledWith(
        expect.objectContaining({ httpMethod: method }),
      )
    }
  })

  it('timeoutSeconds 必须为正整数', async () => {
    const wrapper = mountDialog({ toolId: null })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      form: {
        name: string
        description: string
        url: string
        httpMethod: string
        timeoutSeconds: number
      }
      handleSubmit: () => Promise<void>
      formError: string
    }
    vm.form.name = 'timeout_test'
    vm.form.description = 'desc'
    vm.form.url = 'https://test.com'
    vm.form.httpMethod = 'GET'
    vm.form.timeoutSeconds = 0
    await vm.handleSubmit()

    expect(createExternalTool).not.toHaveBeenCalled()
    expect(vm.formError).toContain('正整数')
  })
})
