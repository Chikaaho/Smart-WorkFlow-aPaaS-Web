import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  queryTodoTasks: vi.fn(),
  acceptTaskAction: vi.fn(),
  pollCommandStatus: vi.fn(),
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

import { queryTodoTasks, acceptTaskAction, pollCommandStatus } from '@/modules/workflow/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { TodoTask, CommandAcceptResp, WorkflowCommandStatus } from '@/contracts/bpm'
import TodoList from './TodoList.vue'

const acceptResp: CommandAcceptResp = {
  commandId: 'cmd-1',
  commandKey: 'k1',
  commandType: 'TASK_COMPLETE',
  channel: 'ASYNC',
  status: 'ACCEPTED',
  duplicated: false,
}

const completedStatus: WorkflowCommandStatus = {
  commandId: 'cmd-1',
  commandType: 'TASK_COMPLETE',
  channel: 'ASYNC',
  status: 'COMPLETED',
  result: null,
  failureReason: null,
  retryCount: 0,
  createTime: '2026-07-17T10:00:00',
  finishedAt: '2026-07-17T10:00:01',
}

const stubs = {
  StandardListTemplate: {
    template: '<div><slot/><slot name="toolbar-actions"/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
}

const mockTask: TodoTask = {
  taskId: 'mock-task-001',
  processInstanceId: 'mock-proc-001',
  processName: '单节点审批',
  formKey: 'leave-request',
  businessKey: 'fd_001',
  createTime: '2026-07-10T09:15:00',
}

const mockPageResult = {
  list: [mockTask],
  total: 1,
  pageNum: 1,
  pageSize: 10,
}

describe('TodoList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls queryTodoTasks with pagination on mount', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    mount(TodoList, { global: { stubs } })
    await nextTick()
    expect(queryTodoTasks).toHaveBeenCalledTimes(1)
    expect(queryTodoTasks).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
  })

  it('shows fallback error message when API fails with non-ApiError', async () => {
    vi.mocked(queryTodoTasks).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '加载待办任务失败')
  })

  it('shows ApiError message when API returns business error', async () => {
    vi.mocked(queryTodoTasks).mockRejectedValueOnce(new ApiError(2001, '任务列表为空'))
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '任务列表为空')
  })

  it('accepts via command channel, polls to COMPLETED and removes task on approve', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleApprove: (r: TodoTask) => Promise<void> }
    ).handleApprove(mockTask)
    await nextTick()

    expect(acceptTaskAction).toHaveBeenCalledWith('mock-task-001', 'complete')
    expect(pollCommandStatus).toHaveBeenCalledWith('cmd-1')
    expect(ElMessage.success).toHaveBeenCalledWith('审批通过')
    expect((wrapper.vm as unknown as { list: TodoTask[] }).list).toHaveLength(0)
  })

  it('shows failureReason when command polling ends FAILED', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValue(mockPageResult)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce({
      ...completedStatus,
      status: 'FAILED',
      failureReason: '流程定义已被停用',
    })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleApprove: (r: TodoTask) => Promise<void> }
    ).handleApprove(mockTask)
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('流程定义已被停用')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('warns honestly (no fake success) when polling times out without terminal state', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValue(mockPageResult)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(null)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleApprove: (r: TodoTask) => Promise<void> }
    ).handleApprove(mockTask)
    await nextTick()

    expect(ElMessage.warning).toHaveBeenCalledWith('处理中，可稍后在结果中查看')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('does not call acceptTaskAction when user cancels confirm', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleApprove: (r: TodoTask) => Promise<void> }
    ).handleApprove(mockTask)
    await nextTick()

    expect(acceptTaskAction).not.toHaveBeenCalled()
  })

  it('rejects via command channel on reject', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValue(mockPageResult)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleReject: (r: TodoTask) => Promise<void> }).handleReject(
      mockTask,
    )
    await nextTick()

    expect(acceptTaskAction).toHaveBeenCalledWith('mock-task-001', 'reject')
    expect(pollCommandStatus).toHaveBeenCalledWith('cmd-1')
    expect(ElMessage.success).toHaveBeenCalledWith('已驳回')
    expect((wrapper.vm as unknown as { list: TodoTask[] }).list).toHaveLength(0)
  })

  it('does not call acceptTaskAction when user cancels reject confirm', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleReject: (r: TodoTask) => Promise<void> }).handleReject(
      mockTask,
    )
    await nextTick()

    expect(acceptTaskAction).not.toHaveBeenCalled()
  })

  it('navigates to TaskDetail on row click', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { handleRowClick: (r: TodoTask) => void }
    vm.handleRowClick(mockTask)

    expect(mockPush).toHaveBeenCalledWith({
      name: 'TaskDetail',
      params: { taskId: 'mock-task-001' },
    })
  })

  it('navigates to ProcessedList on toolbar button click', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    // 查找「已办任务」按钮并点击
    const button = wrapper.find('button')
    await button.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({ name: 'ProcessedList' })
  })
})
