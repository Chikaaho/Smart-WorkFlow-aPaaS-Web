import { describe, expect, it } from 'vitest'
import { MOCK_WORKFLOW_NODE_CAPABILITIES } from '@/foundation/mock/workflow-node-capabilities'
import {
  assertRequiredNodeCapabilities,
  getDesignableNodeCapabilities,
  NodeCapabilityContractError,
  parseBpmNodeCapabilities,
  resolveWorkflowMiddleNodeType,
  validateProcessGraphCapabilities,
} from './node-capabilities'

describe('workflow node capability contract', () => {
  it('parses the registered nodes and exposes the complete designable chain', () => {
    const capabilities = parseBpmNodeCapabilities(MOCK_WORKFLOW_NODE_CAPABILITIES)

    assertRequiredNodeCapabilities(capabilities)
    expect(getDesignableNodeCapabilities(capabilities).map((item) => item.type)).toEqual([
      'START',
      'END',
      'APPROVAL',
      'CONSENSUS',
      'CONDITION',
      'COPY',
      'NOTIFICATION',
    ])
  })

  it('rejects malformed or duplicate capability entries', () => {
    expect(() =>
      parseBpmNodeCapabilities([
        {
          ...MOCK_WORKFLOW_NODE_CAPABILITIES[0],
          supports: { design: true, save: true, publish: true },
        },
      ]),
    ).toThrow(NodeCapabilityContractError)

    expect(() =>
      parseBpmNodeCapabilities([
        ...MOCK_WORKFLOW_NODE_CAPABILITIES,
        MOCK_WORKFLOW_NODE_CAPABILITIES[0],
      ]),
    ).toThrow('重复节点类型 START')
  })

  it('validates graph nodes, required configuration, and topology from the capability list', () => {
    const capabilities = parseBpmNodeCapabilities(MOCK_WORKFLOW_NODE_CAPABILITIES)
    const validGraph = {
      elements: [
        { id: 'start', kind: 'node', type: 'START', config: {} },
        { id: 'approval', kind: 'node', type: 'APPROVAL', config: { approver: { value: ['u1'] } } },
        { id: 'end', kind: 'node', type: 'END', config: {} },
        { id: 'e1', kind: 'edge', source: 'start', target: 'approval' },
        { id: 'e2', kind: 'edge', source: 'approval', target: 'end' },
      ],
    }

    expect(validateProcessGraphCapabilities(validGraph, capabilities, ['START', 'END'])).toEqual([])

    const missingConfig = {
      ...validGraph,
      elements: validGraph.elements.map((element) =>
        element.id === 'approval' ? { ...element, config: {} } : element,
      ),
    }
    expect(validateProcessGraphCapabilities(missingConfig, capabilities)).toContain(
      '节点 approval（APPROVAL）缺少必填配置：审批人',
    )

    const unknownNode = {
      ...validGraph,
      elements: validGraph.elements.map((element) =>
        element.id === 'approval' ? { ...element, type: 'UNKNOWN' } : element,
      ),
    }
    expect(validateProcessGraphCapabilities(unknownNode, capabilities)).toContain(
      '节点 approval 使用了能力清单未知类型：UNKNOWN',
    )
  })

  it('keeps APPROVAL as the default when an isolated verification node is also available', () => {
    expect(resolveWorkflowMiddleNodeType()).toBe('APPROVAL')
    expect(resolveWorkflowMiddleNodeType('APPROVAL')).toBe('APPROVAL')
    expect(resolveWorkflowMiddleNodeType('P57_VERIFY')).toBe('P57_VERIFY')
  })
})
