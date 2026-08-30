import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviewModal from './PreviewModal.vue'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

/**
 * PreviewModal（全屏填写态预览）测试：
 *  ① 有字段 → 把**整份** schema 透传给 FormPreview，mode='fill'，数据同源不脱钩
 *  ② REFERENCE/TABLE 照传（降级由 adapter 负责）
 *  ③ 空字段 → 出空态提示，不渲染 FormPreview
 *
 * el-dialog 用 teleport，故 stub 成透传容器；FormPreview stub 避免拉起 form-create 子 app。
 */

const FormPreviewStub = {
  props: ['schema', 'mode'],
  template:
    '<div data-testid="fc" :data-mode="mode" :data-fields="JSON.stringify(schema.fields)"></div>',
}
// el-dialog stub：始终渲染默认插槽（绕过 teleport / visible 门控），便于断言内容。
const DialogStub = { template: '<div><slot /></div>' }

const stubs = { FormPreview: FormPreviewStub, ElDialog: DialogStub }

function mountModal(schema: FormSchema) {
  return mount(PreviewModal, {
    props: { schema, visible: true },
    global: { stubs },
  })
}

function f(name: string, overrides: Partial<FormSchemaField> = {}): FormSchemaField {
  return {
    name,
    type: (overrides.type as FormSchemaField['type']) ?? 'TEXT',
    label: overrides.label,
    required: overrides.required ?? false,
    ...overrides,
  } as FormSchemaField
}

describe('PreviewModal', () => {
  it('passes the whole schema to FormPreview in fill mode', () => {
    const schema: FormSchema = {
      title: '请假申请',
      fields: [f('reason', { type: 'TEXT' }), f('days', { type: 'NUMBER' })],
    }
    const wrapper = mountModal(schema)
    const preview = wrapper.find('[data-testid="fc"]')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('data-mode')).toBe('fill')
    const fields = JSON.parse(preview.attributes('data-fields')!) as FormSchemaField[]
    expect(fields).toHaveLength(2)
    expect(fields.map((x) => x.name)).toEqual(['reason', 'days'])
  })

  it('passes REFERENCE and TABLE through (downgrade in adapter)', () => {
    const schema: FormSchema = {
      title: 't',
      fields: [f('ref', { type: 'REFERENCE' }), f('tbl', { type: 'TABLE', subFields: [] })],
    }
    const wrapper = mountModal(schema)
    const fields = JSON.parse(
      wrapper.find('[data-testid="fc"]').attributes('data-fields')!,
    ) as FormSchemaField[]
    expect(fields.map((x) => x.type)).toEqual(['REFERENCE', 'TABLE'])
  })

  it('shows empty hint and no FormPreview when schema has no fields', () => {
    const wrapper = mountModal({ title: 't', fields: [] })
    expect(wrapper.find('.preview-modal__empty').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fc"]').exists()).toBe(false)
  })
})
