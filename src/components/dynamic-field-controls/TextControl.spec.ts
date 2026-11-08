import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TextControl from './TextControl.vue'

// vi.hoisted ensures mock variable is accessible inside the hoisted vi.mock factory
const mockUseUserStore = vi.hoisted(() => vi.fn())

/** 可变共享会话态：权限门禁用例按用例改写 */
const mockSession = {
  superAdmin: false,
  permissions: new Set<string>(),
  roles: new Set<string>(),
}

vi.mock('@/stores/user', () => ({
  useUserStore: mockUseUserStore,
}))

function control(value: string, extra = {}) {
  return mount(TextControl, {
    props: {
      field: { name: 'deviceCommandPayload', type: 'TEXT', label: '到点下发的设备指令' },
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

beforeEach(() => {
  mockSession.superAdmin = false
  mockSession.permissions.clear()
  mockSession.permissions.add('form:design:save')
  mockUseUserStore.mockReturnValue(mockSession)
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

  it('设计者可见 JSON 原文折叠区，默认不展开', () => {
    const wrapper = control(payload, { readonly: true })
    const raw = wrapper.find('.readonly-json__raw')
    expect(raw.exists()).toBe(true)
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

describe('TextControl JSON 参数中文映射与原文权限（0.3.6 H8）', () => {
  const mappedField = {
    name: 'deviceCommandPayload',
    type: 'TEXT',
    label: '到点下发的设备指令',
    jsonDisplay: {
      keyLabels: {
        drillCode: '演练编号',
        action: '动作',
        powerOff: '机房断电',
        fireAlarm: '火警告警',
        machineRooms: '目标机房',
        switchbackWithinMinutes: '回切时限（分钟）',
      },
      valueLabels: { switch: '切换' },
    },
  }

  it('有映射：键名与枚举取值显示中文', () => {
    const wrapper = control(payload, { readonly: true, field: mappedField })
    const keys = wrapper.findAll('dt').map((node) => node.text())
    expect(keys).toEqual([
      '演练编号',
      '动作',
      '机房断电',
      '火警告警',
      '目标机房',
      '回切时限（分钟）',
    ])
    const values = wrapper.findAll('dd').map((node) => node.text())
    expect(values).toContain('切换')
    expect(values.join(' ')).not.toContain('switch')
    expect(wrapper.find('.readonly-json__grid').text()).not.toContain('drillCode')
  })

  it('无映射：回退显示原始键名与原值', () => {
    const wrapper = control(payload, { readonly: true })
    const keys = wrapper.findAll('dt').map((node) => node.text())
    expect(keys).toContain('drillCode')
    const values = wrapper.findAll('dd').map((node) => node.text())
    expect(values).toContain('switch')
  })

  it('部分映射：命中的键/取值显示中文，未命中回退原文', () => {
    const field = {
      name: 'deviceCommandPayload',
      type: 'TEXT',
      label: '到点下发的设备指令',
      jsonDisplay: { keyLabels: { drillCode: '演练编号' }, valueLabels: { switch: '切换' } },
    }
    const wrapper = control(payload, { readonly: true, field })
    const keys = wrapper.findAll('dt').map((node) => node.text())
    expect(keys).toContain('演练编号')
    expect(keys).toContain('action')
    const values = wrapper.findAll('dd').map((node) => node.text())
    expect(values).toContain('切换')
    expect(values).toContain('DR-2026-Q4-HD-022')
  })

  it('数组字符串项同样过取值映射，布尔仍显示是/否', () => {
    const field = {
      name: 'deviceCommandPayload',
      type: 'TEXT',
      label: '到点下发的设备指令',
      jsonDisplay: {
        keyLabels: { machineRooms: '目标机房', powerOff: '机房断电' },
        valueLabels: { A机房: '华东 A 机房' },
      },
    }
    const wrapper = control(payload, { readonly: true, field })
    const values = wrapper.findAll('dd').map((node) => node.text())
    expect(values).toContain('华东 A 机房、B机房')
    expect(values).toContain('是')
  })

  it('普通审批人（无 form:design:save）看不到 JSON 原文折叠区', () => {
    mockSession.permissions.clear()
    const wrapper = control(payload, { readonly: true, field: mappedField })
    expect(wrapper.find('[data-testid="readonly-json"]').exists()).toBe(true)
    expect(wrapper.find('.readonly-json__raw').exists()).toBe(false)
  })

  it('超管（superAdmin）可见 JSON 原文折叠区', () => {
    mockSession.superAdmin = true
    const wrapper = control(payload, { readonly: true })
    expect(wrapper.find('.readonly-json__raw').exists()).toBe(true)
  })
})
