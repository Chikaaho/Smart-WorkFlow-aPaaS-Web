import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/workflow/api', () => ({
  myInstances: vi.fn(),
  myInstanceDetail: vi.fn(),
  supplementSignInstance: vi.fn(),
}))

// 流程面板经异步组件接缝懒加载；本文件只验证列表/详情弹窗行为，
// 用静态桩隔离动态 import，避免测试环境拆除时仍在加载造成 teardown 竞态。
vi.mock('@/adapters/instance-flow', () => ({
  InstanceFlowPanel: {
    name: 'InstanceFlowPanel',
    template: '<div class="instance-flow-panel-stub" />',
  },
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

import { myInstances, myInstanceDetail, supplementSignInstance } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessInstance, MyInstanceDetail } from '@/contracts/bpm'
import { useUserStore } from '@/stores/user'
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
  'el-option': true,
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': {
    template: '<div class="stub-form-item"><slot/></div>',
    props: ['label', 'required'],
  },
  UserRemoteSelect: {
    template: '<div class="stub-user-remote-select" />',
    props: ['modelValue', 'multiple', 'placeholder'],
    emits: ['update:modelValue'],
  },
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

const terminalInstance: ProcessInstance = {
  ...mockInstance,
  status: 'APPROVED',
}

const terminalDetail: MyInstanceDetail = {
  ...mockDetail,
  instance: terminalInstance,
  status: 'APPROVED',
  progress: [],
  history: [
    {
      taskId: 'task-submit-001',
      taskName: '提交申请',
      nodeKey: 'Activity_submit',
      assignee: '1',
      createTime: '2026-07-20T09:30:00',
      endTime: '2026-07-20T10:15:00',
      action: 'APPROVE',
      approvalResult: 'APPROVED',
    },
    {
      taskId: 'task-approve1-001',
      taskName: '部门经理审批',
      nodeKey: 'Activity_approve1',
      assignee: '2',
      createTime: '2026-07-20T10:16:00',
      endTime: '2026-07-20T10:30:00',
      action: 'APPROVE',
      approvalResult: 'APPROVED',
    },
  ],
}

interface SupplementVm {
  rowActions: (row: unknown) => Array<{ key: string; visible?: boolean }>
  supplementVisible: boolean
  supplementLoading: boolean
  supplementNodeKey: string
  supplementNodeOptions: Array<{ nodeKey: string; label: string }>
  supplementParticipants: string[]
  supplementMessage: string
  supplementError: string
  openSupplement: (row: ProcessInstance) => Promise<void>
  submitSupplement: () => Promise<void>
}

describe('MyInstances.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(myInstances).mockResolvedValue(mockPage)
    vi.mocked(myInstanceDetail).mockResolvedValue(mockDetail)
    vi.mocked(supplementSignInstance).mockResolvedValue(undefined)
  })

  function sessionPinia(permissionCodes: string[]) {
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
      permissions: new Set(permissionCodes),
      roles: new Set<string>(),
      superAdmin: false,
    })
    return pinia
  }

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

  it('详情改为统一弹窗打开：保留表单与流程详情，不再跳转整页', async () => {
    vi.mocked(myInstances).mockResolvedValueOnce(mockPage)
    vi.mocked(myInstanceDetail).mockResolvedValueOnce(mockDetail)
    const wrapper = mount(MyInstances, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { openDetail: (r: ProcessInstance) => Promise<void> }
    ).openDetail(mockInstance)
    await nextTick()

    expect(myInstanceDetail).toHaveBeenCalledWith(1)
    expect(mockPush).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as { detail: MyInstanceDetail | null }).detail).toEqual(
      mockDetail,
    )
    expect((wrapper.vm as unknown as { detailVisible: boolean }).detailVisible).toBe(true)
  })

  it('无表单绑定的实例同样使用统一弹窗', async () => {
    vi.mocked(myInstances).mockResolvedValueOnce(mockPage)
    const unbound = { ...mockDetail, formKey: '', businessKey: '' }
    vi.mocked(myInstanceDetail).mockResolvedValueOnce(unbound)
    const wrapper = mount(MyInstances, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { openDetail: (r: ProcessInstance) => Promise<void> }
    ).openDetail(mockInstance)
    await nextTick()

    expect(mockPush).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as { detail: MyInstanceDetail | null }).detail).toEqual(unbound)
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

  it('补签入口仅对终态实例和 workflow:task:add-sign 权限可见', async () => {
    const allowedPinia = sessionPinia(['workflow:task:add-sign'])
    const allowed = mount(MyInstances, { global: { plugins: [allowedPinia], stubs } })
    await flushPromises()
    const allowedActions = (allowed.vm as unknown as SupplementVm).rowActions(terminalInstance)
    expect(allowedActions.find((action) => action.key === 'supplement')?.visible).toBe(true)
    expect(
      (allowed.vm as unknown as SupplementVm)
        .rowActions(mockInstance)
        .find((action) => action.key === 'supplement')?.visible,
    ).toBe(false)

    const deniedPinia = sessionPinia([])
    const denied = mount(MyInstances, { global: { plugins: [deniedPinia], stubs } })
    await flushPromises()
    expect(
      (denied.vm as unknown as SupplementVm)
        .rowActions(terminalInstance)
        .find((action) => action.key === 'supplement')?.visible,
    ).toBe(false)
  })

  it('补签打开时读取实例历史节点，默认选择最后一个可补签节点', async () => {
    vi.mocked(myInstanceDetail).mockResolvedValueOnce(terminalDetail)
    const pinia = sessionPinia(['workflow:task:add-sign'])
    const wrapper = mount(MyInstances, { global: { plugins: [pinia], stubs } })
    await flushPromises()

    const vm = wrapper.vm as unknown as SupplementVm
    await vm.openSupplement(terminalInstance)
    await flushPromises()

    expect(myInstanceDetail).toHaveBeenCalledWith(1)
    expect(vm.supplementVisible).toBe(true)
    expect(vm.supplementLoading).toBe(false)
    expect(vm.supplementNodeOptions).toEqual([
      { nodeKey: 'Activity_submit', label: '提交申请' },
      { nodeKey: 'Activity_approve1', label: '部门经理审批' },
    ])
    expect(vm.supplementNodeKey).toBe('Activity_approve1')
  })

  it('补签提交保留 64 位人员 ID 字符串、节点与说明，成功后刷新列表', async () => {
    vi.mocked(myInstanceDetail).mockResolvedValueOnce(terminalDetail)
    const pinia = sessionPinia(['workflow:task:add-sign'])
    const wrapper = mount(MyInstances, { global: { plugins: [pinia], stubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as SupplementVm
    await vm.openSupplement(terminalInstance)
    await flushPromises()

    vm.supplementParticipants = ['2113516346351312898', '2113516346351312899']
    vm.supplementMessage = '补充确认原审批结果'
    await vm.submitSupplement()
    await flushPromises()

    expect(supplementSignInstance).toHaveBeenCalledWith('proc-001', {
      participants: ['2113516346351312898', '2113516346351312899'],
      nodeKey: 'Activity_approve1',
      comment: '补充确认原审批结果',
    })
    expect(vm.supplementVisible).toBe(false)
    expect(myInstances).toHaveBeenCalledTimes(2)
  })

  it('没有历史节点时不提交补签', async () => {
    vi.mocked(myInstanceDetail).mockResolvedValueOnce({
      ...terminalDetail,
      progress: [],
      history: [],
    })
    const pinia = sessionPinia(['workflow:task:add-sign'])
    const wrapper = mount(MyInstances, { global: { plugins: [pinia], stubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as SupplementVm

    await vm.openSupplement(terminalInstance)
    await flushPromises()
    vm.supplementParticipants = ['2113516346351312898']
    await vm.submitSupplement()

    expect(vm.supplementNodeOptions).toEqual([])
    expect(vm.supplementError).toBe('未找到可补签的历史节点')
    expect(supplementSignInstance).not.toHaveBeenCalled()
  })
})
