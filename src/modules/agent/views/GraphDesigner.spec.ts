import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

vi.mock('@/adapters/flow-graph', () => ({
  mountFlowGraph: vi.fn(() => ({ exportGraph: vi.fn(), destroy: vi.fn() })),
}))

vi.mock('@/modules/agent/api', () => ({
  executeGraph: vi.fn(),
  getGraphDef: vi.fn(),
  listModelOptions: vi.fn(),
  listToolOptions: vi.fn(),
  publishGraphDef: vi.fn(),
  saveDraftGraph: vi.fn(),
}))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { id: '42' } }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { prompt: vi.fn(), confirm: vi.fn() },
  }
})

import { mountFlowGraph } from '@/adapters/flow-graph'
import type {
  FlowGraphData,
  FlowGraphEvents,
  FlowGraphInstance,
  FlowGraphNode,
} from '@/adapters/flow-graph'
import {
  executeGraph,
  getGraphDef,
  listModelOptions,
  listToolOptions,
  saveDraftGraph,
} from '@/modules/agent/api'
import { ElMessage } from 'element-plus'
import {
  NODE_CONFIG_KEY_INPUT_VAR,
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
} from '@/modules/agent/utils/graphAdapter'
import type { ProcessGraph } from '@/contracts/agent'
import { registerNodePanelDescriptor } from './panels/node-panel-registry'
import GraphDesigner from './GraphDesigner.vue'

const stubs = {
  'el-alert': {
    template:
      '<div class="el-alert" :class="type"><slot/><div class="alert-title">{{ title }}</div></div>',
    props: ['title', 'type', 'closable', 'showIcon'],
  },
  'el-tag': { template: '<span class="el-tag"><slot/></span>', props: ['size', 'type'] },
  'el-button': {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'loading', 'plain', 'link'],
  },
  'el-select': {
    template: '<div class="el-select"><slot/></div>',
    props: ['modelValue', 'placeholder'],
  },
  'el-option': {
    template: '<div class="el-option" :data-value="value" :data-label="label"/>',
    props: ['label', 'value'],
  },
  'el-input': {
    template:
      '<textarea v-if="type===\'textarea\'" class="el-input" :data-value="String(modelValue ?? \'\')" :data-placeholder="placeholder" :data-type="type" @change="$emit(\'change\', $event.target.value)"></textarea><input v-else class="el-input" :data-value="String(modelValue ?? \'\')" :data-placeholder="placeholder" @change="$emit(\'change\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'size', 'type'],
    emits: ['change'],
  },
  'el-empty': {
    template: '<div class="el-empty">{{ description }}</div>',
    props: ['description', 'imageSize'],
  },
}

const mockGraph: ProcessGraph = {
  graphKey: 'agent_key123',
  name: '客服分流',
  version: 2,
  canvas: {},
  elements: [
    { id: 'start-1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
    {
      id: 'llm-1',
      kind: 'node',
      type: 'LLM',
      config: { agentModelConfigId: 7 },
      style: { x: 200, y: 0 },
    },
    {
      id: 'tool-1',
      kind: 'node',
      type: 'TOOL',
      config: { toolName: 'http_echo' },
      style: { x: 400, y: 0 },
    },
    { id: 'cond-1', kind: 'node', type: 'CONDITION', style: { x: 600, y: 0 } },
    { id: 'end-1', kind: 'node', type: 'END', style: { x: 800, y: 0 } },
    { id: 'edge-1', kind: 'edge', source: 'start-1', target: 'llm-1' },
    { id: 'edge-2', kind: 'edge', source: 'llm-1', target: 'tool-1' },
    { id: 'edge-3', kind: 'edge', source: 'tool-1', target: 'cond-1' },
    { id: 'edge-4', kind: 'edge', source: 'cond-1', target: 'end-1', config: { keyword: '加急' } },
    { id: 'edge-5', kind: 'edge', source: 'cond-1', target: 'end-1' },
  ],
}

/** 含 LOOP/FORK/JOIN 新类型节点的图（LOOP 带 maxIterations 契约键） */
const mockLoopGraph: ProcessGraph = {
  graphKey: 'agent_key789',
  name: '循环并行图',
  version: 1,
  canvas: {},
  elements: [
    { id: 'start-1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
    {
      id: 'loop-1',
      kind: 'node',
      type: 'LOOP',
      config: { maxIterations: 3 },
      style: { x: 200, y: 0 },
    },
    { id: 'fork-1', kind: 'node', type: 'FORK', style: { x: 400, y: 0 } },
    { id: 'join-1', kind: 'node', type: 'JOIN', style: { x: 600, y: 0 } },
    { id: 'end-1', kind: 'node', type: 'END', style: { x: 800, y: 0 } },
    { id: 'edge-1', kind: 'edge', source: 'start-1', target: 'loop-1' },
    { id: 'edge-2', kind: 'edge', source: 'loop-1', target: 'fork-1' },
    { id: 'edge-3', kind: 'edge', source: 'fork-1', target: 'join-1' },
    { id: 'edge-4', kind: 'edge', source: 'join-1', target: 'end-1' },
  ],
}

/** 带变量名契约键的图（LLM inputVar/outputVar；TOOL 仅 inputVar） */
const mockVarGraph: ProcessGraph = {
  graphKey: 'agent_key456',
  name: '多变量图',
  version: 1,
  canvas: {},
  elements: [
    { id: 'start-1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
    {
      id: 'llm-1',
      kind: 'node',
      type: 'LLM',
      config: { agentModelConfigId: 7, inputVar: 'raw', outputVar: 'summary' },
      style: { x: 200, y: 0 },
    },
    {
      id: 'tool-1',
      kind: 'node',
      type: 'TOOL',
      config: { toolName: 'http_echo', inputVar: 'summary' },
      style: { x: 400, y: 0 },
    },
    { id: 'end-1', kind: 'node', type: 'END', style: { x: 600, y: 0 } },
    { id: 'edge-1', kind: 'edge', source: 'start-1', target: 'llm-1' },
    { id: 'edge-2', kind: 'edge', source: 'llm-1', target: 'tool-1' },
    { id: 'edge-3', kind: 'edge', source: 'tool-1', target: 'end-1' },
  ],
}

function mountDesigner() {
  return mount(GraphDesigner, {
    global: { stubs, directives: { loading: {} } },
  })
}

/** 取最近一次挂载的（容器, 数据, 事件） */
function lastMountCall() {
  const calls = vi.mocked(mountFlowGraph).mock.calls
  return calls[calls.length - 1] as [HTMLElement, FlowGraphData, FlowGraphEvents]
}

async function mountLoaded() {
  return mountLoadedWith(mockGraph)
}

async function mountLoadedWith(graph: ProcessGraph) {
  vi.mocked(getGraphDef).mockResolvedValueOnce(graph)
  vi.mocked(listModelOptions).mockResolvedValueOnce([
    { id: 1, name: 'OpenAI 主配置', modelName: 'gpt-4o', protocolType: 'openai', enabled: true },
    { id: 2, name: 'Ollama 本地', modelName: 'qwen2.5', protocolType: 'ollama', enabled: true },
  ])
  vi.mocked(listToolOptions).mockResolvedValueOnce([
    { toolName: 'http_echo', description: 'echo 工具', source: 'internal' },
    { toolName: 'weather_query', description: '天气查询', source: 'external' },
  ])
  const wrapper = mountDesigner()
  await nextTick()
  await nextTick()
  return wrapper
}

function nodeById(data: FlowGraphData, id: string): FlowGraphNode {
  return data.nodes.find((n) => n.id === id)!
}

describe('GraphDesigner.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('加载：getGraphDef(42) → elementsToFlowGraphData → mountFlowGraph 挂载画布', async () => {
    const wrapper = await mountLoaded()
    expect(getGraphDef).toHaveBeenCalledWith(42)
    expect(mountFlowGraph).toHaveBeenCalledTimes(1)

    const [, data] = lastMountCall()
    expect(data.nodes.map((n) => n.type)).toEqual(['START', 'LLM', 'TOOL', 'CONDITION', 'END'])
    // 坐标自 style.x/style.y 转换
    expect(data.nodes[1].position).toEqual({ x: 200, y: 0 })
    // LLM 业务配置回填 data
    expect(data.nodes[1].data).toEqual({ agentModelConfigId: 7 })
    // 条件边关键词 → edge.label
    const edge4 = data.edges.find((e) => e.id === 'edge-4')
    expect(edge4?.label).toBe('加急')
    // 无关键词边 label 为空
    expect(data.edges.find((e) => e.id === 'edge-5')?.label).toBeUndefined()
    wrapper.unmount()
  })

  it('属性面板按节点类型切换：LLM 显示模型下拉、TOOL 显示工具下拉（标注来源）', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()

    // 点击 LLM 节点
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()
    expect(wrapper.findAll('.el-select')).toHaveLength(1)
    const llmOptions = wrapper.findAll('.el-option').map((o) => ({
      value: o.attributes('data-value'),
      label: o.attributes('data-label'),
    }))
    expect(llmOptions).toEqual([
      { value: '1', label: 'OpenAI 主配置（gpt-4o）' },
      { value: '2', label: 'Ollama 本地（qwen2.5）' },
    ])

    // 点击 TOOL 节点：合并下拉，value=toolName 精确值，label 标注来源
    events.onNodeClick?.(nodeById(data, 'tool-1'))
    await nextTick()
    const toolOptions = wrapper.findAll('.el-option').map((o) => ({
      value: o.attributes('data-value'),
      label: o.attributes('data-label'),
    }))
    expect(toolOptions).toEqual([
      { value: 'http_echo', label: 'http_echo（内部）' },
      { value: 'weather_query', label: 'weather_query（外部）' },
    ])
    wrapper.unmount()
  })

  it('属性面板按节点类型切换：CONDITION 列出出边关键词输入框（写 edge.label）', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()

    // START/END 无可编辑项
    events.onNodeClick?.(nodeById(data, 'start-1'))
    await nextTick()
    expect(wrapper.text()).toContain('开始节点无可编辑属性')

    // CONDITION：出边逐条显示关键词输入框（属性面板内，排除执行面板输入框）
    events.onNodeClick?.(nodeById(data, 'cond-1'))
    await nextTick()
    const inputs = wrapper
      .find('.property-panel')
      .findAll('.el-input')
      .map((i) => i.attributes('data-value'))
    expect(inputs).toEqual(['加急', ''])
    wrapper.unmount()
  })

  it('保存草稿：flowGraphDataToElements 组装 ProcessGraph 参数正确', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(saveDraftGraph).mockResolvedValueOnce(undefined)

    const vm = wrapper.vm as unknown as { handleSaveDraft: () => Promise<void> }
    await vm.handleSaveDraft()

    expect(saveDraftGraph).toHaveBeenCalledTimes(1)
    const [id, graph] = vi.mocked(saveDraftGraph).mock.calls[0] as [number, ProcessGraph]
    expect(id).toBe(42)
    expect(graph.graphKey).toBe('agent_key123')
    expect(graph.name).toBe('客服分流')
    expect(graph.version).toBe(2)
    expect(graph.canvas).toEqual({})
    // 往返转换：节点 config/style 回填、边关键词回填 config.keyword
    const llmEl = graph.elements.find((el) => el.id === 'llm-1')
    expect(llmEl).toMatchObject({
      kind: 'node',
      type: 'LLM',
      config: { agentModelConfigId: 7 },
      style: { x: 200, y: 0 },
    })
    const edge4 = graph.elements.find((el) => el.id === 'edge-4')
    expect(edge4?.config).toEqual({ keyword: '加急' })
    const edge5 = graph.elements.find((el) => el.id === 'edge-5')
    expect(edge5?.config).toBeUndefined()
    wrapper.unmount()
  })

  it('执行成功：executeGraph 返回 success=true，展示 output 与耗时', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: true,
      output: '您好，请问需要什么帮助？',
      latencyMs: 1234,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
    }
    vm.executeInput = '你好'
    await vm.handleExecute()

    expect(executeGraph).toHaveBeenCalledWith(42, '你好')
    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('执行成功')
    expect(html).toContain('输出：您好，请问需要什么帮助？')
    expect(html).toContain('耗时 1234ms')
    wrapper.unmount()
  })

  it('执行失败：success=false 展示 errorMessage（不上抛）', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: false,
      output: undefined,
      errorMessage: '条件分支无匹配且无默认边: cond-1',
      latencyMs: 3,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
    }
    vm.executeInput = '随便什么'
    await vm.handleExecute()

    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('执行失败')
    expect(html).toContain('原因：条件分支无匹配且无默认边: cond-1')
    expect(html).toContain('耗时 3ms')
    wrapper.unmount()
  })

  it('卸载时销毁画布实例', async () => {
    const wrapper = await mountLoaded()
    const instance = vi.mocked(mountFlowGraph).mock.results[0].value as FlowGraphInstance
    wrapper.unmount()
    expect(instance.destroy).toHaveBeenCalledTimes(1)
  })

  it('变量名输入项：LLM 属性面板渲染 2 textarea + 2 变量输入框；TOOL 属性面板渲染 2 变量输入框，回填 data 既有值', async () => {
    const wrapper = await mountLoadedWith(mockVarGraph)
    const [, data, events] = lastMountCall()

    // LLM：2 prompt textarea + 2 var name input，共 4 个 .el-input
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()
    const llmInputs = wrapper
      .find('.property-panel')
      .findAll('.el-input')
      .map((i) => ({
        value: i.attributes('data-value'),
        placeholder: i.attributes('data-placeholder'),
        type: i.attributes('data-type'),
      }))
    expect(llmInputs).toHaveLength(4)
    // prompt textarea（data-type="textarea"）
    expect(llmInputs[0].type).toBe('textarea')
    expect(llmInputs[1].type).toBe('textarea')
    // 变量名 input（inputVar/outputVar 回填）
    expect(llmInputs[2].value).toBe('raw')
    expect(llmInputs[3].value).toBe('summary')
    expect(llmInputs[2].placeholder).toBe('留空 = 默认变量 input')
    expect(llmInputs[3].placeholder).toBe('留空 = 默认变量 input')

    // TOOL：仅 inputVar 回填，outputVar 留空
    events.onNodeClick?.(nodeById(data, 'tool-1'))
    await nextTick()
    const toolInputs = wrapper
      .find('.property-panel')
      .findAll('.el-input')
      .map((i) => i.attributes('data-value'))
    expect(toolInputs).toEqual(['summary', ''])
    wrapper.unmount()
  })

  it('LLM 变量名输入写回：经 handleVarNameChange 落 data.inputVar/outputVar（合并写不丢既有键）', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()

    // indices: 0=systemPrompt textarea, 1=userPromptTemplate textarea, 2=inputVar, 3=outputVar
    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[2].element as HTMLInputElement).value = 'raw'
    await inputs[2].trigger('change')
    await nextTick()
    ;(inputs[3].element as HTMLInputElement).value = 'summary'
    await inputs[3].trigger('change')
    await nextTick()

    expect(nodeById(data, 'llm-1').data).toEqual({
      agentModelConfigId: 7,
      inputVar: 'raw',
      outputVar: 'summary',
    })
    wrapper.unmount()
  })

  it('变量名留空（含空白）：移除 data 键，不落 config（= 默认变量零迁移语义）', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()

    // indices: 0=systemPrompt textarea, 1=userPromptTemplate textarea, 2=inputVar, 3=outputVar
    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[2].element as HTMLInputElement).value = 'raw'
    await inputs[2].trigger('change')
    await nextTick()
    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_INPUT_VAR]).toBe('raw')

    // 清空为空白串 → 键被移除
    ;(inputs[2].element as HTMLInputElement).value = '   '
    await inputs[2].trigger('change')
    await nextTick()
    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_INPUT_VAR]).toBeUndefined()
    expect(Object.keys(nodeById(data, 'llm-1').data ?? {})).not.toContain(NODE_CONFIG_KEY_INPUT_VAR)
    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_OUTPUT_VAR]).toBeUndefined()
    wrapper.unmount()
  })

  it('TOOL 变量名输入写回：落 data.inputVar/outputVar，保存草稿后 config 含精确契约键往返', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'tool-1'))
    await nextTick()

    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[0].element as HTMLInputElement).value = 'final'
    await inputs[0].trigger('change')
    await nextTick()
    ;(inputs[1].element as HTMLInputElement).value = 'final_out'
    await inputs[1].trigger('change')
    await nextTick()
    expect(nodeById(data, 'tool-1').data).toEqual({
      toolName: 'http_echo',
      inputVar: 'final',
      outputVar: 'final_out',
    })

    // 保存草稿：flowGraphDataToElements 整包往返，config 含 inputVar/outputVar 契约键
    vi.mocked(saveDraftGraph).mockResolvedValueOnce(undefined)
    const vm = wrapper.vm as unknown as { handleSaveDraft: () => Promise<void> }
    await vm.handleSaveDraft()

    const [, graph] = vi.mocked(saveDraftGraph).mock.calls[0] as [number, ProcessGraph]
    const toolEl = graph.elements.find((el) => el.id === 'tool-1')
    expect(toolEl?.config).toEqual({
      toolName: 'http_echo',
      inputVar: 'final',
      outputVar: 'final_out',
    })
    wrapper.unmount()
  })

  it('色板渲染 LOOP/FORK/JOIN 新类型按钮，点击后画布新增对应类型节点', async () => {
    const wrapper = await mountLoaded()
    const paletteTexts = wrapper.findAll('.palette-item').map((b) => b.text())
    expect(paletteTexts).toEqual([
      '开始',
      '结束',
      'LLM 调用',
      '工具调用',
      '条件分支',
      '循环',
      '并行分支',
      '汇合',
    ])

    const loopBtn = wrapper.findAll('.palette-item').find((b) => b.text() === '循环')!
    await loopBtn.trigger('click')
    const [, data] = lastMountCall()
    expect(data.nodes[data.nodes.length - 1].type).toBe('LOOP')
    wrapper.unmount()
  })

  it('LOOP 节点选中：属性面板显示 maxIterations 输入框，回填既有值且可编辑写回', async () => {
    const wrapper = await mountLoadedWith(mockLoopGraph)
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'loop-1'))
    await nextTick()

    const input = wrapper.find('.property-panel').find('.el-input')
    expect(input.attributes('data-value')).toBe('3')
    ;(input.element as HTMLInputElement).value = '5'
    await input.trigger('change')
    await nextTick()
    expect(nodeById(data, 'loop-1').data?.[NODE_CONFIG_KEY_MAX_ITERATIONS]).toBe(5)
    wrapper.unmount()
  })

  it('LOOP 节点：maxIterations 空值删键；<1 提示且不写入', async () => {
    const wrapper = await mountLoadedWith(mockLoopGraph)
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'loop-1'))
    await nextTick()

    const input = wrapper.find('.property-panel').find('.el-input')
    // 空值 → 删键（config 不携带，缺省后端默认 10）
    ;(input.element as HTMLInputElement).value = ''
    await input.trigger('change')
    await nextTick()
    expect(nodeById(data, 'loop-1').data?.[NODE_CONFIG_KEY_MAX_ITERATIONS]).toBeUndefined()
    expect(Object.keys(nodeById(data, 'loop-1').data ?? {})).not.toContain(
      NODE_CONFIG_KEY_MAX_ITERATIONS,
    )

    // <1 → 警告且不写入（与后端校验口径一致）
    ;(input.element as HTMLInputElement).value = '0'
    await input.trigger('change')
    await nextTick()
    expect(ElMessage.warning).toHaveBeenCalledWith('LOOP 节点 maxIterations 必须 ≥ 1')
    expect(nodeById(data, 'loop-1').data?.[NODE_CONFIG_KEY_MAX_ITERATIONS]).toBeUndefined()
    wrapper.unmount()
  })

  it('可插拔性：测试型注册新节点面板（PROBE），GraphDesigner 消费方零改动即渲染', async () => {
    registerNodePanelDescriptor({
      type: 'PROBE',
      label: '探针',
      component: defineComponent({
        name: 'ProbePanel',
        template: '<div data-testid="probe-panel">探针面板内容</div>',
      }),
    })
    const wrapper = await mountLoadedWith({
      ...mockGraph,
      elements: [
        ...mockGraph.elements,
        { id: 'probe-1', kind: 'node', type: 'PROBE', style: { x: 1000, y: 0 } },
      ],
    })
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'probe-1'))
    await nextTick()
    // 消费方（GraphDesigner）零 if/switch：注册描述符后属性面板直接挂载新面板
    expect(wrapper.find('.property-panel').find('[data-testid="probe-panel"]').exists()).toBe(true)
    expect(wrapper.find('.property-panel').text()).toContain('探针面板内容')
    wrapper.unmount()
  })

  it('FORK/JOIN 节点选中：属性面板显示静态说明文本，无 config 编辑项', async () => {
    const wrapper = await mountLoadedWith(mockLoopGraph)
    const [, data, events] = lastMountCall()

    events.onNodeClick?.(nodeById(data, 'fork-1'))
    await nextTick()
    const forkPanel = wrapper.find('.property-panel')
    expect(forkPanel.text()).toContain('出边数 = 并行分支数（≥2）')
    expect(forkPanel.findAll('.el-input')).toHaveLength(0)

    events.onNodeClick?.(nodeById(data, 'join-1'))
    await nextTick()
    const joinPanel = wrapper.find('.property-panel')
    expect(joinPanel.text()).toContain('入边数 = 汇合分支数（≥2）')
    expect(joinPanel.findAll('.el-input')).toHaveLength(0)
    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────
  // Step12：执行直达详情（补证 A）
  // ──────────────────────────────────────────────────────────────
  it('D140-A01: 执行成功含 executionId — 查看详情按钮出现在结果区域', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: true,
      output: '您好，请问需要什么帮助？',
      latencyMs: 1234,
      executionId: 90001,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
    }
    vm.executeInput = '你好'
    await vm.handleExecute()

    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('执行成功')
    expect(html).toContain('查看详情')
    expect(html).toContain('耗时 1234ms')
    wrapper.unmount()
  })

  it('D140-A02: 执行失败含 executionId — 查看详情按钮同样出现', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: false,
      errorMessage: '模型调用超时',
      latencyMs: 5000,
      executionId: 90002,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
    }
    vm.executeInput = '测试'
    await vm.handleExecute()

    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('执行失败')
    expect(html).toContain('查看详情')
    wrapper.unmount()
  })

  it('D140-A03: 点击查看详情 — router.push 跳转到 /agent/executions/detail/:executionId', async () => {
    const wrapper = await mountLoaded()
    const testExecutionId = 90003
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: true,
      output: 'done',
      latencyMs: 500,
      executionId: testExecutionId,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
      handleViewExecutionDetail: () => void
    }
    vm.executeInput = 'test'
    await vm.handleExecute()
    await nextTick()

    push.mockClear()
    vm.handleViewExecutionDetail()
    await nextTick()

    expect(push).toHaveBeenCalledWith(`/agent/executions/detail/${testExecutionId}`)
    wrapper.unmount()
  })

  it('D140-A04: 执行成功但无 executionId — 点击查看详情不跳转，仅警告提示', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: true,
      output: 'done',
      latencyMs: 500,
      // 不含 executionId
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
      handleViewExecutionDetail: () => void
    }
    vm.executeInput = 'test'
    await vm.handleExecute()
    await nextTick()

    push.mockClear()
    vm.handleViewExecutionDetail()
    await nextTick()

    expect(push).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('暂无可跳转的执行记录')
    wrapper.unmount()
  })

  it('LLM 属性面板：systemPrompt / userPromptTemplate textarea 回填 data 既有值，placeholder 与 hint 文案正确', async () => {
    const wrapper = await mountLoadedWith({
      ...mockGraph,
      elements: mockGraph.elements.map((el) =>
        el.id === 'llm-1'
          ? {
              ...el,
              config: {
                ...el.config,
                [NODE_CONFIG_KEY_SYSTEM_PROMPT]: '你是客服助手',
                [NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE]: '请根据以下内容生成摘要：{{input}}',
              },
            }
          : el,
      ),
    })
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()

    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    // 0=systemPrompt textarea, 1=userPromptTemplate textarea
    expect(inputs[0].attributes('data-type')).toBe('textarea')
    expect(inputs[0].attributes('data-value')).toBe('你是客服助手')
    expect(inputs[0].attributes('data-placeholder')).toBe('留空则不注入系统消息')
    expect(inputs[1].attributes('data-type')).toBe('textarea')
    expect(inputs[1].attributes('data-value')).toBe('请根据以下内容生成摘要：{{input}}')
    expect(inputs[1].attributes('data-placeholder')).toContain('请根据以下内容生成摘要')
    // hint 文案：{{variableName}} 提示与未定义变量失败提示
    const text = wrapper.find('.property-panel').text()
    expect(text).toContain('定义模型在该节点的角色')
    expect(text).toContain('{{variableName}}')
    expect(text).toContain('引用未定义变量将导致执行失败')
    wrapper.unmount()
  })

  it('LLM 属性面板：编辑 systemPrompt textarea → updateNodeData 落 data.systemPrompt（合并写不丢既有键）', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()

    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[0].element as HTMLTextAreaElement).value = '你是客服助手'
    await inputs[0].trigger('change')
    await nextTick()

    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_SYSTEM_PROMPT]).toBe('你是客服助手')
    // 既有 agentModelConfigId 不丢
    expect(nodeById(data, 'llm-1').data?.agentModelConfigId).toBe(7)
    wrapper.unmount()
  })

  it('LLM 属性面板：清空 systemPrompt textarea → data 键被删除（空白不落键）', async () => {
    const wrapper = await mountLoadedWith({
      ...mockGraph,
      elements: mockGraph.elements.map((el) =>
        el.id === 'llm-1'
          ? { ...el, config: { ...el.config, [NODE_CONFIG_KEY_SYSTEM_PROMPT]: '原有值' } }
          : el,
      ),
    })
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()
    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_SYSTEM_PROMPT]).toBe('原有值')

    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[0].element as HTMLTextAreaElement).value = ''
    await inputs[0].trigger('change')
    await nextTick()

    expect(nodeById(data, 'llm-1').data?.[NODE_CONFIG_KEY_SYSTEM_PROMPT]).toBeUndefined()
    expect(Object.keys(nodeById(data, 'llm-1').data ?? {})).not.toContain(
      NODE_CONFIG_KEY_SYSTEM_PROMPT,
    )
    wrapper.unmount()
  })

  it('LLM 属性面板：保存草稿后 systemPrompt/userPromptTemplate 往返 config 保留', async () => {
    const wrapper = await mountLoaded()
    const [, data, events] = lastMountCall()
    events.onNodeClick?.(nodeById(data, 'llm-1'))
    await nextTick()

    const inputs = wrapper.find('.property-panel').findAll('.el-input')
    ;(inputs[0].element as HTMLTextAreaElement).value = '你是客服助手'
    await inputs[0].trigger('change')
    await nextTick()
    ;(inputs[1].element as HTMLTextAreaElement).value = '请根据以下内容生成摘要：{{input}}'
    await inputs[1].trigger('change')
    await nextTick()

    vi.mocked(saveDraftGraph).mockResolvedValueOnce(undefined)
    const vm = wrapper.vm as unknown as { handleSaveDraft: () => Promise<void> }
    await vm.handleSaveDraft()

    const [, graph] = vi.mocked(saveDraftGraph).mock.calls[0] as [number, ProcessGraph]
    const llmEl = graph.elements.find((el) => el.id === 'llm-1')
    expect(llmEl?.config).toMatchObject({
      agentModelConfigId: 7,
      [NODE_CONFIG_KEY_SYSTEM_PROMPT]: '你是客服助手',
      [NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE]: '请根据以下内容生成摘要：{{input}}',
    })
    wrapper.unmount()
  })

  it('D140-A05: 执行失败且含 executionId — 查看详情按钮出现并可导航至详情页（失败与成功双链闭合）', async () => {
    const wrapper = await mountLoaded()
    vi.mocked(executeGraph).mockResolvedValueOnce({
      success: false,
      errorMessage: '模型调用超时',
      latencyMs: 5000,
      executionId: 90004,
    })

    const vm = wrapper.vm as unknown as {
      executeInput: string
      handleExecute: () => Promise<void>
      handleViewExecutionDetail: () => void
    }
    vm.executeInput = '测试'
    await vm.handleExecute()

    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('执行失败')
    expect(html).toContain('查看详情')

    push.mockClear()
    vm.handleViewExecutionDetail()
    await nextTick()

    expect(push).toHaveBeenCalledWith('/agent/executions/detail/90004')
    wrapper.unmount()
  })
})
