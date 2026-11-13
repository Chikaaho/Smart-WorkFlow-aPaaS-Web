import { describe, it, expect } from 'vitest'
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import {
  buildVariableGroups,
  extractVariableRefs,
  startParamNames,
  upstreamNodeIds,
  validateGraphVariables,
} from './variableReferences'

function node(id: string, type: string, data?: Record<string, unknown>): FlowGraphNode {
  return { id, type, label: id, position: { x: 0, y: 0 }, data }
}

function edge(id: string, source: string, target: string): FlowGraphEdge {
  return { id, source, target }
}

const startNode = node('n-start', 'START', {
  params: [{ name: 'question', type: 'text', required: true }],
})
const llmNode = node('n-llm', 'LLM', { outputVar: 'summary' })
const endNode = node('n-end', 'END')
const chainEdges = [edge('e1', 'n-start', 'n-llm'), edge('e2', 'n-llm', 'n-end')]

describe('variableReferences', () => {
  it('upstreamNodeIds：反向可达（含环不重复）', () => {
    const edges = [...chainEdges, edge('cycle', 'n-end', 'n-llm')]
    expect(upstreamNodeIds('n-end', edges)).toEqual(new Set(['n-llm', 'n-start']))
    expect(upstreamNodeIds('n-start', edges)).toEqual(new Set())
  })

  it('startParamNames：只取非空参数名', () => {
    expect(startParamNames([startNode])).toEqual(['question'])
    expect(startParamNames([node('s', 'START', { params: [{ name: '  ' }] })])).toEqual([])
  })

  it('buildVariableGroups：开始参数 + 上游节点输出，按节点分组', () => {
    const groups = buildVariableGroups(endNode, [startNode, llmNode, endNode], chainEdges)
    expect(groups.map((g) => g.nodeId)).toEqual(['n-start', 'n-llm'])
    expect(groups[0].variables).toEqual([{ name: 'question', reference: '{{question}}' }])
    expect(groups[1].variables).toEqual([{ name: 'summary', reference: '{{n-llm.summary}}' }])
  })

  it('buildVariableGroups：开始节点自身无上游变量组', () => {
    const groups = buildVariableGroups(startNode, [startNode, llmNode], chainEdges)
    expect(groups).toEqual([])
  })

  it('extractVariableRefs：解析花括号引用，忽略普通文本', () => {
    expect(
      extractVariableRefs('你好 {{question}}，摘要 {{n-llm.summary}} 和 {{ question }}'),
    ).toEqual(['question', 'n-llm.summary', 'question'])
    expect(extractVariableRefs('没有变量')).toEqual([])
  })

  it('validateGraphVariables：合法图零错误（节点作用域 + 全局写法混用）', () => {
    const nodes = [
      startNode,
      node('n-llm', 'LLM', {
        outputVar: 'summary',
        userPromptTemplate: '根据 {{question}} 生成摘要',
      }),
      node('n-end', 'END', {
        outputs: [
          { name: 'answer', source: 'n-llm.summary' },
          { name: 'raw', source: 'question' },
        ],
      }),
    ]
    expect(validateGraphVariables(nodes, chainEdges)).toEqual([])
  })

  it('validateGraphVariables：引用不存在的节点/非上游/变量名不匹配分别报错', () => {
    const nodes = [
      startNode,
      node('n-llm', 'LLM', {
        userPromptTemplate: '{{n-404.x}} {{n-end.x}} {{n-start.wrong}}',
      }),
      endNode,
    ]
    const errors = validateGraphVariables(nodes, chainEdges)
    expect(errors).toHaveLength(3)
    expect(errors.map((e) => e.reason).join('|')).toContain('不存在')
    expect(errors.map((e) => e.reason).join('|')).toContain('不在上游')
    expect(errors.map((e) => e.reason).join('|')).toContain('没有输出变量 wrong')
  })

  it('validateGraphVariables：全局变量未定义报错，默认 input 在无参数图可用', () => {
    const nodes = [node('s', 'START'), node('n-llm', 'LLM', { userPromptTemplate: '{{input}}' })]
    const edges = [edge('e1', 's', 'n-llm')]
    expect(validateGraphVariables(nodes, edges)).toEqual([])

    const bad = validateGraphVariables(
      [startNode, node('n-llm', 'LLM', { userPromptTemplate: '{{unknown_var}}' })],
      chainEdges,
    )
    expect(bad).toHaveLength(1)
    expect(bad[0].reason).toContain('unknown_var')
  })

  it('validateGraphVariables：开始参数空名/重名、结束输出缺来源均报错', () => {
    const nodes = [
      node('s', 'START', {
        params: [
          { name: '', type: 'text' },
          { name: 'q', type: 'text' },
          { name: 'q', type: 'text' },
        ],
      }),
      node('e', 'END', { outputs: [{ name: 'x', source: '' }] }),
    ]
    const edges = [edge('e1', 's', 'e')]
    const errors = validateGraphVariables(nodes, edges)
    const reasons = errors.map((e) => e.reason)
    expect(reasons).toContain('参数名称不能为空')
    expect(reasons).toContain('参数名称重复')
    expect(reasons).toContain('输出参数名称与来源变量都不能为空')
  })
})
