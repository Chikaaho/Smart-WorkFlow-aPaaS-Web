import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import DynamicField from './DynamicField.vue'
import { registerDynamicFieldDescriptor } from './dynamic-field-registry'
import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * 可插拔性证明（方向文档目标 6）：测试型注册新控件类型 EMAIL（FieldType 占位成员），
 * 消费方 DynamicField 零改动即渲染——主链与 TABLE 子表单元格均查同一注册表生效。
 * 本文件内注册不污染其他 spec 文件（vitest 每文件独立模块实例）。
 */

/** 测试型控件：仅本文件注册，不进入生产注册表静态条目。 */
const EmailControl = defineComponent({
  name: 'EmailControl',
  // 对齐 DynamicFieldControlProps 契约形状（modelValue 为 unknown，宽松声明）
  props: {
    field: { type: Object, required: true },
    modelValue: { type: [String, Number, Boolean], default: '' },
    readonly: { type: Boolean, default: false },
    subField: { type: Boolean, default: false },
    referenceLabel: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  template:
    '<input data-testid="email-control" :value="String(modelValue ?? \'\')" @change="$emit(\'update:modelValue\', $event.target.value)" />',
})

/* ── stub helpers（对齐 DynamicField.spec.ts） ── */
const baseGlobal = {
  stubs: {
    DictSelect: {
      props: ['type', 'modelValue', 'renderAs'],
      emits: ['update:modelValue'],
      template:
        '<select :data-dict-type="type" :data-render-as="renderAs" data-testid="dict-select" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="male">male</option><option value="female">female</option></select>',
    },
    ElDatePicker: {
      props: ['modelValue', 'valueFormat'],
      emits: ['update:modelValue'],
      template: '<input data-testid="date-picker" :value="modelValue" />',
    },
    ElInputNumber: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input data-testid="input-number" type="number" :value="modelValue" :disabled="disabled" />',
    },
    ElSwitch: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input data-testid="switch" type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
    },
    ReferenceSelector: {
      props: ['targetFormKey', 'visible', 'selectedId'],
      emits: ['update:visible', 'select'],
      template: '<div data-testid="reference-selector" style="display:none" />',
    },
  },
}

describe('DynamicField 可插拔性 — 测试型注册新控件（消费方零改动）', () => {
  beforeAll(() => {
    registerDynamicFieldDescriptor({
      type: 'EMAIL',
      component: EmailControl,
      subFieldComponent: EmailControl,
    })
  })

  it('注册 EMAIL 描述符后，DynamicField 主渲染链零改动即渲染', () => {
    // EMAIL 为 FieldType 占位成员（非 FormSchemaField 判别成员），经 unknown 桥接后传入。
    const emailField = { name: 'e1', type: 'EMAIL' } as unknown as FormSchemaField
    const wrapper = mount(DynamicField, {
      props: { field: emailField, modelValue: 'a@b.c' },
      global: baseGlobal,
    })
    const email = wrapper.find('[data-testid="email-control"]')
    expect(email.exists()).toBe(true)
    expect(email.attributes('value')).toBe('a@b.c')
  })

  it('EMAIL 作为 TABLE 子字段同样生效（子表查同一注册表）', () => {
    const wrapper = mount(DynamicField, {
      props: {
        field: {
          name: 't1',
          type: 'TABLE',
          subFields: [{ name: 'col', type: 'EMAIL' }],
        } as FormSchemaField,
        modelValue: [{ col: 'x@y.z' }],
      },
      global: baseGlobal,
    })
    const email = wrapper.find('[data-testid="email-control"]')
    expect(email.exists()).toBe(true)
    expect(email.attributes('value')).toBe('x@y.z')
  })

  it('EMAIL 子字段编辑经 updateCell 整表 emit（行操作语义不变）', async () => {
    const wrapper = mount(DynamicField, {
      props: {
        field: {
          name: 't1',
          type: 'TABLE',
          subFields: [{ name: 'col', type: 'EMAIL' }],
        } as FormSchemaField,
        modelValue: [{ col: '' }],
      },
      global: baseGlobal,
    })
    const email = wrapper.find('[data-testid="email-control"]')
    await email.setValue('new@addr')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const rows = emitted![0][0] as Record<string, unknown>[]
    expect(rows[0].col).toBe('new@addr')
    expect((rows[0] as { _rowAction?: string })._rowAction).toBe('ADD')
  })

  it('未注册类型：主链不渲染 / 子表降级占位输入框（兜底语义不变）', () => {
    // 主链：无描述符 → 无控件渲染（仅标签）。SLIDER 同经 unknown 桥接（占位成员）。
    const sliderField = { name: 'x', type: 'SLIDER' } as unknown as FormSchemaField
    const main = mount(DynamicField, {
      props: { field: sliderField, modelValue: 1 },
      global: baseGlobal,
    })
    expect(main.find('[data-testid="email-control"]').exists()).toBe(false)
    expect(main.findAll('input')).toHaveLength(0)

    // 子表：SLIDER 无 subFieldComponent → 降级占位 el-input（文本占位）
    const sub = mount(DynamicField, {
      props: {
        field: {
          name: 't1',
          type: 'TABLE',
          subFields: [{ name: 'col', type: 'SLIDER' }],
        } as FormSchemaField,
        modelValue: [{ col: 3 }],
      },
      global: baseGlobal,
    })
    const placeholder = sub.findComponent({ name: 'ElInput' })
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.props('placeholder')).toBe('引用类型（文本占位）')
  })
})
