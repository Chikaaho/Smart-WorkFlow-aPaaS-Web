import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

vi.mock('@/modules/workflow/api/resource-ops')
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

import {
  listResourcePolicies,
  enableResourcePolicy,
  stopAcceptance,
} from '@/modules/workflow/api/resource-ops'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import ResourcePolicyConsole from '@/modules/workflow/views/ResourcePolicyConsole.vue'

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
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input-number': { template: '<input />' },
  'el-input': { template: '<input />' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    props: ['loading'],
    emits: ['click'],
  },
  'el-table': StubTable,
  'el-table-column': StubTableColumn,
  'el-tag': { template: '<span><slot/></span>' },
}

function policyRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 11,
    policyVersion: 3,
    status: 'DRAFT',
    enabled: false,
    stopAcceptance: false,
    globalMaxOutstanding: 2000,
    tenantMaxOutstanding: 800,
    prodReserved: 400,
    oaReserved: 400,
    sharedCapacity: 1200,
    tenantRatePerSec: 50,
    tenantBurst: 500,
    realtimeGlobalConcurrency: 16,
    realtimeTenantConcurrency: 8,
    batchSliceItems: 25,
    batchPollClaimLimit: 1,
    remark: null,
    ...overrides,
  }
}

function mountPage() {
  return mount(ResourcePolicyConsole, { global: { stubs: minimalStubs } })
}

describe('ResourcePolicyConsole', () => {
  beforeEach(() => {
    vi.mocked(listResourcePolicies).mockReset()
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessage.warning).mockClear()
    vi.mocked(ElMessage.error).mockClear()
  })

  it('加载策略列表并渲染版本', async () => {
    vi.mocked(listResourcePolicies).mockResolvedValue([policyRow()] as never)
    const wrapper = mountPage()
    await flushPromises()
    expect(vi.mocked(listResourcePolicies)).toHaveBeenCalled()
    expect(wrapper.html()).toContain('策略版本')
  })

  it('保留份额不自洽时本地拒绝创建', async () => {
    vi.mocked(listResourcePolicies).mockResolvedValue([] as never)
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      draft: Record<string, number>
      submitCreate: () => Promise<void>
    }
    vm.draft.globalMaxOutstanding = 100
    vm.draft.prodReserved = 10
    vm.draft.oaReserved = 10
    vm.draft.sharedCapacity = 10
    await vm.submitCreate()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('保留份额不自洽'))
  })

  it('启用检查失败：错误信息透出且不静默', async () => {
    const row = policyRow()
    vi.mocked(listResourcePolicies).mockResolvedValue([row] as never)
    vi.mocked(enableResourcePolicy).mockRejectedValue(
      new ApiError(
        2430,
        '资源策略启用检查未通过: 保留份额不自洽',
        'INPUT_CORRECTABLE',
        'bpm.resource_policy_invalid',
      ),
    )
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as { enable: (row: Record<string, unknown>) => Promise<void> }
    await vm.enable(row)
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('启用检查未通过'))
  })

  it('停新受理开关：确认语义透传', async () => {
    const row = policyRow({ status: 'ACTIVE', stopAcceptance: false })
    vi.mocked(listResourcePolicies).mockResolvedValue([row] as never)
    vi.mocked(stopAcceptance).mockResolvedValue(
      policyRow({ status: 'ACTIVE', stopAcceptance: true }) as never,
    )
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      toggleStop: (row: Record<string, unknown>) => Promise<void>
    }
    await vm.toggleStop(row)
    expect(vi.mocked(stopAcceptance)).toHaveBeenCalledWith(11, true)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('停新受理'))
  })
})
