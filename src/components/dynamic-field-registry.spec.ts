import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import {
  DYNAMIC_FIELD_REGISTRY,
  getDynamicFieldDescriptor,
  getSubFieldComponent,
  registerDynamicFieldDescriptor,
} from './dynamic-field-registry'
import PlaceholderControl from './dynamic-field-controls/PlaceholderControl.vue'
import type { FieldType } from '@/contracts/form-schema'

// 与契约「启用类型」全集对齐——新增/删减启用类型时本断言会逼着同步注册表。
const ENABLED_TYPES: FieldType[] = [
  'TEXT',
  'RICH_TEXT',
  'NUMBER',
  'DATE',
  'BOOL',
  'DICT',
  'REFERENCE',
  'TABLE',
]

describe('DYNAMIC_FIELD_REGISTRY', () => {
  it('covers exactly the 8 enabled field types, one descriptor each', () => {
    const types = DYNAMIC_FIELD_REGISTRY.map((d) => d.type)
    expect(types).toHaveLength(ENABLED_TYPES.length)
    expect(new Set(types)).toEqual(new Set(ENABLED_TYPES))
  })

  it('every descriptor carries a main render component', () => {
    for (const d of DYNAMIC_FIELD_REGISTRY) {
      expect(d.component).toBeTruthy()
    }
  })

  it('6 editable types carry a sub-field component; REFERENCE/TABLE degrade to placeholder (null)', () => {
    const EDITABLE_TYPES: FieldType[] = ['TEXT', 'RICH_TEXT', 'NUMBER', 'DATE', 'BOOL', 'DICT']
    for (const t of EDITABLE_TYPES) {
      expect(getDynamicFieldDescriptor(t)!.subFieldComponent).toBeTruthy()
    }
    expect(getDynamicFieldDescriptor('REFERENCE')!.subFieldComponent).toBeNull()
    expect(getDynamicFieldDescriptor('TABLE')!.subFieldComponent).toBeNull()
  })

  it('getDynamicFieldDescriptor looks up by type / misses gracefully', () => {
    expect(getDynamicFieldDescriptor('TEXT')?.type).toBe('TEXT')
    expect(getDynamicFieldDescriptor('SLIDER')).toBeUndefined()
  })

  it('getSubFieldComponent resolves per type and falls back to PlaceholderControl', () => {
    // 已注册子表组件：直接返回对应组件
    expect(getSubFieldComponent('TEXT')).toBe(getDynamicFieldDescriptor('TEXT')!.subFieldComponent)
    // REFERENCE / TABLE / 未注册类型 → 降级占位输入框
    expect(getSubFieldComponent('REFERENCE')).toBe(PlaceholderControl)
    expect(getSubFieldComponent('TABLE')).toBe(PlaceholderControl)
    expect(getSubFieldComponent('SLIDER')).toBe(PlaceholderControl)
  })

  it('registerDynamicFieldDescriptor adds new types and replaces same-type descriptors (幂等)', () => {
    // eslint-disable-next-line vue/one-component-per-file -- 测试型探针控件（可插拔性证明）
    const ProbeControlA = defineComponent({
      name: 'ProbeControlA',
      template: '<input data-testid="probe-a" />',
    })
    // eslint-disable-next-line vue/one-component-per-file -- 测试型探针控件（可插拔性证明）
    const ProbeControlB = defineComponent({
      name: 'ProbeControlB',
      template: '<input data-testid="probe-b" />',
    })

    // 新增
    registerDynamicFieldDescriptor({
      type: 'PROBE',
      component: ProbeControlA,
      subFieldComponent: null,
    })
    expect(getDynamicFieldDescriptor('PROBE')?.component).toBe(ProbeControlA)

    // 同 type 覆盖式注册（幂等：不产生重复条目）
    registerDynamicFieldDescriptor({
      type: 'PROBE',
      component: ProbeControlB,
      subFieldComponent: ProbeControlB,
    })
    expect(getDynamicFieldDescriptor('PROBE')?.component).toBe(ProbeControlB)
    expect(getSubFieldComponent('PROBE')).toBe(ProbeControlB)
    expect(DYNAMIC_FIELD_REGISTRY.filter((d) => d.type === 'PROBE')).toHaveLength(1)
  })
})
