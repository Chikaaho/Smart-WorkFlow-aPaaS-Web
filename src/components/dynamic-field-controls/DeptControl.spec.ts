import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import type { DynamicFieldSchema } from '../dynamic-field-registry'

vi.mock('@/modules/form/api/i2-choices', () => ({
  loadDeptChoices: vi.fn(),
}))

// V012-BUG-019 复开：部门控件改为系统弹窗选择（不再下拉）
import DeptControl from './DeptControl.vue'
import { loadDeptChoices } from '@/modules/form/api/i2-choices'

const field = {
  name: 'dept',
  type: 'DEPT',
  label: '部门',
  required: false,
} as unknown as DynamicFieldSchema

const mountOptions = {
  props: {
    field,
    modelValue: null as unknown,
  },
  global: { plugins: [i18n], stubs: { teleport: true } },
}

describe('DeptControl 弹窗选择', () => {
  beforeEach(() => {
    vi.mocked(loadDeptChoices).mockResolvedValue([
      { id: '10', label: '总公司' },
      { id: '11', label: '　研发部' },
      { id: '12', label: '　市场部' },
    ])
  })

  it('触发框只读显示选中部门名；点击打开弹窗', async () => {
    const wrapper = mount(DeptControl, {
      ...mountOptions,
      props: { ...mountOptions.props, modelValue: 11 },
    })
    await nextTick()
    await nextTick()

    const trigger = wrapper.find('.dept-picker__trigger input')
    expect((trigger.element as HTMLInputElement).value).toBe('研发部')
    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('.dept-picker__table').exists()).toBe(true)
  })

  it('弹窗内行选后确认上抛数值 id；未选确认清空', async () => {
    const wrapper = mount(DeptControl, mountOptions)
    await nextTick()
    await wrapper.find('.dept-picker__trigger input').trigger('click')

    const rows = wrapper.findAll('.dept-picker__table tbody tr')
    expect(rows.length).toBe(3)
    await rows[2]!.trigger('click')
    expect(wrapper.find('.dept-picker__check.is-checked').exists()).toBe(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '确定')!
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['12'])
  })

  it('readonly 时点击不打开弹窗；清除按钮上抛 null', async () => {
    const wrapper = mount(DeptControl, {
      ...mountOptions,
      props: { ...mountOptions.props, modelValue: 10, readonly: true },
    })
    await nextTick()
    await wrapper.find('.dept-picker__trigger input').trigger('click')
    expect(wrapper.find('.dept-picker__table').exists()).toBe(false)
  })
})

/**
 * P63：multiple=true 多选——弹窗可复选，确认上抛 ID 数组（清空上抛 null）；
 * 回显兼容 JSON 数组串 / 已解析数组，显示名复用单选回显通道（逐个解析部门名）。
 */
describe('DeptControl 多选（P63）', () => {
  const multiField = {
    name: 'depts',
    type: 'DEPT',
    label: '部门',
    required: false,
    multiple: true,
  } as unknown as DynamicFieldSchema

  beforeEach(() => {
    vi.mocked(loadDeptChoices).mockResolvedValue([
      { id: '10', label: '总公司' },
      { id: '11', label: '　研发部' },
      { id: '12', label: '　市场部' },
    ])
  })

  it('触发框逐个回显部门名；JSON 数组串归一（数字 ID 亦兼容）', async () => {
    const wrapper = mount(DeptControl, {
      ...mountOptions,
      props: { ...mountOptions.props, field: multiField, modelValue: '[10,11]' },
    })
    await nextTick()
    await nextTick()

    const trigger = wrapper.find('.dept-picker__trigger input')
    expect((trigger.element as HTMLInputElement).value).toBe('总公司、研发部')
  })

  it('弹窗内复选后确认上抛 ID 字符串数组；全部取消确认上抛 null', async () => {
    const wrapper = mount(DeptControl, {
      ...mountOptions,
      props: { ...mountOptions.props, field: multiField, modelValue: null },
    })
    await nextTick()
    await wrapper.find('.dept-picker__trigger input').trigger('click')

    const rows = wrapper.findAll('.dept-picker__table tbody tr')
    await rows[0]!.trigger('click')
    await rows[2]!.trigger('click')
    expect(wrapper.findAll('.dept-picker__check.is-checked').length).toBe(2)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '确定')!
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['10', '12']])

    // 再开弹窗（prop 未回写 → 待选从空开始），勾选两行再逐一取消勾选，确认 → 上抛 null
    await wrapper.find('.dept-picker__trigger input').trigger('click')
    await nextTick()
    const rowsAgain = wrapper.findAll('.dept-picker__table tbody tr')
    await rowsAgain[0]!.trigger('click')
    await rowsAgain[2]!.trigger('click')
    await rowsAgain[0]!.trigger('click')
    await rowsAgain[2]!.trigger('click')
    expect(wrapper.findAll('.dept-picker__check.is-checked').length).toBe(0)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '确定')!
      .trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([null])
  })
})
