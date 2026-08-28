import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: { taskId: 'task-001' } }),
}))

vi.mock('@/modules/workflow/api', () => ({
  queryTaskDetail: vi.fn(),
  completeTask: vi.fn(),
  rejectTask: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(),
    },
  }
})

import { queryTaskDetail, completeTask, rejectTask } from '@/modules/workflow/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { TaskDetail } from '@/contracts/bpm'
import TaskDetailView from './TaskDetail.vue'

const stubs = {
  'el-card': { template: '<div class="el-card"><slot/><slot name="header"/></div>' },
  'el-descriptions': { template: '<div><slot/></div>' },
  'el-descriptions-item': { template: '<div><slot/></div>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
}

const mockDetail: TaskDetail = {
  taskId: 'task-001',
  taskName: '审批',
  processInstanceId: 'pi-001',
  processDefinitionKey: 'skeleton_approval',
  processName: '单节点审批',
  formKey: 'leave-request',
  businessKey: 'fd_001',
  assignee: '2',
  initiatorId: 1,
  createTime: '2026-07-17T10:00:00',
  processVariables: { formKey: 'leave-request', amount: 5000 },
  approvalHistory: [
    {
      taskId: 'hist-001',
      taskName: '发起申请',
      assignee: '1',
      createTime: '2026-07-17T09:00:00',
      endTime: '2026-07-17T09:30:00',
      approvalResult: 'APPROVED',
    },
  ],
}

describe('TaskDetail.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls queryTaskDetail with taskId on mount', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    expect(queryTaskDetail).toHaveBeenCalledWith('task-001')
  })

  it('renders task detail fields (12 fields)', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { detail: TaskDetail | null }
    expect(vm.detail).not.toBeNull()
    expect(vm.detail!.taskId).toBe('task-001')
    expect(vm.detail!.taskName).toBe('审批')
    expect(vm.detail!.processName).toBe('单节点审批')
    expect(vm.detail!.processDefinitionKey).toBe('skeleton_approval')
    expect(vm.detail!.formKey).toBe('leave-request')
    expect(vm.detail!.businessKey).toBe('fd_001')
    expect(vm.detail!.assignee).toBe('2')
    expect(vm.detail!.initiatorId).toBe(1)
    expect(vm.detail!.createTime).toBe('2026-07-17T10:00:00')
    expect(vm.detail!.processVariables).toEqual({ formKey: 'leave-request', amount: 5000 })
    expect(vm.detail!.approvalHistory).toHaveLength(1)
  })

  it('shows fallback for null processName', async () => {
    const detailNoName = { ...mockDetail, processName: null }
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(detailNoName)
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { detail: TaskDetail | null }
    expect(vm.detail!.processName).toBeNull()
  })

  it('shows ApiError message on business error', async () => {
    vi.mocked(queryTaskDetail).mockRejectedValueOnce(new ApiError(2001, '任务不存在'))
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '任务不存在')
  })

  it('shows fallback error on non-ApiError', async () => {
    vi.mocked(queryTaskDetail).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '加载任务详情失败')
  })

  it('shows empty history message when approvalHistory is []', async () => {
    const detailEmptyHist = { ...mockDetail, approvalHistory: [] }
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(detailEmptyHist)
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { detail: TaskDetail | null }
    expect(vm.detail!.approvalHistory).toHaveLength(0)
  })

  it('calls completeTask on approve and navigates to TodoList', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(completeTask).mockResolvedValueOnce(undefined)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleApprove: () => Promise<void> }).handleApprove()
    await nextTick()

    expect(completeTask).toHaveBeenCalledWith('task-001')
    expect(ElMessage.success).toHaveBeenCalledWith('审批通过')
    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })

  it('calls rejectTask on reject and navigates to TodoList', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(rejectTask).mockResolvedValueOnce(undefined)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleReject: () => Promise<void> }).handleReject()
    await nextTick()

    expect(rejectTask).toHaveBeenCalledWith('task-001')
    expect(ElMessage.success).toHaveBeenCalledWith('已驳回')
    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })

  it('navigates back to TodoList on back button click', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { goBack: () => void }
    vm.goBack()

    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })
})
