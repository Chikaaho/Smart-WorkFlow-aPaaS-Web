import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/modules/workflow/api', () => ({
  queryTodoTasks: vi.fn(),
}))

vi.mock('@/modules/workflow/api/i4', () => ({
  batchTaskAction: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { queryTodoTasks } from '@/modules/workflow/api'
import type { TodoTask } from '@/contracts/bpm'
import { batchTaskAction, type BatchItemResult } from '@/modules/workflow/api/i4'
import type { PageResult } from '@/contracts/common'
import BatchApproval from './BatchApproval.vue'

const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div><slot/></div>' },
  'el-button': { template: '<button><slot/></button>', props: ['disabled'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
}

describe('BatchApproval', () => {
  beforeEach(() => {
    vi.mocked(queryTodoTasks).mockResolvedValue({
      list: [{ taskId: 't1' }],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    } as unknown as PageResult<TodoTask>)
  })

  it('mounts and loads current-user todo tasks', async () => {
    const wrapper = mount(BatchApproval, { global: { stubs: minimalStubs } })
    await Promise.resolve()
    expect(queryTodoTasks).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
  })

  it('submits batch and shows per-item results without masking failures', async () => {
    const results: BatchItemResult[] = [
      { taskId: 't1', success: true },
      { taskId: 't2', success: false, errorCode: 2308, message: '审批意见不能为空' },
    ]
    vi.mocked(batchTaskAction).mockResolvedValue({
      results,
      success: 1,
      failed: 1,
      total: 2,
    })
    const wrapper = mount(BatchApproval, { global: { stubs: minimalStubs } })
    await Promise.resolve()
    const vm = wrapper.vm as unknown as {
      selected: unknown[]
      submitBatch: (action: 'APPROVE' | 'DISAPPROVE') => Promise<void>
      results: BatchItemResult[]
    }
    vm.selected = [{ taskId: 't1' }, { taskId: 't2' }]
    await vm.submitBatch('APPROVE')
    expect(batchTaskAction).toHaveBeenCalledTimes(1)
    expect(vm.results).toHaveLength(2)
    expect(vm.results[1].success).toBe(false)
  })
})
