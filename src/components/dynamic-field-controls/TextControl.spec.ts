import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TextControl from './TextControl.vue'

function control(value: string, extra = {}) {
  return mount(TextControl, {
    props: {
      field: { name: 'deviceCommandPayload', type: 'TEXT', label: '设备指令参数（JSON）' },
      modelValue: value,
      ...extra,
    },
  })
}

const payload = JSON.stringify({
  drillCode: 'DR-2026-Q4-HD-022',
  action: 'switch',
  powerOff: true,
  fireAlarm: false,
  machineRooms: ['A机房', 'B机房'],
  switchbackWithinMinutes: 30,
})

describe('TextControl 只读 JSON 参数字段化（0.3.3 H7）', () => {
  it('只读 JSON 对象按字段逐行展示，布尔映射是/否、数组顿号拼接，不出现 JSON 原文', () => {
    const wrapper = control(payload, { readonly: true })
    expect(wrapper.find('[data-testid="readonly-json"]').exists()).toBe(true)
    const keys = wrapper.findAll('dt').map((node) => node.text())
    expect(keys).toEqual([
      'drillCode',
      'action',
      'powerOff',
      'fireAlarm',
      'machineRooms',
      'switchbackWithinMinutes',
    ])
    const values = wrapper.findAll('dd').map((node) => node.text())
    expect(values).toContain('DR-2026-Q4-HD-022')
    expect(values).toContain('是')
    expect(values).toContain('否')
    expect(values).toContain('A机房、B机房')
    expect(wrapper.find('.readonly-json__grid').text()).not.toContain('"drillCode"')
  })

  it('JSON 原文收进折叠的「技术参数」，默认不展开', () => {
    const wrapper = control(payload, { readonly: true })
    const raw = wrapper.find('.readonly-json__raw')
    expect(raw.element.tagName).toBe('DETAILS')
    expect(raw.text()).toContain('技术参数（JSON 原文）')
    expect(raw.attributes('open')).toBeUndefined()
    expect(raw.find('pre').text()).toContain('"drillCode": "DR-2026-Q4-HD-022"')
  })

  it('非 JSON 或编辑态保持原文本与输入控件', () => {
    const plain = control('普通文本值', { readonly: true })
    expect(plain.find('[data-testid="readonly-json"]').exists()).toBe(false)
    expect(plain.text()).toContain('普通文本值')

    const editing = control(payload, { readonly: false })
    expect(editing.find('[data-testid="readonly-json"]').exists()).toBe(false)
    expect(editing.find('input').exists()).toBe(true)
  })
})
