import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { i18n } from '@/locales'

const mockGetFormDefinition = vi.fn()
vi.mock('@/adapters/form-runtime', () => ({
  getFormDefinition: (...args: unknown[]) => mockGetFormDefinition(...args),
  resolveReferenceDisplay: vi.fn(async (_formKey: string, refId: string) => refId),
}))

import BusinessFormReadonly from './BusinessFormReadonly.vue'

const stubs = {
  DynamicField: {
    props: ['field', 'modelValue', 'readonly', 'referenceLabel'],
    template:
      '<div class="dynamic-field" :data-value="JSON.stringify(modelValue)">{{ field.label || field.name }}</div>',
  },
  'el-card': { template: '<div class="el-card"><slot/></div>' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-empty': { props: ['description'], template: '<div class="el-empty">{{ description }}</div>' },
}

describe('BusinessFormReadonly（业务表单只读展示唯一实现）', () => {
  beforeEach(() => {
    mockGetFormDefinition.mockReset()
  })

  it('按表单定义渲染业务字段标签，不暴露内部字段名', async () => {
    mockGetFormDefinition.mockResolvedValue({
      title: '灾备演练',
      fields: [
        { name: 'field_drill_depts', type: 'DEPT', label: '参与部门' },
        { name: 'field_drill_name', type: 'TEXT', label: '演练名称' },
      ],
    })
    const wrapper = mount(BusinessFormReadonly, {
      props: {
        formKey: 'form_drill',
        record: {
          field_drill_depts: ['91002', '91005'],
          field_drill_name: '机房断电演练',
        },
      },
      global: { plugins: [i18n], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('参与部门')
    expect(wrapper.text()).toContain('演练名称')
    expect(wrapper.text()).not.toContain('field_drill_depts')
    expect(wrapper.text()).not.toContain('field_drill_name')
    expect(wrapper.text()).not.toContain('["91002","91005"]')
  })

  it('多值字段为 JSON 数组串时按数组回显，只读选择控件能标出选中项', async () => {
    mockGetFormDefinition.mockResolvedValue({
      title: '灾备演练',
      fields: [
        {
          name: 'field_drill_types',
          type: 'MULTISELECT',
          label: '演练类型',
          options: [{ key: '机房断电', value: '机房断电' }],
        },
      ],
    })
    const wrapper = mount(BusinessFormReadonly, {
      props: {
        formKey: 'form_drill',
        record: { field_drill_types: '["机房断电"]' },
      },
      global: { plugins: [i18n], stubs },
    })
    await flushPromises()

    const field = wrapper.find('.dynamic-field')
    expect(JSON.parse(field.attributes('data-value') ?? 'null')).toEqual(['机房断电'])
  })

  it('表单定义不可用时显示业务提示，不回退渲染原始记录键值', async () => {
    mockGetFormDefinition.mockRejectedValue(new Error('unavailable'))
    const wrapper = mount(BusinessFormReadonly, {
      props: {
        formKey: 'form_drill',
        record: { field_drill_depts: ['91002'] },
      },
      global: { plugins: [i18n], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('表单信息暂时无法显示')
    expect(wrapper.text()).not.toContain('field_drill_depts')
  })
})
