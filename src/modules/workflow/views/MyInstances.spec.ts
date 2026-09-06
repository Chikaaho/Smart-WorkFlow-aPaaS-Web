import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  myInstances: vi.fn(),
  myInstanceDetail: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

import { myInstances, myInstanceDetail } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessInstance, MyInstanceDetail } from '@/contracts/bpm'
import MyInstances from './MyInstances.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="toolbar-actions"/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
  'el-select': { template: '<div/>', props: ['modelValue'] },
  'el-input': { template: '<div/>', props: ['modelValue'] },
}

const mockInstance: ProcessInstance = {
  id: 1,
  processInstanceId: 'proc-001',
  processDefKey: 'leave_approval',
  processName: '请假审批流程',
  businessKey: 'rec-leave-001',
  formKey: 'leave-request',
  initiatorId: 1,
  status: 'RUNNING',
  createTime: '2026-07-20T09:30:00',
}

const mockPage = {
  list: [mockInstance],
  total: 1,
  pageNum: 1,
  pageSize: 10,
}

const mockDetail: MyInstanceDetail = {
  instance: mockInstance,
  processName: '请假审批流程',
  formKey: 'leave-request',
  businessKey: 'rec-leave-001',
  status: 'RUNNING',
  progress: [
    {
      taskId: 'task-approve1-001',
      taskName: '部门经理审批',
      nodeKey: 'Activity_approve1',
      assignee: '2',
    },
  ],
  history: [
    {
      taskId: 'task-submit-001',
      taskName: '提交申请',
      assignee: '1',
      createTime: '2026-07-20T09:30:00',
      endTime: '2026-07-20T10:15:00',
      action: 'APPROVE',
      approvalResult: 'APPROVED',
    },
  ],
}

describe('MyInstances.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts and calls myInstances with pagination', async () => {
    vi.mocked(myInstances).mockResolvedValueOnce(mockPage)
    mount(MyInstances, { global: { stubs } })
    await nextTick()
    expect(myInstances).toHaveBeenCalledTimes(1)
    expect(myInstances).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      { status: undefined, keyword: undefined },
    )
  })

  it('shows ApiError message when list fails', async () => {
    vi.mocked(myInstances).mockRejectedValueOnce(new ApiError(2001, '无权查看'))
    const wrapper = mount(MyInstances, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '无权查看')
  })

  it('opens detail dialog and calls myInstanceDetail', async () => {
    vi.mocked(myInstances).mockResolvedValueOnce(mockPage)
    vi.mocked(myInstanceDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(MyInstances, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { openDetail: (r: ProcessInstance) => Promise<void> }
    ).openDetail(mockInstance)
    await nextTick()

    expect(myInstanceDetail).toHaveBeenCalledWith(1)
    expect((wrapper.vm as unknown as { detail: MyInstanceDetail | null }).detail).toEqual(
      mockDetail,
    )
  })

  it('reloads with status filter on search', async () => {
    vi.mocked(myInstances).mockResolvedValue(mockPage)
    const wrapper = mount(MyInstances, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { filter: { status: string }; handleSearch: () => void }
    vm.filter.status = 'APPROVED'
    vm.handleSearch()
    await nextTick()
    await nextTick()

    expect(myInstances).toHaveBeenLastCalledWith(
      { pageNum: 1, pageSize: 10 },
      { status: 'APPROVED', keyword: undefined },
    )
  })
})
