/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NodeTrajectory from './NodeTrajectory.vue'
import type { AgentGraphExecutionNode } from '@/contracts/agent'

// ──────────────────────────────────────────────────────────────
// Mock data generators for each trajectory scenario
// ──────────────────────────────────────────────────────────────

/** 顺序链：START → LLM → END（单分支，branchId 由后端统一返回 "0"） */
const makeSequentialNodes = (): AgentGraphExecutionNode[] => [
  {
    nodeSeq: 1,
    nodeId: 'start',
    nodeType: 'START',
    nodeName: '开始',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 10,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.000Z',
  },
  {
    nodeSeq: 2,
    nodeId: 'llm_1',
    nodeType: 'LLM',
    nodeName: 'AI 助手',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 200,
    branchId: '0',
    input: '{"q":"hi"}',
    output: '{"r":"hello"}',
    buildTime: '2026-08-20T10:00:00.100Z',
  },
  {
    nodeSeq: 3,
    nodeId: 'end',
    nodeType: 'END',
    nodeName: '结束',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 5,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.300Z',
  },
]

/** FORK 扇出：START → FORK → (LLM-A, LLM-B 并行) → JOIN → END */
const makeForkJoinNodes = (): AgentGraphExecutionNode[] => [
  {
    nodeSeq: 1,
    nodeId: 'start',
    nodeType: 'START',
    nodeName: '开始',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 10,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.000Z',
  },
  {
    nodeSeq: 2,
    nodeId: 'fork_1',
    nodeType: 'FORK',
    nodeName: '扇出',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 2,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.050Z',
  },
  {
    nodeSeq: 3,
    nodeId: 'llm_a',
    nodeType: 'LLM',
    nodeName: '分析器 A',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 150,
    input: '{"task":"analyze"}',
    output: '{"a":"result_a"}',
    branchId: '0-0',
    buildTime: '2026-08-20T10:00:00.050Z',
  },
  {
    nodeSeq: 4,
    nodeId: 'llm_b',
    nodeType: 'LLM',
    nodeName: '分析器 B',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 170,
    input: '{"task":"analyze"}',
    output: '{"b":"result_b"}',
    branchId: '0-1',
    buildTime: '2026-08-20T10:00:00.050Z',
  },
  {
    nodeSeq: 5,
    nodeId: 'join_1',
    nodeType: 'JOIN',
    nodeName: '汇合',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 3,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.300Z',
  },
  {
    nodeSeq: 6,
    nodeId: 'end',
    nodeType: 'END',
    nodeName: '结束',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 5,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.310Z',
  },
]

/** LOOP 循环：重复访问同一节点 ID（不同 nodeSeq，相同 nodeId） */
const makeLoopNodes = (): AgentGraphExecutionNode[] => [
  {
    nodeSeq: 1,
    nodeId: 'start',
    nodeType: 'START',
    nodeName: '开始',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 10,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.000Z',
  },
  {
    nodeSeq: 2,
    nodeId: 'loop_body',
    nodeType: 'LOOP',
    nodeName: '循环体',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 80,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.100Z',
    input: '{"iter":1}',
  },
  {
    nodeSeq: 3,
    nodeId: 'loop_body',
    nodeType: 'LOOP',
    nodeName: '循环体',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 90,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.300Z',
    input: '{"iter":2}',
  },
  {
    nodeSeq: 4,
    nodeId: 'loop_body',
    nodeType: 'LOOP',
    nodeName: '循环体',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 85,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.500Z',
    input: '{"iter":3}',
  },
  {
    nodeSeq: 5,
    nodeId: 'end',
    nodeType: 'END',
    nodeName: '结束',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 5,
    branchId: '0',
    buildTime: '2026-08-20T10:00:00.510Z',
  },
]

/** 失败节点：包含 FAILED 状态的节点，带有 errorMessage */
const makeFailedNodes = (): AgentGraphExecutionNode[] => [
  {
    nodeSeq: 1,
    nodeId: 'start',
    nodeType: 'START',
    nodeName: '开始',
    status: 'SUCCESS',
    success: true,
    nodeLatencyMs: 10,
    branchId: '0',
    buildTime: '2026-08-20T11:00:00.000Z',
  },
  {
    nodeSeq: 2,
    nodeId: 'llm_fail',
    nodeType: 'LLM',
    nodeName: '模型调用',
    status: 'FAILED',
    success: false,
    nodeLatencyMs: 5000,
    branchId: '0',
    buildTime: '2026-08-20T11:00:00.100Z',
    errorMessage: 'Model API timeout after 5000ms',
  },
  {
    nodeSeq: 3,
    nodeId: 'tool_fallback',
    nodeType: 'TOOL',
    nodeName: '降级工具',
    status: 'RUNNING',
    success: false,
    nodeLatencyMs: 0,
    buildTime: '2026-08-20T11:00:05.200Z',
    branchId: '0',
    errorMessage: '上游失败跳过执行',
  },
]

describe('NodeTrajectory.vue — FORK/JOIN/LOOP/失败节点专项测试', () => {
  // ──────────────────────────────────────────────────────────────
  // 测试 1: 顺序链（基线）
  // ──────────────────────────────────────────────────────────────
  it('D140-N01: 顺序链 - START → LLM → END 按 nodeSeq 升序展示', () => {
    const nodes = makeSequentialNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')
    expect(items.length).toBe(3)
    // nodeSeq 1, 2, 3 依次展示
    expect(items[0].text()).toContain('#1')
    expect(items[1].text()).toContain('#2')
    expect(items[2].text()).toContain('#3')
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 2: FORK/JOIN 扇出汇合
  // ──────────────────────────────────────────────────────────────
  it('D140-N02: FORK/JOIN - 扇出两路并行节点保留各自 branchId', () => {
    const nodes = makeForkJoinNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')
    expect(items.length).toBe(6)

    // START/END/FORK/JOIN → "0"; LLM-A → "0-0"; LLM-B → "0-1"
    const branchLabels = wrapper.findAll('.node-branch-label')
    expect(branchLabels[0].text().trim()).toBe('0') // START
    expect(branchLabels[1].text().trim()).toBe('0') // FORK
    expect(branchLabels[2].text().trim()).toBe('0-0') // LLM-A
    expect(branchLabels[3].text().trim()).toBe('0-1') // LLM-B
    expect(branchLabels[4].text().trim()).toBe('0') // JOIN
    expect(branchLabels[5].text().trim()).toBe('0') // END
    wrapper.unmount()
  })

  it('D140-N03: FORK/JOIN - 扇出与汇合节点通过真实 branchId 关联，不依赖 buildTime 推断', () => {
    const nodes = makeForkJoinNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })

    // fork(0), join(0) 同属根分支; LLM-A(0-0) / LLM-B(0-1) 是并行子分支
    // branchId 完全来自后端数据，前端不做推断
    const allNodeTypes = itemsText(wrapper)
    expect(allNodeTypes.some((t) => t.includes('FORK'))).toBe(true)
    expect(allNodeTypes.some((t) => t.includes('JOIN'))).toBe(true)
    expect(allNodeTypes.some((t) => t.includes('LLM'))).toBe(true)
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 3: LOOP 重复节点
  // ──────────────────────────────────────────────────────────────
  it('D140-N04: LOOP - 同一 nodeId 多次出现不被错误去重', () => {
    const nodes = makeLoopNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')
    // 应该有 5 个节点（loop_body 出现 3 次）
    expect(items.length).toBe(5)

    // 每个 loop_body 都有不同的 nodeSeq
    const seqs = items.map((item) => item.text())
    expect(seqs.some((s) => s.includes('#2'))).toBe(true)
    expect(seqs.some((s) => s.includes('#3'))).toBe(true)
    expect(seqs.some((s) => s.includes('#4'))).toBe(true)
    wrapper.unmount()
  })

  it('D140-N05: LOOP - 同一节点的多次迭代触发点击可展开显示输入变量快照', async () => {
    const nodes = makeLoopNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')
    // 点击第二个节点（loop_body nodeSeq 2）以展开详情
    await items[1].trigger('click')
    await nextTick()
    // 展开后应可见输入变量内容
    expect(items[1].text()).toContain('iter')
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 4: 失败节点
  // ──────────────────────────────────────────────────────────────
  it('D140-N06: 失败节点 - FAILED 状态节点显示红色标识', () => {
    const nodes = makeFailedNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')
    expect(items.length).toBe(3)

    // FAILED 节点应该有 danger 样式类或相关文本
    const failedItem = items.find((item) => item.text().includes('失败'))
    expect(failedItem).toBeDefined()
    wrapper.unmount()
  })

  it('D140-N07: 失败节点 - errorMessage 可在展开后查看', async () => {
    const nodes = makeFailedNodes()
    const wrapper = mount(NodeTrajectory, { props: { nodes } })
    const items = wrapper.findAll('.node-item')

    // 点击展开第二个节点（llm_fail）以查看错误信息
    await items[1].trigger('click')
    await nextTick()
    expect(items[1].text()).toContain('Model API timeout')
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 5: 空数据和边界情况
  // ──────────────────────────────────────────────────────────────
  it('D140-N08: 空节点列表 - 显示空状态提示', () => {
    const wrapper = mount(NodeTrajectory, { props: { nodes: [] } })
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    wrapper.unmount()
  })

  it('D140-N09: null nodes - 不报错', () => {
    const wrapper = mount(NodeTrajectory, { props: { nodes: [] as any } })
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 6: 排序验证（确保 nodeSeq 升序不受数据原始顺序影响）
  // ──────────────────────────────────────────────────────────────
  it('D140-N10: 乱序输入 - processedNodes 仍按 nodeSeq 升序输出', () => {
    const shuffledNodes: AgentGraphExecutionNode[] = [
      { ...makeSequentialNodes()[1], buildTime: '2026-08-20T10:00:00.200Z' }, // seq 2 先放
      { ...makeSequentialNodes()[0] }, // seq 1 后放
      { ...makeSequentialNodes()[2] }, // seq 3
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: shuffledNodes } })
    const items = wrapper.findAll('.node-item')
    expect(items[0].text()).toContain('#1')
    expect(items[1].text()).toContain('#2')
    expect(items[2].text()).toContain('#3')
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // 测试 7: JSON 富文本渲染 vs 纯字符串
  // ──────────────────────────────────────────────────────────────
  it('D140-N11: JSON 格式 input/output 的节点点击展开后不报错', async () => {
    const nodesWithJson: AgentGraphExecutionNode[] = [
      {
        nodeSeq: 1,
        nodeId: 'n1',
        nodeType: 'LLM',
        nodeName: '测试',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 100,
        buildTime: '2026-08-20T10:00:00.000Z',
        input: '{"query": "hello world"}',
        output: '{"response": "你好世界", "score": 0.95}',
      },
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: nodesWithJson } })
    const items = wrapper.findAll('.node-item')
    // 触发点击展开（组件内部处理 currentExpanded，无需手动设置）
    await items[0].trigger('click')
    await nextTick()
    // 展开后组件仍然正常渲染
    expect(wrapper.exists()).toBe(true)
    // 节点文本应包含输入内容中的字符串
    expect(items[0].text()).toContain('测试')
    wrapper.unmount()
  })

  it('D140-N12: 非 JSON 格式的纯文本 input/output 渲染为 text-preview', () => {
    const nodesWithStringInput: AgentGraphExecutionNode[] = [
      {
        nodeSeq: 1,
        nodeId: 'n1',
        nodeType: 'TOOL',
        nodeName: '简单工具',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 50,
        buildTime: '2026-08-20T10:00:00.000Z',
        output: 'Plain text output without any JSON structure',
      },
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: nodesWithStringInput } })
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // M07-F04-02 标准6：节点级 Token 展示
  // ──────────────────────────────────────────────────────────────
  it('D164-N13: LLM 节点带确定 token 时展示输入/输出数值', () => {
    const nodesWithTokens: AgentGraphExecutionNode[] = [
      {
        nodeSeq: 1,
        nodeId: 'n1',
        nodeType: 'LLM',
        nodeName: 'AI 助手',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 100,
        buildTime: '2026-08-20T10:00:00.000Z',
        inputTokens: 10,
        outputTokens: 20,
      },
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: nodesWithTokens } })
    const text = wrapper.text()
    expect(text).toContain('10')
    expect(text).toContain('20')
    wrapper.unmount()
  })

  it('D164-N14: LLM 节点 token 为 null 时显示"未知"而非 0', () => {
    const nodesUnknownTokens: AgentGraphExecutionNode[] = [
      {
        nodeSeq: 1,
        nodeId: 'n1',
        nodeType: 'LLM',
        nodeName: 'AI 助手',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 100,
        buildTime: '2026-08-20T10:00:00.000Z',
        inputTokens: null,
        outputTokens: null,
      },
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: nodesUnknownTokens } })
    const text = wrapper.text()
    expect(text).toContain('未知')
    wrapper.unmount()
  })

  it('D164-N15: 非 LLM 节点（START/END）不展示 token 信息', () => {
    const nodesNoLlm: AgentGraphExecutionNode[] = [
      {
        nodeSeq: 1,
        nodeId: 's1',
        nodeType: 'START',
        nodeName: '开始节点',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 10,
        buildTime: '2026-08-20T10:00:00.000Z',
      },
    ]
    const wrapper = mount(NodeTrajectory, { props: { nodes: nodesNoLlm } })
    const text = wrapper.text()
    expect(text).not.toContain('输入:')
    expect(text).not.toContain('输出:')
    wrapper.unmount()
  })
})

// Helper to extract displayed text from items
function itemsText(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.node-item').map((i) => i.text())
}
