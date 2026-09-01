import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock API 层
vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: vi.fn(),
  getProcessDefGraph: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

// Mock bpmn adapter（vi.hoisted 确保变量在 hoist 时已初始化）
const { mockDestroy, mockFitViewport } = vi.hoisted(() => ({
  mockDestroy: vi.fn(),
  mockFitViewport: vi.fn(),
}))
vi.mock('@/adapters/bpmn', () => ({
  mountBpmnViewer: vi.fn().mockResolvedValue({
    destroy: mockDestroy,
    fitViewport: mockFitViewport,
    highlight: vi.fn(),
    clearHighlight: vi.fn(),
  }),
}))

import { pageProcessDefs, getProcessDefGraph } from '@/modules/workflow/api'
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

// VM 类型辅助
interface Vm {
  viewerVisible: boolean
  viewerLoading: boolean
  viewerError: string
  currentDefName: string
  openViewer: (row: ProcessDef) => Promise<void>
  closeViewer: () => void
  list: ProcessDef[]
}

// ═══════════════════════════════════════

describe('ProcessDefList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPageResult()
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

  // ─── 4. openViewer 调用 getProcessDefGraph ───

  it('openViewer calls getProcessDefGraph with row id', async () => {
    vi.mocked(getProcessDefGraph).mockResolvedValueOnce('<xml/>')

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await nextTick()

    expect(getProcessDefGraph).toHaveBeenCalledWith(PUBLISHED_DEF.id)
  })

  // ─── 5. getProcessDefGraph 成功后 mountBpmnViewer 被调用 ───

  it('calls mountBpmnViewer after API resolves', async () => {
    vi.mocked(getProcessDefGraph).mockResolvedValueOnce('<xml>test</xml>')
    const { mountBpmnViewer } = await import('@/adapters/bpmn')

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    // wait for getProcessDefGraph → mountBpmnViewer
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(mountBpmnViewer).toHaveBeenCalledTimes(1)
    expect(mountBpmnViewer).toHaveBeenCalledWith(expect.any(Element), '<xml>test</xml>')
  })

  // ─── 6. fitViewport 被调用 ───

  it('calls fitViewport after mountBpmnViewer resolves', async () => {
    vi.mocked(getProcessDefGraph).mockResolvedValueOnce('<xml/>')

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    await nextTick()

    expect(mockFitViewport).toHaveBeenCalledTimes(1)
  })

  // ─── 7. API 错误时设置 viewerError ───

  it('sets viewerError on API failure', async () => {
    vi.mocked(getProcessDefGraph).mockRejectedValueOnce({ msg: '流程定义未发布' })

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(vm.viewerError).toBe('流程定义未发布')
  })

  // ─── 8. 普通 Error 的 viewerError fallback ───

  it('sets viewerError from Error.message fallback', async () => {
    vi.mocked(getProcessDefGraph).mockRejectedValueOnce(new Error('网络错误'))

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(vm.viewerError).toBe('网络错误')
  })

  // ─── 9. closeViewer 调用 destroy 并重置状态 ───

  it('closeViewer calls destroy and resets state', async () => {
    vi.mocked(getProcessDefGraph).mockResolvedValueOnce('<xml/>')

    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as Vm
    await vm.openViewer(PUBLISHED_DEF)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    vm.closeViewer()
    await nextTick()

    expect(mockDestroy).toHaveBeenCalledTimes(1)
    expect(vm.viewerVisible).toBe(false)
    expect(vm.viewerError).toBe('')
    expect(vm.viewerLoading).toBe(false)
  })

  // ─── 10. viewerLoading 在 finally 中被置 false ───

  it('viewerLoading is false after openViewer completes', async () => {
    vi.mocked(getProcessDefGraph).mockResolvedValueOnce('<xml/>')

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
