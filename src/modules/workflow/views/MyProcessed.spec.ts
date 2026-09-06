import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  myProcessed: vi.fn(),
}))

import { myProcessed } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { MyProcessedItem } from '@/contracts/bpm'
import MyProcessed from './MyProcessed.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="toolbar-actions"/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
  'el-select': { template: '<div/>', props: ['modelValue'] },
}

const mockItem: MyProcessedItem = {
  taskId: 'my-processed-001',
  taskName: '部门经理审批',
  processInstanceId: 'proc-001',
  processName: '请假审批流程',
  formKey: 'leave-request',
  businessKey: 'rec-leave-001',
  action: 'APPROVE',
  handleTime: '2026-07-20T10:15:00',
  instanceStatus: 'RUNNING',
  source: 'ACTION',
}

const mockPage = { list: [mockItem], total: 1, pageNum: 1, pageSize: 10 }

describe('MyProcessed.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts and calls myProcessed with pagination', async () => {
    vi.mocked(myProcessed).mockResolvedValueOnce(mockPage)
    mount(MyProcessed, { global: { stubs } })
    await nextTick()
    expect(myProcessed).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, { source: undefined })
  })

  it('renders records returned by the API', async () => {
    vi.mocked(myProcessed).mockResolvedValueOnce(mockPage)
    const wrapper = mount(MyProcessed, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect((wrapper.vm as unknown as { list: MyProcessedItem[] }).list).toEqual([mockItem])
    expect((wrapper.vm as unknown as { total: number }).total).toBe(1)
  })

  it('shows ApiError message when list fails', async () => {
    vi.mocked(myProcessed).mockRejectedValueOnce(new ApiError(2001, '无权查看'))
    const wrapper = mount(MyProcessed, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '无权查看')
  })

  it('reloads with source filter on search', async () => {
    vi.mocked(myProcessed).mockResolvedValue(mockPage)
    const wrapper = mount(MyProcessed, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { filter: { source: string }; handleSearch: () => void }
    vm.filter.source = 'ACTION'
    vm.handleSearch()
    await nextTick()
    await nextTick()

    expect(myProcessed).toHaveBeenLastCalledWith({ pageNum: 1, pageSize: 10 }, { source: 'ACTION' })
  })
})
