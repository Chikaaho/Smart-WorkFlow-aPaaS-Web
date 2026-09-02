import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/* ── 可变的 route mock：测试间可修改 query ── */
let mockQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { formKey: 'test-form-key' }, query: mockQuery }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/modules/form/api/form', () => ({
  getFormDefinition: vi.fn(),
  submitForm: vi.fn(),
  getFormData: vi.fn(),
  updateFormData: vi.fn(),
  normalizeSubmitData: vi.fn((data: Record<string, unknown>) => data),
}))

vi.mock('@/modules/form/utils/resolve-reference-display', () => ({
  resolveReferenceDisplay: vi.fn().mockResolvedValue('ref-display'),
}))

import { getFormDefinition, getFormData, submitForm } from '@/modules/form/api/form'
import FormRender from './FormRender.vue'

/* ── 通用 stubs ── */

const baseStubs = {
  DictSelect: { template: '<select />' },
  ElDatePicker: { template: '<input type="text" />' },
  ElInputNumber: { template: '<input type="number" />' },
  ElSkeleton: { template: '<div />' },
  ElEmpty: { template: '<div />' },
  ElAlert: { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  ElButton: { template: '<button><slot /></button>' },
  DynamicField: {
    props: ['field', 'modelValue', 'readonly', 'referenceLabel'],
    template:
      '<div class="dynamic-field-stub" :data-field-name="field.name" :data-readonly="readonly" :data-reference-label="referenceLabel"><label>{{ field.label ?? field.name }}</label></div>',
  },
}

describe('FormRender', () => {
  beforeEach(() => {
    vi.mocked(getFormDefinition).mockReset()
    vi.mocked(getFormData).mockReset()
    vi.mocked(submitForm).mockReset()
    mockQuery = {}
  })

  it('renders one DynamicField per field for given FormSchema', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '测试表单',
      fields: [
        { name: 'f1', type: 'TEXT', required: false },
        { name: 'f2', type: 'NUMBER', required: false },
        { name: 'f3', type: 'BOOL', required: false },
        { name: 'f4', type: 'DATE', required: false },
        { name: 'f5', type: 'REFERENCE', required: false },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    const fields = wrapper.findAll('[data-field-name]')
    expect(fields).toHaveLength(5)
  })

  it('renders form title from schema', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '我的业务表单',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('我的业务表单')
  })

  it('renders DICT and TABLE field types', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: 'F',
      fields: [
        { name: 'd1', type: 'DICT', dictType: 'some_type', required: false },
        {
          name: 't1',
          type: 'TABLE',
          required: false,
          subFields: [{ name: 'col', type: 'TEXT' }],
        },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    const fields = wrapper.findAll('[data-field-name]')
    expect(fields).toHaveLength(2)
  })

  it('shows error message when schema loading fails', async () => {
    vi.mocked(getFormDefinition).mockRejectedValueOnce(new Error('load failed'))

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('表单定义加载失败')
  })

  it('passes readonly=true when mode=view with recordId', async () => {
    mockQuery = { recordId: 'rec_001', mode: 'view' }

    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '查看表单',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })
    vi.mocked(getFormData).mockResolvedValueOnce({ id: 'rec_001', version: 1, x: 'hello' })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await flushPromises() // 等待 record query + ref resolve

    const field = wrapper.find('[data-field-name="x"]')
    expect(field.attributes('data-readonly')).toBe('true')
    // 查看模式不显示提交/保存按钮
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('loads record and resolves REFERENCE display name in edit mode', async () => {
    mockQuery = { recordId: 'rec_001', mode: 'edit' }

    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '编辑表单',
      fields: [
        { name: 'name', type: 'TEXT', required: false },
        { name: 'related', type: 'REFERENCE', targetFormId: 'other-form', required: false },
      ],
    })
    vi.mocked(getFormData).mockResolvedValueOnce({
      id: 'rec_001',
      version: 1,
      name: '张三',
      ref_related_id: 'ref_001',
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await flushPromises() // 等待 ref resolve

    // REFERENCE 字段应传入 referenceLabel
    const refField = wrapper.find('[data-field-name="related"]')
    expect(refField.attributes('data-reference-label')).toBe('ref-display')
    // 编辑模式不 readonly
    expect(refField.attributes('data-readonly')).toBe('false')
  })

  it('shows submit button for new form (no recordId)', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '新建',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('提交')
  })

  it('shows required validation inline and keeps the next grid row below the error', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '必填校验',
      fields: [
        { name: 'required_name', type: 'TEXT', required: true },
        { name: 'next_field', type: 'TEXT', required: false },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-validation-error-for="required_name"]').text()).toBe(
      '此字段为必填项',
    )
    expect(wrapper.text()).toContain('请完善必填项后再提交')
    expect(submitForm).not.toHaveBeenCalled()
  })
})
