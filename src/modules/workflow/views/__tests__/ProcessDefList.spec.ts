import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock API 层：I3 起查看流程图消费已保存 ProcessGraph（自研渲染内核），不再使用 BPMN XML
vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: vi.fn(),
  getProcessDefDefinition: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

import { pageProcessDefs, getProcessDefDefinition } from '@/modules/workflow/api'
import ProcessDefList from '@/modules/workflow/views/ProcessDefList.vue'
import type { ProcessDef } from '@/contracts/bpm'

// ─── 桩组件 ───

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': {
    template: '<div><slot v-for="item in data" :row="item" :$index="0" /></div>',
    props: ['data'],
  },
  'el-table-column': {
    template:
      "<div><slot :row=\"row || { status: 'PUBLISHED', id: 0, processKey: '', name: '', formKey: '', defVersion: 0, createTime: '', updateTime: '' }\" /></div>",
  },
  'el-button': {
    template: '<button :disabled="disabled"><slot/></button>',
    props: ['disabled'],
  },
  'el-tag': { template: '<span><slot/></span>', props: ['type', 'size'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width'],
  },
  'el-result': {
    template: '<div v-if="title" class="el-result">{{ title }} {{ subTitle }}</div>',
    props: ['icon', 'title', 'subTitle'],
  },
  // 自研渲染内核：行为纯函数化，测试只验证视图消费的是 ProcessGraph 而非 BPMN XML
  ProcessGraphView: {
    template: '<div class="pg-view-stub" />',
    props: ['graph', 'trace', 'height'],
  },
}

// ─── 造数据 ───

const PUBLISHED_DEF: ProcessDef = {
  id: 1,
  processKey: 'leave',
  name: '请假流程',
  formKey: 'form_001',
  defVersion: 1,
  status: 'PUBLISHED',
  createTime: '2026-01-01',
  updateTime: '2026-01-02',
}

const DRAFT_DEF: ProcessDef = {
  id: 2,
  processKey: 'expense',
  name: '报销流程',
  formKey: '',
  defVersion: 2,
  status: 'DRAFT',
  createTime: '2026-01-01',
  updateTime: '2026-01-01',
}

function mockPageResult(defs: ProcessDef[] = [PUBLISHED_DEF, DRAFT_DEF]) {
  vi.mocked(pageProcessDefs).mockResolvedValue({
    list: defs,
    total: defs.length,
    pageNum: 1,
    pageSize: 10,
  })
}

function mockDefinition() {
  vi.mocked(getProcessDefDefinition).mockResolvedValue({
    processKey: 'leave',
    name: '请假流程',
    formKey: 'form_001',
    version: 1,
    contractVersion: 2,
    elements: [
      { id: 'node_start', kind: 'node' as const, type: 'START', x: 100, y: 300, config: {} },
      { id: 'node_end', kind: 'node' as const, type: 'END', x: 700, y: 300, config: {} },
      { id: 'edge_1', kind: 'edge' as const, source: 'node_start', target: 'node_end' },
    ] as import('@/contracts/process-graph').ProcessGraphElement[],
    canvas: {},
  })
}

// VM 类型辅助
interface Vm {
  viewerVisible: boolean
  viewerLoading: boolean
  viewerError: string
  currentDefName: string
  openViewer: (row: ProcessDef) => Promise<void>
  closeViewer: () => void
  viewerGraph: import('@/contracts/process-graph').ProcessGraphDocument | null
  list: ProcessDef[]
}

// ═══════════════════════════════════════

describe('ProcessDefList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPageResult()
    mockDefinition()
  })

  // ─── 1. onMounted 调用 pageProcessDefs ───

  it('calls pageProcessDefs on mount', async () => {
    mount(ProcessDefList, { global: { stubs } })
    await nextTick()

    expect(pageProcessDefs).toHaveBeenCalledTimes(1)
    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
  })

  // ─── 2. 列表数据渲染 ───

  it('populates list from API result', async () => {
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.list).toHaveLength(2)
    expect(vm.list[0].name).toBe('请假流程')
    expect(vm.list[1].name).toBe('报销流程')
  })

  // ─── 3. openViewer 设置对话框状态 ───

  it('openViewer sets viewer state correctly', async () => {
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.viewerVisible).toBe(false)

    vm.openViewer(PUBLISHED_DEF)
    expect(vm.viewerVisible).toBe(true)
    expect(vm.currentDefName).toBe('请假流程')
    expect(vm.viewerLoading).toBe(true)
    expect(vm.viewerError).toBe('')
  })

  // ─── 4. openViewer 消费已保存 ProcessGraph ───

  it('openViewer consumes saved ProcessGraph via getProcessDefDefinition', async () => {
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await nextTick()
    await nextTick()

    expect(getProcessDefDefinition).toHaveBeenCalledWith(PUBLISHED_DEF.id)
    expect(vm.viewerGraph).not.toBeNull()
    expect(vm.viewerGraph?.contractVersion).toBe(2)
    expect(vm.viewerGraph?.elements).toHaveLength(3)
    // 渲染视图拿到的是图数据（而非 BPMN XML 字符串）
    const rendered = wrapper.find('.pg-view-stub')
    expect(rendered.exists()).toBe(true)
  })

  // ─── 5. fetch error 路径 ───

  it('sets viewerError on definition load failure', async () => {
    vi.mocked(getProcessDefDefinition).mockRejectedValueOnce({ msg: '流程定义不存在' })

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(vm.viewerError).toBe('流程定义不存在')
  })

  it('sets viewerError from Error.message fallback', async () => {
    vi.mocked(getProcessDefDefinition).mockRejectedValueOnce(new Error('网络错误'))

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(vm.viewerError).toBe('网络错误')
  })

  // ─── 6. closeViewer 重置状态 ───

  it('closeViewer resets state', async () => {
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await nextTick()
    await nextTick()

    vm.closeViewer()
    await nextTick()

    expect(vm.viewerVisible).toBe(false)
    expect(vm.viewerError).toBe('')
    expect(vm.viewerLoading).toBe(false)
    expect(vm.viewerGraph).toBeNull()
  })

  // ─── 7. viewerLoading 在 finally 中被置 false ───

  it('viewerLoading is false after openViewer completes', async () => {
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.viewerLoading).toBe(false)

    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(vm.viewerLoading).toBe(false)
  })
})
