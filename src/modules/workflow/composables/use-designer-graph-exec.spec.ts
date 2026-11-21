/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref } from 'vue'
import { useDesignerGraphExec } from './use-designer-graph-exec'

// 跨模块接缝 mock（adapter 动态 import 保持懒加载，测试直接替换数据源）
vi.mock('@/adapters/agent-graph-catalog', () => ({
  listPublishedGraphDefs: vi.fn(async () => [
    { id: 11, graphKey: 'RISK', name: '风控', defVersion: 3, status: 'PUBLISHED' },
    { id: 12, graphKey: 'OTHER', name: '其他', defVersion: 1, status: 'PUBLISHED' },
  ]),
  listGraphVersions: vi.fn(async () => [
    { defVersion: 3, graphKey: 'RISK', name: '风控', createTime: '2026-11-21 10:00:00' },
  ]),
  getGraphVersionBinding: vi.fn(async () => ({
    graphDefId: 11,
    graphKey: 'RISK',
    name: '风控',
    defVersion: 3,
    executionTimeoutSeconds: 300,
    containsHumanNode: false,
    startParams: [
      { name: 'city', type: 'text', required: true, description: '城市' },
      { name: 'amount', type: 'number', required: false, description: '金额' },
    ],
    endParams: [{ name: 'score', description: '风险分' }],
  })),
}))

const updateNodeConfig = vi.fn()
const snapshot = vi.fn()

function mountComposable(config: Record<string, unknown> = {}) {
  const selectedNode = computed(() =>
    config === null ? null : ({ id: 'n1', type: 'GRAPH_EXEC', config } as any),
  )
  const model = { updateNodeConfig } as any
  return useDesignerGraphExec({
    selectedNode,
    model: ref(model) as any,
    isVersionPreview: computed(() => false),
    graph: ref({
      variables: [{ varId: 'v1', name: 'formCity', type: 'STRING', source: 'MAIN_FORM' }],
    } as any),
    snapshot,
  })
}

describe('use-designer-graph-exec（1.2.0 E1-1 Graph 执行器面板状态）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('选中 GRAPH_EXEC 节点：回显既有配置映射', () => {
    const api = mountComposable({
      graphDefId: '11',
      graphDefVersion: '3',
      inputMappings: [{ name: 'city', source: 'formCity' }],
      outputMappings: [{ name: 'riskScore', source: 'score' }],
    })
    expect(api.graphDefId.value).toBe('11')
    expect(api.graphDefVersion.value).toBe('3')
    expect(api.inputRows.value).toHaveLength(1)
    expect(api.inputRows.value[0]).toMatchObject({ name: 'city', source: 'formCity' })
    expect(api.outputRows.value).toHaveLength(1)
    expect(api.outputRows.value[0]).toMatchObject({ source: 'score', target: 'riskScore' })
  })

  it('回显既有配置：载入版本与绑定声明，映射行按声明重建并保留同名已填变量', async () => {
    const api = mountComposable({
      graphDefId: '11',
      graphDefVersion: '3',
      inputMappings: [{ name: 'city', source: 'formCity' }],
    })
    await vi.waitFor(() => expect(api.binding.value?.graphKey).toBe('RISK'))
    // 开始参数声明驱动行重建（city 必填 + amount 可选），同名保留 formCity
    expect(api.inputRows.value.map((row) => [row.name, row.required, row.source])).toEqual([
      ['city', true, 'formCity'],
      ['amount', false, ''],
    ])
    expect(api.outputRows.value).toEqual([{ source: 'score', description: '风险分', target: '' }])
  })

  it('onGraphChange：换图重置映射并默认选最新版本', async () => {
    const api = mountComposable({
      graphDefId: '11',
      graphDefVersion: '3',
      inputMappings: [{ name: 'city', source: 'formCity' }],
    })
    await vi.waitFor(() => expect(api.binding.value?.graphKey).toBe('RISK'))
    await api.onGraphChange('11')
    expect(api.versions.value[0]?.defVersion).toBe(3)
    expect(api.graphDefVersion.value).toBe('3')
    // 换图即换绑定对象：旧映射不跨图保留
    expect(api.inputRows.value.map((row) => row.source)).toEqual(['', ''])
  })

  it('applyGraphExec：写节点配置（id/版本 + 过滤空映射行）', async () => {
    const api = mountComposable({})
    await api.onGraphChange('11')
    api.inputRows.value[1]!.source = 'formAmount'
    api.outputRows.value[0]!.target = 'riskScore'
    api.applyGraphExec()
    expect(updateNodeConfig).toHaveBeenCalledWith('n1', {
      graphDefId: '11',
      graphDefVersion: '3',
      // city 未填 source → 过滤；amount 已填 → 保留
      inputMappings: [{ name: 'amount', source: 'formAmount' }],
      outputMappings: [{ name: 'riskScore', source: 'score' }],
    })
    expect(snapshot).toHaveBeenCalled()
  })

  it('variableOptions：来自流程变量名', () => {
    const api = mountComposable({})
    expect(api.variableOptions.value).toEqual(['formCity'])
  })
})
