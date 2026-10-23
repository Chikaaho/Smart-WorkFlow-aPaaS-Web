import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DateControl from './DateControl.vue'

beforeEach(() => vi.stubEnv('TZ', 'Asia/Shanghai'))
afterEach(() => vi.unstubAllEnvs())

function control(value: string, extra = {}) {
  return mount(DateControl, {
    props: {
      field: { name: 'when', type: 'DATE', format: 'datetime' },
      modelValue: value,
      readonly: true,
      ...extra,
    },
  })
}

describe('DateControl 日期时间回看', () => {
  it('UTC 响应按浏览器本地时间回看，不把 UTC 钟面值当成本地值', () => {
    expect(control('2026-10-25T01:00:00.000+00:00').text()).toBe('2026-10-25 09:00')
  })

  it('保留无时区历史值，分钟与非零秒不丢失', () => {
    expect(control('2026-10-25 09:00').text()).toBe('2026-10-25 09:00')
    expect(control('2026-10-25 09:05:27').text()).toBe('2026-10-25 09:05:27')
  })

  it('纯日期处理跨日 UTC 响应，日期串本身不作时区偏移', () => {
    const extra = { field: { name: 'day', type: 'DATE' } }
    expect(control('2026-10-24T16:00:00Z', extra).text()).toBe('2026-10-25')
    expect(control('2026-10-25', extra).text()).toBe('2026-10-25')
  })

  it('编辑控件接收本地完整时间，用户修改仍按既有格式上抛', async () => {
    const wrapper = control('2026-10-25T01:00:00Z', { readonly: false })
    const picker = wrapper.findComponent({ name: 'ElDatePicker' })
    expect(picker.props('modelValue')).toBe('2026-10-25 09:00:00')
    picker.vm.$emit('update:model-value', '2026-10-25 10:30:00')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-10-25 10:30:00'])
  })

  it('空值显示占位；子表只读值无可编辑日期选择器', () => {
    const wrapper = control('', { subField: true })
    expect(wrapper.text()).toBe('—')
    expect(wrapper.findComponent({ name: 'ElDatePicker' }).exists()).toBe(false)
    expect(wrapper.find('.readonly-value__icon').exists()).toBe(false)
  })
})
