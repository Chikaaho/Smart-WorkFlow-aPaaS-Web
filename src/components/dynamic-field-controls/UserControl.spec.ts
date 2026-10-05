import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import type { DynamicFieldSchema } from '../dynamic-field-registry'

vi.mock('@/modules/form/api/i2-choices', () => ({
  loadUserChoices: vi.fn(),
}))

// P63：人员控件多选（definition.multiple）与多选值归一化（JSON 数组串 / 数组兼容）
import UserControl from './UserControl.vue'
import { loadUserChoices } from '@/modules/form/api/i2-choices'

function userField(multiple?: boolean): DynamicFieldSchema {
  return {
    name: 'owner',
    type: 'USER',
    label: '人员',
    required: false,
    ...(multiple === undefined ? {} : { multiple }),
  } as unknown as DynamicFieldSchema
}

function mountControl(field: DynamicFieldSchema, modelValue: unknown) {
  return mount(UserControl, {
    props: { field, modelValue },
    global: { plugins: [i18n] },
  })
}

describe('UserControl 多选（P63）', () => {
  beforeEach(() => {
    vi.mocked(loadUserChoices).mockResolvedValue([
      { id: '5', label: '张三' },
      { id: '6', label: '李四' },
    ])
  })

  it('缺省单选路径不变：非 multiple、绑定值为 ID 串', async () => {
    const wrapper = mountControl(userField(), '5')
    await nextTick()
    await nextTick()

    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('multiple')).toBe(false)
    expect(select.props('modelValue')).toBe('5')
  })

  it('multiple=true 渲染多选；JSON 数组串归一为 ID 字符串数组', async () => {
    const wrapper = mountControl(userField(true), '["5","6"]')
    await nextTick()
    await nextTick()

    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('multiple')).toBe(true)
    expect(select.props('modelValue')).toEqual(['5', '6'])
  })

  it('已解析数组值直接选用；不在候选的 ID 兜底为原始 ID 选项（不伪造姓名）', async () => {
    const wrapper = mountControl(userField(true), ['6', '999'])
    await nextTick()
    await nextTick()

    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toEqual(['6', '999'])
    const optionValues = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => o.props('value'))
    expect(optionValues).toContain('999')
  })

  it('历史单个 ID 值宽容归一为单元素选择', async () => {
    const wrapper = mountControl(userField(true), '5')
    await nextTick()
    await nextTick()

    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toEqual(['5'])
  })

  it('选择上抛 ID 字符串数组（数字 ID 归一为串）；清空上抛 null', async () => {
    const wrapper = mountControl(userField(true), null)
    await nextTick()
    await nextTick()

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('change', [5, '6'])
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['5', '6']])

    select.vm.$emit('change', [])
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([null])
  })
})
