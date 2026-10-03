import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

vi.mock('@/modules/workflow/api/resource-ops')
vi.mock('@/foundation/permission', () => ({
  hasPerm: vi.fn(() => false),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import {
  getBacklogSummary,
  getBacklogCommands,
  getResourceRejects,
} from '@/modules/workflow/api/resource-ops'
import ResourceBacklogConsole from '@/modules/workflow/views/ResourceBacklogConsole.vue'

function summaryFixture(): Record<string, unknown> {
  return {
    generatedAt: '2026-10-03T10:00:00',
    windowNote: '汇总为当前时点全量口径',
    completionPointNote: '完成点口径：命令完成 / 流程已启动 / 目标动作完成为不同完成点',
    totalCommandsOpen: 42,
    incompleteUnits: 100,
    commandsByStatus: [
      { status: 'PENDING', cnt: 30 },
      { status: 'PROCESSING', cnt: 12 },
      { status: 'FAILED', cnt: 3 },
    ],
    commandsByClass: [
      { resource_class: 'PROD', cnt: 40 },
      { resource_class: 'BULK', cnt: 2 },
    ],
    engineTargets: { pendingJobs: 7, deadLetterJobs: 1 },
    batchPendingItems: 88,
    usageCounters: { 'GLOBAL|0|TOTAL': 100, 'GLOBAL|0|SHARED': 100 },
    factBySegment: { SHARED: 100 },
    countersConsistentWithFacts: true,
  }
}

const ROW_KEY = Symbol('stubRow')
const ROW_INDEX_KEY = Symbol('stubRowIndex')

// eslint-disable-next-line vue/one-component-per-file -- 测试型行上下文 stub
const StubTableRow = defineComponent({
  provide() {
    return { [ROW_KEY]: this.row, [ROW_INDEX_KEY]: this.index }
  },
  props: {
    row: { type: Object as PropType<Record<string, unknown> | undefined>, default: undefined },
    index: { type: Number, default: 0 },
  },
  template: '<div class="stub-row"><slot/></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型表格 stub
const StubTable = defineComponent({
  components: { StubTableRow },
  props: { data: { type: Array as PropType<Record<string, unknown>[]>, default: () => [] } },
  template:
    '<div class="stub-table"><StubTableRow v-for="(row, i) in data" :key="i" :row="row" :index="i"><slot/></StubTableRow></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型列 stub
const StubTableColumn = defineComponent({
  inject: {
    row: { from: ROW_KEY, default: undefined },
    rowIndex: { from: ROW_INDEX_KEY, default: 0 },
  },
  props: { prop: { type: String, default: '' } },
  template: '<div class="stub-cell">{{ row?.[prop] }}<slot :row="row" :$index="rowIndex"/></div>',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试 stub 集合
const minimalStubs: any = {
  StandardFormTemplate: {
    template: '<div><slot name="alert"/><slot/></div>',
    props: ['title', 'subtitle'],
  },
  'el-alert': { template: '<div><slot/></div>' },
  'el-descriptions': { template: '<div><slot/></div>' },
  'el-descriptions-item': { template: '<div><slot/></div>', props: ['label'] },
  'el-table': StubTable,
  'el-table-column': StubTableColumn,
  'el-tag': { template: '<span><slot/></span>' },
  'el-select': { template: '<div><slot/></div>' },
  'el-option': { template: '<div><slot/></div>' },
  'el-pagination': { template: '<div><slot/></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>', emits: ['click'] },
}

function mountPage(): ReturnType<typeof mount> {
  return mount(ResourceBacklogConsole, { global: { stubs: minimalStubs } })
}

describe('ResourceBacklogConsole', () => {
  beforeEach(() => {
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessage.error).mockClear()
  })

  it('加载汇总/明细/拒绝审计三段数据', async () => {
    vi.mocked(getBacklogSummary).mockResolvedValue(summaryFixture() as never)
    vi.mocked(getBacklogCommands).mockResolvedValue({ page: 1, size: 20, total: 0, rows: [] })
    vi.mocked(getResourceRejects).mockResolvedValue({ page: 1, size: 10, total: 0, rows: [] })
    mountPage()
    await flushPromises()
    expect(vi.mocked(getBacklogSummary)).toHaveBeenCalled()
    expect(vi.mocked(getBacklogCommands)).toHaveBeenCalled()
    expect(vi.mocked(getResourceRejects)).toHaveBeenCalled()
  })

  it('汇总面板展示未完成数、引擎死信与勾稽标签', async () => {
    vi.mocked(getBacklogSummary).mockResolvedValue(summaryFixture() as never)
    vi.mocked(getBacklogCommands).mockResolvedValue({ page: 1, size: 20, total: 0, rows: [] })
    vi.mocked(getResourceRejects).mockResolvedValue({ page: 1, size: 10, total: 0, rows: [] })
    const wrapper = mountPage()
    await flushPromises()
    const open = wrapper.find('[data-test="open-commands"]')
    expect(open.text()).toBe('42')
    expect(wrapper.find('[data-test="engine-deadletter"]').text()).toBe('1')
    expect(wrapper.find('[data-test="counter-consistency"]').text()).toContain('与事实一致')
  })

  it('命令明细按状态/类别过滤透传服务端', async () => {
    vi.mocked(getBacklogSummary).mockResolvedValue(summaryFixture() as never)
    vi.mocked(getBacklogCommands).mockResolvedValue({
      page: 1,
      size: 20,
      total: 1,
      rows: [
        {
          id: 9,
          command_key: 'FLOW_START:rec-1',
          command_type: 'FLOW_START',
          channel: 'NORMAL',
          status: 'COMPLETED',
          resource_class: 'PROD',
          resource_units: 1,
          resource_segment: 'SHARED',
          policy_version: 3,
          retry_count: 0,
          tenant_id: 0,
          create_time: '2026-10-03 10:00:00',
          claimed_at: null,
          finished_at: null,
          deadline_at: null,
          overdue_at: null,
          resource_released_at: null,
          failure_reason: null,
        },
      ],
    })
    vi.mocked(getResourceRejects).mockResolvedValue({ page: 1, size: 10, total: 0, rows: [] })
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      filterStatus: string
      filterClass: string
      refreshRows: () => Promise<void>
    }
    vm.filterStatus = 'COMPLETED'
    vm.filterClass = 'PROD'
    await vm.refreshRows()
    expect(vi.mocked(getBacklogCommands)).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'COMPLETED', resourceClass: 'PROD', page: 1, size: 20 }),
    )
    expect(wrapper.html()).toContain('FLOW_START:rec-1')
  })

  it('加载失败错误透出（不静默）', async () => {
    vi.mocked(getBacklogSummary).mockRejectedValue(new Error('汇总加载失败'))
    vi.mocked(getBacklogCommands).mockResolvedValue({ page: 1, size: 20, total: 0, rows: [] })
    vi.mocked(getResourceRejects).mockResolvedValue({ page: 1, size: 10, total: 0, rows: [] })
    mountPage()
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('汇总加载失败')
  })
})
