import { describe, expect, it } from 'vitest'
import { MOCK_WORKFLOW_NODE_CAPABILITIES } from '@/foundation/mock/workflow-node-capabilities'
import {
  assertRequiredNodeCapabilities,
  buildDynamicParallelConfig,
  buildDynamicParallelFormDraft,
  buildParticipantConfig,
  buildParticipantFormDraft,
  detectParticipantShape,
  emptyParticipantFormDraft,
  getDesignableNodeCapabilities,
  normalizeParticipantConfig,
  NodeCapabilityContractError,
  parseBpmNodeCapabilities,
  resolveWorkflowMiddleNodeType,
  validateDynamicParallelConfigErrors,
  validateNodeConfigSemantics,
  validateParticipantConfigErrors,
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
      'DYNAMIC_PARALLEL',
      'PARALLEL_GATEWAY',
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

describe('P63 participant config (FORM_FIELD shape and legacy compat)', () => {
  it('builds FORM_FIELD value object; only TABLE scope carries tableField/column', () => {
    const main = buildParticipantConfig({
      ...emptyParticipantFormDraft(),
      strategy: 'FORM_FIELD',
      formField: {
        objectType: 'USER',
        scope: 'MAIN',
        field: ' 申请人 ',
        tableField: 'x',
        column: 'y',
      },
    })
    expect(main).toEqual({
      strategy: 'FORM_FIELD',
      value: { objectType: 'USER', scope: 'MAIN', field: '申请人' },
    })

    const table = buildParticipantConfig({
      ...emptyParticipantFormDraft(),
      strategy: 'FORM_FIELD',
      formField: {
        objectType: 'DEPT',
        scope: 'TABLE',
        field: '明细',
        tableField: '处理人表',
        column: '负责人',
      },
    })
    expect(table).toEqual({
      strategy: 'FORM_FIELD',
      value: {
        objectType: 'DEPT',
        scope: 'TABLE',
        field: '明细',
        tableField: '处理人表',
        column: '负责人',
      },
    })
  })

  it('keeps FIXED_USER ids and DEPT_LEADER depts as arrays and ADAPTER adapterId', () => {
    expect(
      buildParticipantConfig({
        ...emptyParticipantFormDraft(),
        strategy: 'FIXED_USER',
        userIds: ['101', '102'],
      }),
    ).toEqual({ strategy: 'FIXED_USER', value: ['101', '102'] })

    expect(
      buildParticipantConfig({
        ...emptyParticipantFormDraft(),
        strategy: 'DEPT_LEADER',
        deptIds: ['dept-1'],
      }),
    ).toEqual({ strategy: 'DEPT_LEADER', value: ['dept-1'] })

    expect(
      buildParticipantConfig({
        ...emptyParticipantFormDraft(),
        strategy: 'ADAPTER',
        adapterId: 'erp-adapter',
      }),
    ).toEqual({ strategy: 'ADAPTER', adapterId: 'erp-adapter' })
  })

  it('normalizes legacy approver shapes into strategy config on open', () => {
    // 旧 object 形状：{type: DESIGNATED, value: […]}
    expect(normalizeParticipantConfig({ type: 'DESIGNATED', value: ['1', '2'] })).toEqual({
      strategy: 'FIXED_USER',
      value: ['1', '2'],
    })
    // 真实契约兼容 object 字段的 JSON 文本路径
    expect(normalizeParticipantConfig('{"type":"DESIGNATED","value":["9"]}')).toEqual({
      strategy: 'FIXED_USER',
      value: ['9'],
    })
    // 旧 mock 结构化 APPROVER 的逗号分隔 id 字符串
    expect(normalizeParticipantConfig('1,2,3')).toEqual({
      strategy: 'FIXED_USER',
      value: ['1', '2', '3'],
    })
    expect(normalizeParticipantConfig({ type: 'ROLE_MEMBER', value: 'manager' })?.strategy).toBe(
      'ROLE',
    )
    // 新形状原样保留（round-trip）
    const formField = { objectType: 'DEPT', scope: 'MAIN', field: '申请部门' } as const
    expect(normalizeParticipantConfig({ strategy: 'FORM_FIELD', value: formField })).toEqual({
      strategy: 'FORM_FIELD',
      value: formField,
    })
    // 空值与无法识别的形状
    expect(normalizeParticipantConfig('')).toBeNull()
    expect(normalizeParticipantConfig(null)).toBeNull()
    expect(normalizeParticipantConfig({ unknown: true })).toBeNull()
  })

  it('surfaces the legacy shape kind for compat display and round-trips the draft', () => {
    expect(detectParticipantShape({ type: 'DESIGNATED', value: ['1'] })).toBe('legacy')
    expect(detectParticipantShape('1,2')).toBe('legacy')
    expect(detectParticipantShape({ strategy: 'FIXED_USER', value: ['1'] })).toBe('strategy')
    expect(detectParticipantShape(undefined)).toBe('empty')

    const built = buildParticipantFormDraft('{"type":"DESIGNATED","value":["1","2"]}')
    expect(built.shape).toBe('legacy')
    expect(built.draft.strategy).toBe('FIXED_USER')
    expect(built.draft.userIds).toEqual(['1', '2'])
  })

  it('reports readable Chinese errors for FORM_FIELD participant gaps', () => {
    expect(validateParticipantConfigErrors({ strategy: 'FIXED_USER', value: ['1'] })).toEqual([])

    expect(
      validateParticipantConfigErrors({
        strategy: 'FORM_FIELD',
        value: { objectType: 'USER', scope: 'MAIN' },
      }),
    ).toEqual(['表单字段参与人缺少主字段名（field）'])

    expect(
      validateParticipantConfigErrors({
        strategy: 'FORM_FIELD',
        value: { objectType: 'USER', scope: 'TABLE', field: '明细' },
      }),
    ).toEqual([
      '表单字段参与人 scope=TABLE 时缺少表格字段名（tableField）',
      '表单字段参与人 scope=TABLE 时缺少列字段名（column）',
    ])

    expect(
      validateParticipantConfigErrors({
        strategy: 'FORM_FIELD',
        value: { objectType: 'ROLE', scope: 'MAIN', field: 'a' },
      }),
    ).toEqual(['表单字段参与人 objectType 非法：ROLE（仅支持 USER/DEPT）'])
  })
})

describe('P63 dynamic parallel config (semanticVersion switch)', () => {
  const baseDraft = buildDynamicParallelFormDraft(null)

  it('writes semanticVersion=2 (and objectType) only when the new-semantics switch is on', () => {
    const v2 = buildDynamicParallelConfig({
      ...baseDraft,
      sourceType: 'FORM_FIELD',
      sourceValue: '参与人',
      objectType: 'DEPT',
      objectSemantic: true,
    })
    expect(v2.semanticVersion).toBe(2)
    expect(v2.source.objectType).toBe('DEPT')

    // 旧语义：不写 semanticVersion 键，source 也不携带 objectType
    const legacy = buildDynamicParallelConfig({
      ...baseDraft,
      sourceType: 'FORM_FIELD',
      sourceValue: '参与人',
      objectType: 'DEPT',
      objectSemantic: false,
    })
    expect('semanticVersion' in legacy).toBe(false)
    expect(legacy.source.objectType).toBeUndefined()
  })

  it('only persists ratio for RATIO mode and optional bounds when present', () => {
    const ratio = buildDynamicParallelConfig({ ...baseDraft, mode: 'RATIO', ratio: 60 })
    expect(ratio.ratio).toBe(60)
    const all = buildDynamicParallelConfig({ ...baseDraft, mode: 'ALL', ratio: 60 })
    expect('ratio' in all).toBe(false)
    expect(buildDynamicParallelConfig({ ...baseDraft, maxBranches: 8 }).maxBranches).toBe(8)
    expect('maxBranches' in buildDynamicParallelConfig(baseDraft)).toBe(false)
  })

  it('validates v2 objectType, TABLE binding, and source value with Chinese messages', () => {
    // 新语义缺 objectType（对齐服务端口径）
    expect(
      validateDynamicParallelConfigErrors({
        source: { type: 'FORM_FIELD', value: '参与人', scope: 'MAIN' },
        mode: 'ALL',
        emptyStrategy: 'BLOCK',
        invalidStrategy: 'SKIP',
        semanticVersion: 2,
      }),
    ).toEqual(['动态并行新语义（按对象分支）缺少 objectType（USER/DEPT）'])

    // 旧语义（缺省 semanticVersion）不要求 objectType
    expect(
      validateDynamicParallelConfigErrors({
        source: { type: 'FORM_FIELD', value: '参与人', scope: 'MAIN' },
        mode: 'ALL',
        emptyStrategy: 'BLOCK',
        invalidStrategy: 'SKIP',
      }),
    ).toEqual([])

    // scope=TABLE 缺 tableField/column + FORM_FIELD 缺 value + v2 缺 objectType
    expect(
      validateDynamicParallelConfigErrors({
        source: { type: 'FORM_FIELD', value: '', scope: 'TABLE' },
        mode: 'ALL',
        emptyStrategy: 'BLOCK',
        invalidStrategy: 'SKIP',
        semanticVersion: 2,
      }),
    ).toEqual([
      '动态并行新语义（按对象分支）缺少 objectType（USER/DEPT）',
      '动态并行来源 scope=TABLE 时缺少表格字段名（tableField）',
      '动态并行来源 scope=TABLE 时缺少列字段名（column）',
      '动态并行来源类型为 FORM_FIELD 时缺少取值（value）',
    ])

    expect(validateDynamicParallelConfigErrors({})).toEqual(['动态并行缺少分支来源（source）'])
    expect(
      validateDynamicParallelConfigErrors({
        source: { type: 'FORM_FIELD', value: '参与人', scope: 'MAIN' },
        semanticVersion: 9,
      }),
    ).toEqual(['动态并行 semanticVersion 非法：仅支持 1（旧语义）或 2（按对象分支）'])
  })

  it('walks the graph and prefixes semantic errors with the node label', () => {
    const graph = {
      elements: [
        {
          id: 'node_1',
          kind: 'node',
          type: 'CONSENSUS',
          config: {
            name: '会签节点',
            participant: { strategy: 'FORM_FIELD', value: { objectType: 'USER', scope: 'MAIN' } },
          },
        },
        {
          id: 'node_2',
          kind: 'node',
          type: 'DYNAMIC_PARALLEL',
          config: {
            name: '动态并行',
            source: { type: 'FORM_FIELD', value: '参与人', scope: 'MAIN' },
            mode: 'ALL',
            emptyStrategy: 'BLOCK',
            invalidStrategy: 'SKIP',
            semanticVersion: 2,
          },
        },
      ],
    }
    expect(validateNodeConfigSemantics(graph)).toEqual([
      '节点 会签节点（CONSENSUS）：表单字段参与人缺少主字段名（field）',
      '节点 动态并行（DYNAMIC_PARALLEL）：动态并行新语义（按对象分支）缺少 objectType（USER/DEPT）',
    ])
    // 无配置的图返回空错误
    expect(validateNodeConfigSemantics({ elements: [] })).toEqual([])
  })
})

describe('P63 mock capability list (new node types)', () => {
  it('declares DYNAMIC_PARALLEL and PARALLEL_GATEWAY with server-aligned metadata', () => {
    const capabilities = parseBpmNodeCapabilities(MOCK_WORKFLOW_NODE_CAPABILITIES)
    const dynamic = capabilities.find((cap) => cap.type === 'DYNAMIC_PARALLEL')
    expect(dynamic?.category).toBe('TASK')
    expect(dynamic?.configFields.map((field) => field.key)).toEqual([
      'source',
      'mode',
      'ratio',
      'maxBranches',
      'emptyStrategy',
      'invalidStrategy',
      'semanticVersion',
    ])
    expect(dynamic?.configFields.find((field) => field.key === 'source')?.required).toBe(true)
    expect(dynamic?.configFields.find((field) => field.key === 'semanticVersion')?.required).toBe(
      false,
    )

    const gateway = capabilities.find((cap) => cap.type === 'PARALLEL_GATEWAY')
    expect(gateway?.category).toBe('GATEWAY')
    expect(gateway?.configFields).toEqual([
      { key: 'name', label: '节点名称', type: 'TEXT', required: false },
    ])
    // 1入多出=分叉、多入1出=汇合：进出均允许多边
    expect(gateway?.topology).toEqual({
      minIncoming: 1,
      maxIncoming: 2147483647,
      minOutgoing: 1,
      maxOutgoing: 2147483647,
    })
  })

  it('enforces required configFields for the new nodes through graph validation', () => {
    const capabilities = parseBpmNodeCapabilities(MOCK_WORKFLOW_NODE_CAPABILITIES)
    const emptyDynamic = {
      elements: [
        { id: 'start', kind: 'node', type: 'START', config: {} },
        { id: 'dyn', kind: 'node', type: 'DYNAMIC_PARALLEL', config: { name: '动态并行' } },
        { id: 'end', kind: 'node', type: 'END', config: {} },
        { id: 'e1', kind: 'edge', source: 'start', target: 'dyn' },
        { id: 'e2', kind: 'edge', source: 'dyn', target: 'end' },
      ],
    }
    const errors = validateProcessGraphCapabilities(emptyDynamic, capabilities, ['START', 'END'])
    expect(errors).toContain('节点 dyn（DYNAMIC_PARALLEL）缺少必填配置：分支来源')
    expect(errors).toContain('节点 dyn（DYNAMIC_PARALLEL）缺少必填配置：完成模式')
    expect(errors).toContain('节点 dyn（DYNAMIC_PARALLEL）缺少必填配置：空来源处置')
    expect(errors).toContain('节点 dyn（DYNAMIC_PARALLEL）缺少必填配置：无效值处置')

    // PARALLEL_GATEWAY 仅 name（可选）：拓扑 1入2出 与 2入1出 均应通过
    const fork = {
      elements: [
        { id: 'start', kind: 'node', type: 'START', config: {} },
        { id: 'gw', kind: 'node', type: 'PARALLEL_GATEWAY', config: { name: '并行网关' } },
        { id: 'approval', kind: 'node', type: 'APPROVAL', config: { approver: { value: ['u1'] } } },
        { id: 'end', kind: 'node', type: 'END', config: {} },
        { id: 'e1', kind: 'edge', source: 'start', target: 'gw' },
        { id: 'e2', kind: 'edge', source: 'gw', target: 'approval' },
        { id: 'e3', kind: 'edge', source: 'approval', target: 'end' },
      ],
    }
    expect(validateProcessGraphCapabilities(fork, capabilities, ['START', 'END'])).toEqual([])
  })
})
