import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  queryTodoTasks: vi.fn(),
  claimTask: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

import { queryTodoTasks, claimTask } from '@/modules/workflow/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { TodoTask } from '@/contracts/bpm'
import TodoList from './TodoList.vue'

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
  TaskDetailDialog: { template: '<div />' },
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

  it('opens the shared task detail dialog on row click without leaving the list', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleRowClick: (r: TodoTask) => void
      detailVisible: boolean
      detailTaskId: string
    }
    vm.handleRowClick(mockTask)

    expect(vm.detailVisible).toBe(true)
    expect(vm.detailTaskId).toBe('mock-task-001')
  })

  it('row actions link to the detail dialog instead of direct approval buttons', async () => {
    vi.mocked(queryTodoTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      rowActions: (row: unknown) => Array<{ key: string }>
    }
    expect(vm.rowActions(mockTask).map((action) => action.key)).toEqual(['detail'])
  })

  it('claims candidate task via claim endpoint and reloads list', async () => {
    const candidateTask: TodoTask = { ...mockTask, taskId: 'cand-1', candidate: true }
    vi.mocked(queryTodoTasks).mockResolvedValue({
      list: [candidateTask],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(claimTask).mockResolvedValueOnce(undefined)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleClaim: (r: TodoTask) => Promise<void> }).handleClaim(
      candidateTask,
    )
    await nextTick()

    expect(claimTask).toHaveBeenCalledWith('cand-1')
    expect(ElMessage.success).toHaveBeenCalledWith('任务已领取，可在待办中办理')
    expect(queryTodoTasks).toHaveBeenCalledTimes(2)
  })

  it('shows server error message when claim fails (e.g. already claimed by another candidate)', async () => {
    const candidateTask: TodoTask = { ...mockTask, taskId: 'cand-2', candidate: true }
    vi.mocked(queryTodoTasks).mockResolvedValue({
      list: [candidateTask],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(claimTask).mockRejectedValueOnce(new ApiError(2305, '任务已被领取: 当前办理人 2'))
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleClaim: (r: TodoTask) => Promise<void> }).handleClaim(
      candidateTask,
    )
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('任务已被领取: 当前办理人 2')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('does not call claimTask when user cancels confirm', async () => {
    const candidateTask: TodoTask = { ...mockTask, taskId: 'cand-3', candidate: true }
    vi.mocked(queryTodoTasks).mockResolvedValueOnce({
      list: [candidateTask],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(TodoList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleClaim: (r: TodoTask) => Promise<void> }).handleClaim(
      candidateTask,
    )
    await nextTick()

    expect(claimTask).not.toHaveBeenCalled()
  })
})
