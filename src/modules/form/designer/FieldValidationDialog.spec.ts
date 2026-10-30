import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldValidationDialog from './FieldValidationDialog.vue'
import type { DesignerItem } from './types'

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  'el-input-number': {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? undefined : Number($event.target.value))" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-input': {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
}

function textField(patch: Record<string, unknown> = {}): DesignerItem {
  return {
    id: 'f1',
    field: {
      name: 'field_name',
      type: 'TEXT',
      label: '演练名称',
      colSpan: 24,
      length: 200,
      ...patch,
    },
  } as DesignerItem
}

describe('FieldValidationDialog', () => {
  it('确认才回写四字段，取消/关闭不应用', async () => {
    const wrapper = mount(FieldValidationDialog, {
      props: {
        modelValue: true,
        field: textField({ minLength: 2, pattern: '^a', patternMessage: '仅 a' }),
      },
      global: { stubs },
    })

    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(4)
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('2')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('200')
    expect((inputs[2]!.element as HTMLInputElement).value).toBe('^a')

    await inputs[0]!.setValue('3')
    await inputs[3]!.setValue('请输入有效的演练名称')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === '确定')
    await confirmBtn!.trigger('click')

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({
      minLength: 3,
      pattern: '^a',
      patternMessage: '请输入有效的演练名称',
      length: 200,
    })
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([false])
  })

  it('取消不发出确认，只关闭弹窗', async () => {
    const wrapper = mount(FieldValidationDialog, {
      props: { modelValue: true, field: textField() },
      global: { stubs },
    })
    const cancel = wrapper.findAll('button').find((b) => b.text() === '取消')
    await cancel!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([false])
  })
})
