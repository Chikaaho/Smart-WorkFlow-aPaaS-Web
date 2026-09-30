import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { PropType, DefineComponent } from 'vue'

// Mock API 层与权限层
vi.mock('@/modules/workflow/api/txn-batch')
vi.mock('@/foundation/permission', () => ({
  hasPerm: vi.fn(() => true),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import { submitTxnBatch, getTxnBatch } from '@/modules/workflow/api/txn-batch'
import { hasPerm } from '@/foundation/permission'
import { ElMessage } from 'element-plus'
import TxnBatchConsole from '@/modules/workflow/views/TxnBatchConsole.vue'

const ROW_KEY = Symbol('stubRow')
const ROW_INDEX_KEY = Symbol('stubRowIndex')

/** 表格行上下文：行 stub provide，列 stub inject，向默认插槽传递 row（受理项/结果行输入与断言需要）。 */
// eslint-disable-next-line vue/one-component-per-file -- 测试型行上下文 stub
const StubTableRow = defineComponent({
  provide() {
    return { [ROW_KEY]: this.row, [ROW_INDEX_KEY]: this.index }
  },
  props: {
    row: {
      type: Object as PropType<Record<string, unknown> | undefined>,
      required: false,
      default: undefined,
    },
    index: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  template: '<div class="stub-row"><slot/></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型表格 stub（按 data 逐行渲染）
const StubTable = defineComponent({
  components: { StubTableRow },
  props: {
    data: {
      type: Array as PropType<Record<string, unknown>[]>,
      required: false,
      default: () => [],
    },
  },
  template:
    '<div class="stub-table"><StubTableRow v-for="(row, i) in data" :key="i" :row="row" :index="i"><slot/></StubTableRow></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型列 stub（透传行上下文）
const StubTableColumn = defineComponent({
  inject: {
    row: { from: ROW_KEY, default: undefined },
    rowIndex: { from: ROW_INDEX_KEY, default: 0 },
  },
  props: { prop: { type: String, required: false, default: '' } },
  template: '<div class="stub-cell">{{ row?.[prop] }}<slot :row="row" :$index="rowIndex"/></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 可输入的 el-input stub（v-model 转发）
const StubInput = defineComponent({
  props: { modelValue: { type: [String, Number], required: false, default: '' } },
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}) as unknown as DefineComponent

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试 stub 集合（vue-test-utils Stubs 类型为组件或 true）
const minimalStubs: any = {
  StandardFormTemplate: {
    template: '<div><slot name="alert"/><slot/></div>',
    props: ['title', 'subtitle'],
  },
  'el-alert': { template: '<div><slot/></div>' },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': StubInput,
  'el-button': {
    template: '<button :disabled="disabled || loading"><slot/></button>',
    props: ['disabled', 'loading'],
  },
  'el-table': StubTable,
  'el-table-column': StubTableColumn,
  'el-tag': { template: '<span><slot/></span>' },
  'el-descriptions': { template: '<div><slot/></div>' },
  'el-descriptions-item': { template: '<div>{{ label }}:<slot/></div>', props: ['label'] },
  'el-drawer': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-radio-group': { template: '<div><slot/></div>' },
  'el-radio': { template: '<label><slot/></label>', props: ['value'] },
}

function mountPage() {
  return mount(TxnBatchConsole, { global: { stubs: minimalStubs } })
}

function inputOf(wrapper: ReturnType<typeof mount>, testId: string) {
  const found = wrapper.find(`[data-test="${testId}"]`)
  expect(found.exists(), `missing [data-test="${testId}"]`).toBe(true)
  return found
}

describe('TxnBatchConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPerm).mockReturnValue(true)
  })

  it('受理成功后按返回批次回查并展示逐项结果', async () => {
    vi.mocked(submitTxnBatch).mockResolvedValue({
      batchKey: 'b-01',
      actionId: 'act-1',
      actionVersion: 3,
      status: 'PENDING',
      totalCount: 2,
      succeededCount: 0,
      failedCount: 0,
      commandId: 101,
      replay: false,
      items: [
        {
          itemKey: 'i-1',
          recordId: 'r-1',
          quantity: '1',
          status: 'PENDING',
          invocationId: null,
          errorCode: null,
          errorMsg: null,
          attemptCount: 0,
        },
        {
          itemKey: 'i-2',
          recordId: 'r-2',
          quantity: '1',
          status: 'PENDING',
          invocationId: null,
          errorCode: null,
          errorMsg: null,
          attemptCount: 0,
        },
      ],
    })
    vi.mocked(getTxnBatch).mockResolvedValue({
      batchKey: 'b-01',
      actionId: 'act-1',
      actionVersion: 3,
      status: 'PARTIALLY_FAILED',
      totalCount: 2,
      succeededCount: 1,
      failedCount: 1,
      commandId: 101,
      replay: false,
      items: [
        {
          itemKey: 'i-1',
          recordId: 'r-1',
          quantity: '1',
          status: 'SUCCEEDED',
          invocationId: 'inv-1',
          errorCode: null,
          errorMsg: null,
          attemptCount: 1,
        },
        {
          itemKey: 'i-2',
          recordId: 'r-2',
          quantity: '1',
          status: 'REJECTED',
          invocationId: 'inv-2',
          errorCode: 1604,
          errorMsg: '可用量不足',
          attemptCount: 1,
        },
      ],
    })

    const wrapper = mountPage()

    await inputOf(wrapper, 'batch-key-input').setValue('b-01')
    await inputOf(wrapper, 'batch-action-input').setValue('act-1')
    await inputOf(wrapper, 'item-key-0').setValue('i-1')
    await inputOf(wrapper, 'item-record-0').setValue('r-1')
    await wrapper.find('[data-test="batch-add-item"]').trigger('click')
    await inputOf(wrapper, 'item-key-1').setValue('i-2')
    await inputOf(wrapper, 'item-record-1').setValue('r-2')
    await wrapper.find('[data-test="batch-submit"]').trigger('click')
    await flushPromises()

    expect(submitTxnBatch).toHaveBeenCalledTimes(1)
    expect(submitTxnBatch).toHaveBeenCalledWith({
      batchKey: 'b-01',
      actionId: 'act-1',
      items: [
        { itemKey: 'i-1', recordId: 'r-1', quantity: '1' },
        { itemKey: 'i-2', recordId: 'r-2', quantity: '1' },
      ],
    })
    // 受理返回后自动回查该批次
    expect(getTxnBatch).toHaveBeenCalledWith('b-01')
    await flushPromises()

    // 部分失败批次：逐项拒绝原因可见（可定位）
    expect(wrapper.find('[data-test="batch-summary"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('可用量不足')
    expect(wrapper.find('[data-test="batch-result-table"]').exists()).toBe(true)
  })

  it('重放返回原批次时明确提示不重复执行', async () => {
    vi.mocked(submitTxnBatch).mockResolvedValue({
      batchKey: 'b-02',
      actionId: 'act-1',
      actionVersion: 3,
      status: 'COMPLETED',
      totalCount: 1,
      succeededCount: 1,
      failedCount: 0,
      commandId: 102,
      replay: true,
      items: [],
    })
    vi.mocked(getTxnBatch).mockResolvedValue({
      batchKey: 'b-02',
      actionId: 'act-1',
      actionVersion: 3,
      status: 'COMPLETED',
      totalCount: 1,
      succeededCount: 1,
      failedCount: 0,
      commandId: 102,
      replay: true,
      items: [],
    })

    const wrapper = mountPage()
    await inputOf(wrapper, 'batch-key-input').setValue('b-02')
    await inputOf(wrapper, 'batch-action-input').setValue('act-1')
    await inputOf(wrapper, 'item-key-0').setValue('i-1')
    await inputOf(wrapper, 'item-record-0').setValue('r-1')
    await wrapper.find('[data-test="batch-submit"]').trigger('click')
    await flushPromises()

    // 重放命中原批次：明确提示不重复执行（提示走 ElMessage，不入组件 DOM）
    expect(ElMessage.info).toHaveBeenCalledWith(expect.stringContaining('已返回原批次'))
  })

  it('项键重复时前端拒绝提交', async () => {
    const wrapper = mountPage()
    await inputOf(wrapper, 'batch-key-input').setValue('b-03')
    await inputOf(wrapper, 'batch-action-input').setValue('act-1')
    await inputOf(wrapper, 'item-key-0').setValue('dup')
    await inputOf(wrapper, 'item-record-0').setValue('r-1')
    // 第二项键与第一项相同
    await wrapper.find('[data-test="batch-add-item"]').trigger('click')
    await inputOf(wrapper, 'item-key-1').setValue('dup')
    await inputOf(wrapper, 'item-record-1').setValue('r-2')
    await wrapper.find('[data-test="batch-submit"]').trigger('click')
    await flushPromises()

    expect(submitTxnBatch).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('项键重复'))
  })

  it('无调用权限时受理入口禁用', async () => {
    vi.mocked(hasPerm).mockReturnValue(false)
    const wrapper = mountPage()
    expect((wrapper.find('[data-test="batch-submit"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(submitTxnBatch).not.toHaveBeenCalled()
  })
})
