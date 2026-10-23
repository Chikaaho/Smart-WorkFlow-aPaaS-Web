import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { i18n } from '@/locales'
import { createPinia, setActivePinia } from 'pinia'

const mockPush = vi.fn()
const mockBack = vi.fn()
/** 可变 route 桩：query 在用例内按需设置（如 source=processed） */
const mockRoute = { params: { taskId: 'task-001' }, query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useRoute: () => mockRoute,
}))

vi.mock('@/modules/workflow/api', () => ({
  queryTaskDetail: vi.fn(),
  acceptTaskAction: vi.fn(),
  pollCommandStatus: vi.fn(),
  latestTaskCommand: vi.fn(),
  transferTask: vi.fn(),
  delegateTask: vi.fn(),
  communicateTask: vi.fn(),
  addSignTask: vi.fn(),
  getApprovalOpinionDraft: vi.fn(),
  saveApprovalOpinionDraft: vi.fn(),
}))

// P64 节点业务表单：办理页读取绑定与数据（默认未绑定，用例内按需 stub）
vi.mock('@/modules/workflow/api/p64', () => ({
  getTaskNodeForm: vi.fn(),
  saveTaskNodeFormDraft: vi.fn(),
  listInstanceNodeFormData: vi.fn(),
  previewTrigger: vi.fn(),
}))

// P63 IoT 预约：TaskDetail 经动态 import 使用 iot 模块 API，这里整体替换
vi.mock('@/adapters/iot-reservation', () => ({
  listReservationsByInstance: vi.fn(async () => []),
  cancelReservation: vi.fn(),
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

import {
  queryTaskDetail,
  acceptTaskAction,
  pollCommandStatus,
  latestTaskCommand,
  transferTask,
  delegateTask,
  communicateTask,
  addSignTask,
  getApprovalOpinionDraft,
} from '@/modules/workflow/api'
import { getTaskNodeForm } from '@/modules/workflow/api/p64'
import { listReservationsByInstance, cancelReservation } from '@/adapters/iot-reservation'
import { permissionDirective } from '@/foundation/permission'
import { useUserStore } from '@/stores/user'
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
  'el-dropdown': {
    props: ['disabled', 'trigger'],
    emits: ['command'],
    template:
      '<div class="stub-dropdown"><slot/><div class="stub-dropdown-menu"><slot name="dropdown"/></div></div>',
  },
  'el-dropdown-menu': { template: '<div><slot/></div>' },
  'el-dropdown-item': {
    props: ['command', 'divided', 'disabled'],
    template: '<div class="stub-dropdown-item" :data-command="command"><slot/></div>',
  },
  'el-icon': { template: '<span><slot/></span>' },
}

interface ApprovalActionVm {
  canAct: boolean
  canUrge: boolean
  approvalMoreActions: Array<{ command: string; label: string; divided?: boolean }>
  lifecycleDialog: {
    kind: 'TRANSFER' | 'DELEGATE' | 'COMMUNICATE' | 'ADD_SIGN'
    targetUserId?: string
    message?: string
    receivers?: string
    participants?: string
    mode?: 'SERIAL' | 'PARALLEL'
    signPosition?: 'BEFORE' | 'AFTER'
  } | null
  opinionComment: string
  handleApprovalMore: (command: string) => void
  submitLifecycle: () => Promise<void>
}

const mockDetail: TaskDetail = {
  taskId: 'task-001',
  taskName: '审批',
  taskStatus: 'RUNNING',
  canHandle: true,
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
    vi.mocked(getTaskNodeForm).mockResolvedValue({ bound: false } as never)
    vi.mocked(getApprovalOpinionDraft).mockResolvedValue(null as never)
    vi.mocked(latestTaskCommand).mockResolvedValue(null)
    vi.mocked(transferTask).mockResolvedValue(undefined)
    vi.mocked(delegateTask).mockResolvedValue(undefined)
    vi.mocked(communicateTask).mockResolvedValue(undefined)
    vi.mocked(addSignTask).mockResolvedValue(undefined)
  })

  const allLifecyclePermissions = [
    'workflow:task:transfer',
    'workflow:task:delegate',
    'workflow:task:communicate',
    'workflow:task:add-sign',
  ]

  async function mountActionable(
    overrides: Partial<TaskDetail> & { allowedActions?: string[] } = {},
    permissionCodes = allLifecyclePermissions,
  ) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUserStore(pinia).setSession({
      user: {
        id: '2',
        username: 'approver',
        displayName: '审批人',
        deptId: null,
        tenantId: null,
      },
      permissions: new Set(permissionCodes),
      roles: new Set<string>(),
      superAdmin: false,
    })
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      canHandle: true,
      taskStatus: 'RUNNING',
      instanceStatus: 'RUNNING',
      ...overrides,
    })
    const wrapper = mount(TaskDetailView, {
      global: { plugins: [i18n, pinia], stubs },
    })
    await nextTick()
    await flushPromises()
    return wrapper
  }

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

  it('accepts approve via command channel and returns to the todo list', async () => {
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
    // 0.1.7 #20：无应用内历史时兜底回工作台待办
    expect(mockPush).toHaveBeenCalledWith({ name: 'workspace-todo' })
  })

  it('P64: 无意见表单/备注时节点表单数据仍随同意提交（nodeFormData 不丢）', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    vi.mocked(getTaskNodeForm).mockResolvedValueOnce({
      bound: true,
      formKey: 'qc_form',
      formName: '质检处理单',
      formVersion: '2',
      definition: {
        fields: [{ name: 'verdict', type: 'TEXT', label: '判定结果', required: true }],
      },
      status: 'EMPTY',
      data: { verdict: 'REWORK' },
      roundNo: 1,
    } as never)
    vi.mocked(acceptTaskAction).mockResolvedValueOnce(acceptResp)
    vi.mocked(pollCommandStatus).mockResolvedValueOnce(completedStatus)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()
    await flushPromises()

    await (wrapper.vm as unknown as { handleApprove: () => Promise<void> }).handleApprove()
    await nextTick()

    // 无 opinionForm 且无 comment：payload 不得因此丢掉 nodeFormData（服务端同事务提交依赖它）
    expect(acceptTaskAction).toHaveBeenCalledWith(
      'task-001',
      'complete',
      expect.objectContaining({ action: 'APPROVE', nodeFormData: { verdict: 'REWORK' } }),
    )
  })

  it('P64: 审批表单并入审批区，只呈现字段组件、不显示表单名称与备注', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({ ...mockDetail, canHandle: true })
    vi.mocked(getTaskNodeForm).mockResolvedValueOnce({
      bound: true,
      formKey: 'approval_opinion_form',
      formName: '演练审批意见',
      formVersion: '2',
      definition: {
        fields: [{ name: 'verdict', type: 'TEXT', label: '审批结论', required: true }],
      },
      status: 'EMPTY',
      data: {},
      roundNo: 1,
    } as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await flushPromises()

    const approvalArea = wrapper.find('.detail-card--actions')
    expect(approvalArea.find('.approval-form').exists()).toBe(true)
    expect(approvalArea.text()).toContain('审批结论')
    expect(approvalArea.text()).not.toContain('演练审批意见')
    expect(approvalArea.find('.opinion-input').exists()).toBe(false)
  })

  it('P64: 无审批表单时审批区保留备注输入', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({ ...mockDetail, canHandle: true })
    vi.mocked(getTaskNodeForm).mockResolvedValueOnce({ bound: false } as never)

    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await flushPromises()

    const approvalArea = wrapper.find('.detail-card--actions')
    expect(approvalArea.find('.approval-form').exists()).toBe(false)
    expect(approvalArea.find('.opinion-input').exists()).toBe(true)
  })

  it('accepts reject via command channel and returns to the todo list', async () => {
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
    expect(mockPush).toHaveBeenCalledWith({ name: 'workspace-todo' })
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

  it('falls back to workspace todo on back click when no in-app history', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { goBack: () => void }
    vm.goBack()

    expect(mockBack).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith({ name: 'workspace-todo' })
  })

  it('0.1.7 #20: back returns to the previous page when in-app history exists', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce(mockDetail)
    window.history.replaceState({ back: '/workflow/processed' }, '')
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { goBack: () => void }
    vm.goBack()

    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
    window.history.replaceState(null, '')
  })

  it('V012-BUG-001: finished task renders read-only detail without action card', async () => {
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'FINISHED',
      instanceStatus: 'APPROVED',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, createPinia()], stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { canAct: boolean }
    expect(vm.canAct).toBe(false)
    // 办理操作卡不渲染
    expect(wrapper.findAll('.detail-card--actions')).toHaveLength(0)
  })

  it('finished task never shows urge even when current user is the initiator', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUserStore(pinia).setSession({
      user: {
        id: '1',
        username: 'initiator',
        displayName: '发起人',
        deptId: null,
        tenantId: null,
      },
      permissions: new Set<string>(),
      roles: new Set<string>(),
      superAdmin: false,
    })
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'FINISHED',
      instanceStatus: 'APPROVED',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, {
      global: { plugins: [i18n, pinia], stubs },
    })
    await nextTick()
    await flushPromises()

    const vm = wrapper.vm as unknown as { canAct: boolean; canUrge: boolean }
    expect(vm.canAct).toBe(false)
    expect(vm.canUrge).toBe(false)
    expect(wrapper.findAll('.detail-card--actions')).toHaveLength(0)
    expect(wrapper.text()).not.toContain(i18n.global.t('taskDetailUi.urgeAction'))
  })

  it('running task still shows urge to the initiator', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUserStore(pinia).setSession({
      user: {
        id: '1',
        username: 'initiator',
        displayName: '发起人',
        deptId: null,
        tenantId: null,
      },
      permissions: new Set<string>(),
      roles: new Set<string>(),
      superAdmin: false,
    })
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'RUNNING',
      instanceStatus: 'RUNNING',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, {
      global: { plugins: [i18n, pinia], stubs },
    })
    await nextTick()
    await flushPromises()

    const vm = wrapper.vm as unknown as { canUrge: boolean }
    expect(vm.canUrge).toBe(true)
    expect(wrapper.text()).toContain(i18n.global.t('taskDetailUi.urgeAction'))
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

    const vm = wrapper.vm as unknown as { canAct: boolean }
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

  it('W020: secondary approval actions are grouped under More while primary actions and opinion draft stay visible', async () => {
    const wrapper = await mountActionable()
    const vm = wrapper.vm as unknown as ApprovalActionVm

    expect(vm.approvalMoreActions.map((action) => action.command)).toEqual([
      'TRANSFER',
      'DELEGATE',
      'COMMUNICATE',
      'ADD_SIGN',
    ])
    const actionBar = wrapper.find('.detail-actions__btns')
    expect(actionBar.find('[data-testid="approval-more-trigger"]').exists()).toBe(true)
    const directButtons = actionBar.findAll('button').map((button) => button.text())
    expect(directButtons).toEqual(
      expect.arrayContaining([
        i18n.global.t('common.moreActions'),
        i18n.global.t('common.reject'),
        i18n.global.t('workflow.approveTask'),
      ]),
    )
    for (const label of [
      i18n.global.t('workflow.transferOwnTask'),
      i18n.global.t('workflow.delegateAction'),
      i18n.global.t('workflow.consultTask'),
      i18n.global.t('workflow.addSign'),
    ]) {
      expect(directButtons).not.toContain(label)
      expect(wrapper.text()).toContain(label)
    }
    expect(wrapper.find('.opinion-draft-actions').text()).toContain(
      i18n.global.t('workflow.saveOpinionDraft'),
    )
  })

  it('W020: every More command opens its existing lifecycle flow', async () => {
    const wrapper = await mountActionable()
    const vm = wrapper.vm as unknown as ApprovalActionVm

    for (const command of ['TRANSFER', 'DELEGATE', 'COMMUNICATE', 'ADD_SIGN'] as const) {
      vm.handleApprovalMore(command)
      expect(vm.lifecycleDialog?.kind).toBe(command)
    }
  })

  it('W020: transfer and delegate preserve a 64-bit user ID as an exact string', async () => {
    const wrapper = await mountActionable()
    const vm = wrapper.vm as unknown as ApprovalActionVm
    const largeUserId = '2113516346351312898'

    vm.handleApprovalMore('TRANSFER')
    vm.lifecycleDialog!.targetUserId = largeUserId
    vm.opinionComment = '保留原任务责任'
    await vm.submitLifecycle()
    expect(transferTask).toHaveBeenCalledWith('task-001', {
      targetUserId: largeUserId,
      reason: '保留原任务责任',
    })

    vm.handleApprovalMore('DELEGATE')
    vm.lifecycleDialog!.targetUserId = largeUserId
    vm.opinionComment = '授权办理'
    await vm.submitLifecycle()
    expect(delegateTask).toHaveBeenCalledWith('task-001', {
      targetUserId: largeUserId,
      reason: '授权办理',
    })
  })

  it('W020: communication and add-sign submit exact ID strings and semantic fields', async () => {
    const wrapper = await mountActionable()
    const vm = wrapper.vm as unknown as ApprovalActionVm
    const firstId = '2113516346351312898'
    const secondId = '2113516346351312899'

    vm.handleApprovalMore('COMMUNICATE')
    vm.lifecycleDialog!.receivers = `${firstId},${secondId}`
    vm.lifecycleDialog!.message = '协同确认'
    await vm.submitLifecycle()
    expect(communicateTask).toHaveBeenCalledWith('task-001', {
      receivers: [firstId, secondId],
      message: '协同确认',
    })

    vm.opinionComment = ''
    vm.handleApprovalMore('ADD_SIGN')
    vm.lifecycleDialog!.participants = `${firstId},${secondId}`
    vm.lifecycleDialog!.mode = 'SERIAL'
    vm.lifecycleDialog!.signPosition = 'AFTER'
    await vm.submitLifecycle()
    expect(addSignTask).toHaveBeenCalledWith('task-001', {
      action: 'ADD_SIGN',
      participants: [firstId, secondId],
      mode: 'SERIAL',
      signPosition: 'AFTER',
    })
  })

  it('W020: lifecycle menu intersects permissions and server node allowedActions', async () => {
    const wrapper = await mountActionable({ allowedActions: ['TRANSFER', 'ADD_SIGN'] }, [
      'workflow:task:transfer',
      'workflow:task:delegate',
      'workflow:task:communicate',
    ])
    const vm = wrapper.vm as unknown as ApprovalActionVm

    expect(vm.approvalMoreActions.map((action) => action.command)).toEqual(['TRANSFER'])
  })

  it('W020: explicit empty allowedActions rejects every secondary action and supplement is not an active-task action', async () => {
    const wrapper = await mountActionable({ allowedActions: [] })
    const vm = wrapper.vm as unknown as ApprovalActionVm

    expect(vm.approvalMoreActions).toEqual([])
    expect(wrapper.find('[data-testid="approval-more-trigger"]').exists()).toBe(false)
    expect(wrapper.find('.detail-actions__btns').text()).not.toContain(
      i18n.global.t('common.approve'),
    )
    expect(wrapper.find('.detail-actions__btns').text()).not.toContain(
      i18n.global.t('common.reject'),
    )
    vm.handleApprovalMore('ADD_SIGN')
    expect(vm.lifecycleDialog).toBeNull()
  })

  it('W020: initiator without handle permission gets only Urge under More', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUserStore(pinia).setSession({
      user: {
        id: '1',
        username: 'initiator',
        displayName: '发起人',
        deptId: null,
        tenantId: null,
      },
      permissions: new Set<string>(),
      roles: new Set<string>(),
      superAdmin: false,
    })
    vi.mocked(queryTaskDetail).mockResolvedValueOnce({
      ...mockDetail,
      taskStatus: 'RUNNING',
      instanceStatus: 'RUNNING',
      canHandle: false,
    })
    const wrapper = mount(TaskDetailView, { global: { plugins: [i18n, pinia], stubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as ApprovalActionVm

    expect(vm.canAct).toBe(false)
    expect(vm.canUrge).toBe(true)
    expect(vm.approvalMoreActions).toEqual([
      expect.objectContaining({ command: 'URGE', divided: false }),
    ])
    expect(wrapper.find('[data-testid="approval-more-trigger"]').exists()).toBe(true)
    const directButtons = wrapper
      .find('.detail-actions__btns')
      .findAll('button')
      .map((button) => button.text())
    expect(directButtons).toEqual([i18n.global.t('common.moreActions')])
    expect(wrapper.text()).toContain(i18n.global.t('taskDetailUi.urgeAction'))
  })
})

// ═════════ P63 IoT 预约区块（实例维度查询 + v-perm 取消入口） ═════════

/** 预约单视图类型：类型查询拿到 iot 模块真实契约（不建立运行时/静态 import 依赖）。 */
type IotReservationView = import('@/adapters/iot-reservation').IotReservationView

/** 预约单视图行（形状对齐 iot 模块 IotReservationView 契约）。 */
function reservationRow(overrides: Partial<IotReservationView> = {}): IotReservationView {
  return {
    id: 9501,
    processInstanceId: 'pi-001',
    processDefKey: 'skeleton_approval',
    defVersion: 1,
    formKey: 'leave-request',
    recordId: 'fd_001',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'power_on',
    commandType: 'ACTION',
    payload: '{"switch":1}',
    dueAtUtc: '2026-10-07T01:30:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-07 09:30:00',
    lateWindowSeconds: 60,
    status: 'PENDING',
    commandId: null,
    rejectReason: null,
    cancelBy: null,
    cancelReason: null,
    cancelTime: null,
    createTime: '2026-10-06 09:00:00',
    ...overrides,
  }
}

interface ReservationVm {
  openCancelReservation: (row: unknown) => void
  submitCancelReservation: () => Promise<void>
  cancelReason: string
}

/** 挂载详情页并注入会话权限（permissionDirective 读 user store）。 */
async function mountWithPerms(permissionCodes: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia) // v-perm 指令经 activePinia 读权限，测试与组件必须同库
  useUserStore(pinia).setSession({
    user: {
      id: '2',
      username: 'approver',
      displayName: '审批人',
      deptId: null,
      tenantId: null,
    },
    permissions: new Set(permissionCodes),
    roles: new Set<string>(),
    superAdmin: false,
  })
  vi.mocked(queryTaskDetail).mockResolvedValue(mockDetail)
  const wrapper = mount(TaskDetailView, {
    global: { plugins: [i18n, pinia], stubs, directives: { perm: permissionDirective } },
  })
  await flushPromises()
  return wrapper
}

describe('TaskDetail P63 IoT 预约区块', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有预约数据时渲染预约卡：实例维度查询一次并展示状态/时间/时区/窗口', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([
      reservationRow(),
      reservationRow({
        id: 9502,
        status: 'DISPATCHED',
        commandId: 9302,
        dueLocalText: '2026-10-06 09:00:00',
      }),
    ])
    const wrapper = await mountWithPerms(['iot:reservation:cancel'])
    await flushPromises()

    expect(listReservationsByInstance).toHaveBeenCalledWith('pi-001')
    const card = wrapper.find('.detail-card--iot-reservations')
    expect(card.exists()).toBe(true)
    const text = card.text()
    expect(text).toContain('待触发')
    expect(text).toContain('已下发')
    expect(text).toContain('2026-10-07 09:30:00')
    expect(text).toContain('Asia/Shanghai')
    expect(text).toContain('60 秒')
    // commandId 有关联提示文本（与既有 IoT 命令页衔接）
    expect(text).toContain('命令 #9302')
  })

  it('无预约数据时不渲染预约卡', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([])
    const wrapper = await mountWithPerms(['iot:reservation:cancel'])
    await flushPromises()

    expect(wrapper.findAll('.detail-card--iot-reservations')).toHaveLength(0)
  })

  it('PENDING 且有 iot:reservation:cancel 权限时取消按钮可见；无权限时隐藏（v-perm fail closed）', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([reservationRow()])
    const allowed = await mountWithPerms(['iot:reservation:cancel'])
    await flushPromises()
    const visibleBtn = allowed.findAll('button').find((btn) => btn.text().includes('取消预约'))
    expect(visibleBtn).toBeTruthy()
    expect(visibleBtn!.element.style.display).not.toBe('none')

    vi.mocked(listReservationsByInstance).mockClear()
    vi.mocked(listReservationsByInstance).mockResolvedValue([reservationRow()])
    const denied = await mountWithPerms([])
    await flushPromises()
    const hiddenBtn = denied.findAll('button').find((btn) => btn.text().includes('取消预约'))
    // v-perm 指令以 display:none 隐藏受控入口（元素存在但不呈现）
    expect(hiddenBtn).toBeTruthy()
    expect(hiddenBtn!.element.style.display).toBe('none')
  })

  it('取消 outcome=CANCELED：成功提示并刷新预约列表', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([reservationRow()])
    vi.mocked(cancelReservation).mockResolvedValue('CANCELED')
    const wrapper = await mountWithPerms(['iot:reservation:cancel'])

    const vm = wrapper.vm as unknown as ReservationVm
    vm.openCancelReservation(reservationRow())
    vm.cancelReason = '审批被驳回，无需开机'
    await vm.submitCancelReservation()
    await flushPromises()

    expect(cancelReservation).toHaveBeenCalledWith(9501, '审批被驳回，无需开机')
    expect(ElMessage.success).toHaveBeenCalledWith('预约已取消')
    // 初始查询 + 取消后刷新
    expect(listReservationsByInstance).toHaveBeenCalledTimes(2)
  })

  it('取消 outcome=NOT_CANCELLABLE：提示不可取消并刷新，不提示成功', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([reservationRow()])
    vi.mocked(cancelReservation).mockResolvedValue('NOT_CANCELLABLE')
    const wrapper = await mountWithPerms(['iot:reservation:cancel'])

    const vm = wrapper.vm as unknown as ReservationVm
    vm.openCancelReservation(reservationRow())
    vm.cancelReason = '重复取消'
    await vm.submitCancelReservation()
    await flushPromises()

    expect(cancelReservation).toHaveBeenCalledWith(9501, '重复取消')
    expect(ElMessage.warning).toHaveBeenCalledWith('当前预约状态不可取消')
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(listReservationsByInstance).toHaveBeenCalledTimes(2)
  })

  it('取消原因为空白：提示必填且不调用取消接口', async () => {
    vi.mocked(listReservationsByInstance).mockResolvedValue([reservationRow()])
    const wrapper = await mountWithPerms(['iot:reservation:cancel'])

    const vm = wrapper.vm as unknown as ReservationVm
    vm.openCancelReservation(reservationRow())
    vm.cancelReason = '   '
    await vm.submitCancelReservation()
    await flushPromises()

    expect(cancelReservation).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请填写取消原因')
  })
})
