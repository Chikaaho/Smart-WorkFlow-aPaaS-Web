import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import type { DynamicFieldSchema } from '../dynamic-field-registry'

// BF20261013-009：下拉选择控件数据来源——dict=字典项 / custom=候选键值对；单选/多选/单选按钮组。
vi.mock('@/foundation/dict', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/dict')>()
  return {
    ...actual,
    useDict: (type: string) =>
      type === 'sys_user_sex'
        ? { items: { value: [{ value: '1', label: '男' }] } }
        : { items: { value: [] } },
  }
})

import DictControl from './DictControl.vue'

function dictField(overrides: Record<string, unknown> = {}): DynamicFieldSchema {
  return {
    name: 'field_pick',
    type: 'DICT',
    label: '下拉选择',
    dictType: '',
    ...overrides,
  } as unknown as DynamicFieldSchema
}

function mountControl(field: DynamicFieldSchema, modelValue: unknown = '') {
  return mount(DictControl, {
    props: { field, modelValue },
    global: { plugins: [i18n] },
  })
}

describe('DictControl 数据来源（BF20261013-009）', () => {
  it('custom 来源：候选键值对映射 label=value / 提交值=key', async () => {
    const wrapper = mountControl(
      dictField({
        source: 'custom',
        options: [
          { key: 'canyin', value: '餐饮' },
          { key: 'jiaotong', value: '交通' },
        ],
      }),
    )
    await nextTick()
    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([
      { label: '餐饮', value: 'canyin' },
      { label: '交通', value: 'jiaotong' },
    ])

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'canyin')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['canyin'])
  })

  it('dict 来源：选项来自字典项，提交值为 code', async () => {
    const wrapper = mountControl(dictField({ source: 'dict', dictType: 'sys_user_sex' }))
    await nextTick()
    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([{ label: '男', value: '1' }])

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '1')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['1'])
  })

  it('下拉多选：select 带 multiple，回写 key 数组，空值归一为空数组', async () => {
    const wrapper = mountControl(
      dictField({
        source: 'custom',
        multiple: true,
        options: [{ key: 'a', value: '甲' }],
      }),
      ['a'],
    )
    await nextTick()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('multiple')).toBe(true)
    expect(select.props('modelValue')).toEqual(['a'])

    select.vm.$emit('update:modelValue', ['a', 'b'])
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['a', 'b']])
  })

  it('renderAs=radio：渲染单选按钮组，提交单值', async () => {
    const wrapper = mountControl(
      dictField({
        source: 'custom',
        renderAs: 'radio',
        options: [{ key: 'male', value: '男' }],
      }),
      '',
    )
    await nextTick()
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'ElOption' })).toHaveLength(0)
    const radios = wrapper.findAll('.el-radio')
    expect(radios.map((r) => r.text())).toEqual(['男'])
  })

  it('未配置数据源（下拉）：渲染禁用占位提示「请配置数据」', async () => {
    const wrapper = mountControl(dictField({ source: 'custom', options: [] }))
    await nextTick()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('disabled')).toBe(true)
    expect(select.props('placeholder')).toBe('请配置数据')
  })

  it('未配置数据源（单选框）：渲染禁用输入占位提示', async () => {
    const wrapper = mountControl(dictField({ source: 'custom', renderAs: 'radio', options: [] }))
    await nextTick()
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(false)
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.exists()).toBe(true)
    expect(input.props('disabled')).toBe(true)
    expect(input.props('placeholder')).toBe('请配置数据')
  })

  it('字典来源未绑定字典：渲染禁用占位提示', async () => {
    const wrapper = mountControl(dictField({ source: 'dict', dictType: '' }))
    await nextTick()
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('placeholder')).toBe('请配置数据')
  })
})
