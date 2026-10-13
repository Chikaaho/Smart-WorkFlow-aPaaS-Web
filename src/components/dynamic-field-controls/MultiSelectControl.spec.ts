import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import type { DynamicFieldSchema } from '../dynamic-field-registry'

// BF20261013-008：多选控件键值对语义——展示 value、提交 key；兼容历史 string[]。
// BF20261013-009：数据来源 source=dict 时改用字典项。
vi.mock('@/foundation/dict', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/dict')>()
  return {
    ...actual,
    useDict: (type: string) =>
      type === 'sys_opt'
        ? { items: { value: [{ value: 'd1', label: '字典甲' }] } }
        : { items: { value: [] } },
  }
})

import MultiSelectControl from './MultiSelectControl.vue'

function multiField(options: unknown): DynamicFieldSchema {
  return {
    name: 'field_multi',
    type: 'MULTISELECT',
    label: '多选',
    options,
  } as unknown as DynamicFieldSchema
}

function mountControl(field: DynamicFieldSchema, modelValue: unknown = []) {
  return mount(MultiSelectControl, {
    props: { field, modelValue },
    global: { plugins: [i18n] },
  })
}

describe('MultiSelectControl 候选选项键值对', () => {
  it('选项 label=value、提交值=value 对应的 key', async () => {
    const wrapper = mountControl(
      multiField([
        { key: 'canyin', value: '餐饮' },
        { key: 'jiaotong', value: '交通' },
      ]),
    )
    await nextTick()

    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([
      { label: '餐饮', value: 'canyin' },
      { label: '交通', value: 'jiaotong' },
    ])
  })

  it('历史 string[] 选项兼容为 key=value=原字符串', async () => {
    const wrapper = mountControl(multiField(['餐饮', '交通']))
    await nextTick()

    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([
      { label: '餐饮', value: '餐饮' },
      { label: '交通', value: '交通' },
    ])
  })

  it('空键行（编辑中间态）不渲染', async () => {
    const wrapper = mountControl(
      multiField([
        { key: 'canyin', value: '餐饮' },
        { key: '', value: '' },
      ]),
    )
    await nextTick()
    expect(wrapper.findAllComponents({ name: 'ElOption' })).toHaveLength(1)
  })

  it('选择上抛 key 字符串数组', async () => {
    const wrapper = mountControl(multiField([{ key: 'canyin', value: '餐饮' }]))
    await nextTick()

    wrapper
      .findComponent({ name: 'ElSelect' })
      .vm.$emit('update:modelValue', ['canyin', 'jiaotong'])
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['canyin', 'jiaotong']])
  })

  it('数据来源=字典：选项来自绑定字典项，展示 label、提交 code', async () => {
    const field = {
      name: 'field_multi',
      type: 'MULTISELECT',
      label: '多选',
      source: 'dict',
      dictType: 'sys_opt',
    } as unknown as DynamicFieldSchema
    const wrapper = mountControl(field)
    await nextTick()

    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([{ label: '字典甲', value: 'd1' }])
  })
})
