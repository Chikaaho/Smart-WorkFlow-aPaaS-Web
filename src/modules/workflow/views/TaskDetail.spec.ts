import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import { createPinia } from 'pinia'

const mockPush = vi.fn()
/** 可变 route 桩：query 在用例内按需设置（如 source=processed） */
const mockRoute = { params: { taskId: 'task-001' }, query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}))

vi.mock('@/modules/workflow/api', () => ({
  queryTaskDetail: vi.fn(),
  acceptTaskAction: vi.fn(),
  pollCommandStatus: vi.fn(),
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

import { queryTaskDetail, acceptTaskAction, pollCommandStatus } from '@/modules/workflow/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { TaskDetail, CommandAcceptResp, WorkflowCommandStatus } from '@/contracts/bpm'

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
    mockRoute.query = {}
  })

  it('calls queryTaskDetail with taskId on mount', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    expect(queryTaskDetail).toHaveBeenCalledWith('task-001')
  })

  it('renders task detail fields (12 fields)', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
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
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { detail: TaskDetail | null }
    expect(vm.detail!.processName).toBeNull()
  })

  it('shows ApiError message on business error', async () => {
    vi.mocked(queryTaskDetail).mockRejectedValueOnce(new ApiError(2001, '任务不存在'))
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '任务不存在')
  })

  it('shows fallback error on non-ApiError', async () => {
    vi.mocked(queryTaskDetail).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '加载任务详情失败')
  })

  it('shows empty history message when approvalHistory is []', async () => {
    const detailEmptyHist = { ...mockDetail, approvalHistory: [] }
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(detailEmptyHist)
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { detail: TaskDetail | null }
    expect(vm.detail!.approvalHistory).toHaveLength(0)
  })

  it('accepts approve via command channel and navigates to TodoList', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleApprove: () => Promise<void> }).handleApprove()
    await nextTick()

    expect(acceptTaskAction).toHaveBeenCalledWith('task-001', 'complete', undefined)
    expect(pollCommandStatus).toHaveBeenCalledWith('cmd-1')
    // 断言目录键而不是某个语言的字面量：文案收敛/改词不应让行为断言失效
    expect(ElMessage.success).toHaveBeenCalledWith(i18n.global.t('common.statusApproved'))
    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })

  it('accepts reject via command channel and navigates to TodoList', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleReject: () => Promise<void> }).handleReject()
    await nextTick()

    expect(acceptTaskAction).toHaveBeenCalledWith('task-001', 'reject', undefined)
    expect(pollCommandStatus).toHaveBeenCalledWith('cmd-1')
    expect(ElMessage.success).toHaveBeenCalledWith('已驳回')
    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })

  it('shows failureReason and stays when command polling ends FAILED', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce({
      ...completedStatus,
      status: 'FAILED',
      failureReason: '任务已被他人办理',
    })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleApprove: () => Promise<void> }).handleApprove()
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('任务已被他人办理')
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps the successful approval result when navigation rejects', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    mockPush.mockRejectedValueOnce(new Error('navigation race'))

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    await (wrapper.vm as unknown as { handleApprove: () => Promise<void> }).handleApprove()

    expect(ElMessage.success).toHaveBeenCalledWith(i18n.global.t('common.statusApproved'))
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('navigates back to TodoList on back button click', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { goBack: () => void }
    vm.goBack()

    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })

  it('V012-BUG-001: navigates back to ProcessedList when source=processed', async () => {
    mockRoute.query = { source: 'processed' }
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { goBack: () => void }
    vm.goBack()

    expect(mockPush).toHaveBeenCalledWith({ name: 'ProcessedList' })
  })

  it('V012-BUG-001: finished task renders read-only detail with instance status', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'FINISHED',
      instanceStatus: 'APPROVED',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      isFinishedTask: boolean
      canAct: boolean
      headerTagLabel: string
    }
    expect(vm.isFinishedTask).toBe(true)
    expect(vm.canAct).toBe(false)
    // 页头展示真实实例状态（已通过），不再按 nodeKey 推断
    expect(vm.headerTagLabel).toBe(i18n.global.t('common.statusApproved'))
    // 办理操作卡不渲染
    expect(wrapper.findAll('.detail-card--actions')).toHaveLength(0)
  })

  it('V012-BUG-001: running task without handle permission hides approval actions', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'RUNNING',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { isFinishedTask: boolean; canAct: boolean }
    expect(vm.isFinishedTask).toBe(false)
    expect(vm.canAct).toBe(false)
    expect(wrapper.findAll('.detail-card--actions')).toHaveLength(0)
  })

  it('V012-BUG-001: running task with handle permission renders action card', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'RUNNING',
      canHandle: true,
    })
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { canAct: boolean }
    expect(vm.canAct).toBe(true)
    expect(wrapper.findAll('.detail-card--actions')).toHaveLength(1)
  })
})
