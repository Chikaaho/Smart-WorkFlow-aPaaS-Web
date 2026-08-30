import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import {
  NODE_PANEL_REGISTRY,
  getNodePanelDescriptor,
  registerNodePanelDescriptor,
} from './node-panel-registry'
import { NODE_TYPE_LABELS } from '@/modules/agent/utils/graphAdapter'

// 与图设计器 8 类节点全集对齐——新增/删减节点类型时本断言会逼着同步注册表。
const EXPECTED_TYPES = ['START', 'END', 'LLM', 'TOOL', 'CONDITION', 'LOOP', 'FORK', 'JOIN']

describe('NODE_PANEL_REGISTRY', () => {
  it('covers exactly the 8 node types, one descriptor each', () => {
    const types = NODE_PANEL_REGISTRY.map((d) => d.type)
    expect(types).toHaveLength(EXPECTED_TYPES.length)
    expect(new Set(types)).toEqual(new Set(EXPECTED_TYPES))
  })

  it('labels align with NODE_TYPE_LABELS (单一显示数据源)', () => {
    for (const d of NODE_PANEL_REGISTRY) {
      expect(d.label).toBe(NODE_TYPE_LABELS[d.type])
    }
  })

  it('every descriptor carries a panel component', () => {
    for (const d of NODE_PANEL_REGISTRY) {
      expect(d.component).toBeTruthy()
    }
  })

  it('START/END share the empty panel; LLM/TOOL/LOOP/FORK/JOIN/CONDITION each have their own', () => {
    const empty = getNodePanelDescriptor('START')!.component
    expect(getNodePanelDescriptor('END')!.component).toBe(empty)

    const others = ['LLM', 'TOOL', 'CONDITION', 'LOOP', 'FORK', 'JOIN']
    const components = others.map((t) => getNodePanelDescriptor(t)!.component)
    expect(new Set(components).size).toBe(others.length)
  })

  it('getNodePanelDescriptor looks up by type / misses gracefully', () => {
    expect(getNodePanelDescriptor('LLM')?.type).toBe('LLM')
    expect(getNodePanelDescriptor('UNKNOWN_TYPE')).toBeUndefined()
  })

  it('registerNodePanelDescriptor adds new types and replaces same-type descriptors (幂等)', () => {
    // eslint-disable-next-line vue/one-component-per-file -- 测试型探针面板（可插拔性证明）
    const ProbePanelA = defineComponent({
      name: 'ProbePanelA',
      template: '<div data-testid="probe-panel-a" />',
    })
    // eslint-disable-next-line vue/one-component-per-file -- 测试型探针面板（可插拔性证明）
    const ProbePanelB = defineComponent({
      name: 'ProbePanelB',
      template: '<div data-testid="probe-panel-b" />',
    })

    // 新增
    registerNodePanelDescriptor({ type: 'PROBE', label: '探针', component: ProbePanelA })
    expect(getNodePanelDescriptor('PROBE')?.component).toBe(ProbePanelA)

    // 同 type 覆盖式注册（幂等：不产生重复条目）
    registerNodePanelDescriptor({ type: 'PROBE', label: '探针2', component: ProbePanelB })
    expect(getNodePanelDescriptor('PROBE')?.component).toBe(ProbePanelB)
    expect(getNodePanelDescriptor('PROBE')?.label).toBe('探针2')
    expect(NODE_PANEL_REGISTRY.filter((d) => d.type === 'PROBE')).toHaveLength(1)
  })
})
