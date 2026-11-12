import { describe, it, expect } from 'vitest'
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import {
  NODE_TYPE_ACCENTS,
  NODE_TYPE_ICONS,
  nodePresentation,
  type NodePresentationContext,
} from './node-presentation'

const emptyCtx: NodePresentationContext = {
  modelOptions: [],
  toolOptions: [],
  knowledgeOptions: [],
  edges: [],
}

function ctx(overrides: Partial<NodePresentationContext>): NodePresentationContext {
  return { ...emptyCtx, ...overrides }
}

function node(type: string, data?: Record<string, unknown>): FlowGraphNode {
  return { id: 'n-1', type, label: type, position: { x: 0, y: 0 }, data }
}

describe('node-presentation', () => {
  it('类型 → 图标/主色映射完整（11 类节点）', () => {
    const types = [
      'START',
      'END',
      'LLM',
      'TOOL',
      'CONDITION',
      'LOOP',
      'FORK',
      'JOIN',
      'KNOWLEDGE',
      'HUMAN',
      'SUBGRAPH',
    ]
    for (const type of types) {
      expect(NODE_TYPE_ICONS[type]).toBeTruthy()
      expect(NODE_TYPE_ACCENTS[type]).toBeTruthy()
    }
  })

  it('LLM 摘要：按模型配置回显模型名，未配置给未选择文案', () => {
    const withModel = nodePresentation(
      node('LLM', { agentModelConfigId: 7 }),
      ctx({
        modelOptions: [
          {
            id: 7,
            name: 'DeepSeek V3',
            modelName: 'deepseek-v3',
            providerId: 1,
            providerName: 'DeepSeek',
            providerApiFormat: 'OPENAI_CHAT',
            enabled: true,
          },
        ],
      }),
    )
    expect(withModel.summary).toBe('DeepSeek V3')
    expect(withModel.icon).toBe('spark')

    const withoutModel = nodePresentation(node('LLM', {}), emptyCtx)
    expect(withoutModel.summary).toBe('未选择模型')
  })

  it('TOOL 摘要：工具名或未选择文案', () => {
    expect(nodePresentation(node('TOOL', { toolName: 'http_echo' }), emptyCtx).summary).toBe(
      'http_echo',
    )
    expect(nodePresentation(node('TOOL', {}), emptyCtx).summary).toBe('未选择工具')
  })

  it('CONDITION/FORK/JOIN 摘要按连线数量计算', () => {
    const edges: FlowGraphEdge[] = [
      { id: 'e1', source: 'n-1', target: 'a' },
      { id: 'e2', source: 'n-1', target: 'b' },
      { id: 'e3', source: 'c', target: 'n-1' },
    ]
    expect(nodePresentation(node('CONDITION'), ctx({ edges })).summary).toBe('2 个分支')
    expect(nodePresentation(node('FORK'), ctx({ edges })).summary).toBe('2 路并行')
    expect(nodePresentation(node('JOIN'), ctx({ edges })).summary).toBe('1 路汇合')
  })

  it('LOOP 摘要：maxIterations 有值显示上限，缺省显示默认 10 次', () => {
    expect(nodePresentation(node('LOOP', { maxIterations: 3 }), emptyCtx).summary).toBe('最多 3 次')
    expect(nodePresentation(node('LOOP', {}), emptyCtx).summary).toBe('默认 10 次')
  })

  it('KNOWLEDGE 摘要：知识库名 + TopK，未选给未选择文案', () => {
    const knowledgeOptions = [
      {
        id: 9,
        name: '产品手册',
        embeddingModelId: 1,
        chunkSize: 500,
        chunkOverlap: 50,
      },
    ]
    expect(
      nodePresentation(
        node('KNOWLEDGE', { knowledgeBaseId: 9, topK: 4 }),
        ctx({ knowledgeOptions }),
      ).summary,
    ).toBe('产品手册 · Top 4')
    expect(nodePresentation(node('KNOWLEDGE', {}), emptyCtx).summary).toBe('未选择知识库')
  })

  it('START/END 摘要：声明参数数量，未声明给默认文案', () => {
    const withParams = nodePresentation(
      node('START', {
        params: [
          { name: 'question', type: 'text', required: true },
          { name: '', type: 'text', required: false },
        ],
      }),
      emptyCtx,
    )
    expect(withParams.summary).toBe('1 个入参')
    expect(nodePresentation(node('START', {}), emptyCtx).summary).toBe('文本入参')

    expect(
      nodePresentation(
        node('END', { outputs: [{ name: 'answer', source: 'n-2.output' }] }),
        emptyCtx,
      ).summary,
    ).toBe('1 个出参')
    expect(nodePresentation(node('END', {}), emptyCtx).summary).toBe('未声明出参')
  })

  it('HUMAN 摘要：优先说明首行，否则处理人数量与超时', () => {
    expect(nodePresentation(node('HUMAN', { instructions: '请确认发布' }), emptyCtx).summary).toBe(
      '请确认发布',
    )
    expect(
      nodePresentation(node('HUMAN', { assigneeUserIds: ['1'], timeoutSeconds: 60 }), emptyCtx)
        .summary,
    ).toContain('1 个处理人')
    expect(nodePresentation(node('HUMAN', {}), emptyCtx).summary).toBe('未配置处理人')
  })

  it('SUBGRAPH 摘要：被调用图名称 + 固定版本', () => {
    const presentation = nodePresentation(
      node('SUBGRAPH', { graphDefId: '88', graphDefVersion: 2 }),
      ctx({ graphOptions: [{ id: 88, name: '审批子图', defVersion: 3 }] }),
    )
    expect(presentation.summary).toBe('审批子图 · v2')
    expect(nodePresentation(node('SUBGRAPH', {}), emptyCtx).summary).toBe('未选择子图')
  })

  it('保留既有运行状态（G1-7 节点状态色）', () => {
    const running = nodePresentation(node('LLM'), emptyCtx, 'running')
    expect(running.status).toBe('running')
    const existing = nodePresentation(
      { ...node('LLM'), presentation: { status: 'success' } },
      emptyCtx,
    )
    expect(existing.status).toBe('success')
  })
})
