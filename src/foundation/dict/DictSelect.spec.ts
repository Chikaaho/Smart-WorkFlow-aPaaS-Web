import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/foundation/request', () => ({
  request: vi.fn().mockRejectedValue(new Error('mock request — dict load skipped in test')),
}))

import DictSelect from './DictSelect.vue'

describe('foundation/dict/DictSelect', () => {
  it('renders el-select by default (renderAs omitted, component resolved)', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '' },
    })
    // el-select 被 auto-import 全局注册，VTU 能找到它
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
  })

  it('renders el-select when renderAs="select"', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '', renderAs: 'select' },
    })
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(false)
  })

  it('renders el-radio-group when renderAs="radio"', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '', renderAs: 'radio' },
    })
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(false)
  })

  it('disabled prop passes to el-select when true', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '', disabled: true },
    })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.exists()).toBe(true)
    expect(select.props('disabled')).toBe(true)
  })

  it('disabled prop passes to el-radio-group when renderAs="radio"', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '', renderAs: 'radio', disabled: true },
    })
    const radioGroup = wrapper.findComponent({ name: 'ElRadioGroup' })
    expect(radioGroup.exists()).toBe(true)
    expect(radioGroup.props('disabled')).toBe(true)
  })

  it('disabled defaults to false', () => {
    const wrapper = mount(DictSelect, {
      props: { type: 'some_dict', modelValue: '' },
    })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('disabled')).toBe(false)
  })
})
