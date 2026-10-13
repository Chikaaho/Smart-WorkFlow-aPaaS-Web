import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/modules/workflow/api', () => ({
  queryInstances: vi.fn(),
  getInstanceDetail: vi.fn(),
  getProcessDefDefinitionByKey: vi.fn(),
}))

vi.mock('@/modules/workflow/api/p64', () => ({
  listActionRefs: vi.fn(),
  listTriggerExecs: vi.fn(),
  retryActionRef: vi.fn(),
  listChildBatches: vi.fn(),
  retryChildWriteback: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import { ElMessage } from 'element-plus'
import {
  queryInstances,
  getInstanceDetail,
  getProcessDefDefinitionByKey,
} from '@/modules/workflow/api'
import {
  listActionRefs,
  listChildBatches,
  listTriggerExecs,
  retryActionRef,
} from '@/modules/workflow/api/p64'
import { ApiError } from '@/foundation/request'
import type { InstanceDetail, ProcessInstance } from '@/contracts/bpm'
import type { ActionRefView } from '@/contracts/p64'
import ProcessInstanceList from './ProcessInstanceList.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="toolbar-actions"/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  ListActionsColumn: { template: '<div/>', props: ['actions'] },
  ProcessGraphView: { template: '<div/>', props: ['graph', 'trace'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
  'el-tag': { template: '<span><slot/></span>', props: ['type'] },
  'el-drawer': {
    template: '<div v-if="modelValue"><slot/></div>',
    props: ['modelValue'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-select': { template: '<div/>', props: ['modelValue'] },
  'el-option': { template: '<div/>', props: ['label', 'value'] },
  'el-input': { template: '<div/>', props: ['modelValue'] },
  'el-empty': { template: '<div/>', props: ['description'] },
  'el-descriptions': { template: '<div><slot/></div>', props: ['column'] },
  'el-descriptions-item': { template: '<div><slot/></div>' },
}

const mockInstance: ProcessInstance = {
  id: 1,
  processInstanceId: 'proc-retry-001',
  processDefKey: 'leave_approval',
  processName: '请假审批流程',
  businessKey: 'rec-leave-001',
  formKey: 'leave-request',
  initiatorId: 1,
  status: 'APPROVED',
  createTime: '2026-10-09T21:51:49',
}

const mockDetail: InstanceDetail = {
  ...mockInstance,
  activeNodeIds: [],
  flowTrace: [
    {
      activityId: 'node_1',
      activityName: '提交',
      activityType: 'userTask',
      startTime: '2026-10-09T21:51:49',
      endTime: '2026-10-09T21:57:18',
      assignee: '1',
      taskId: 'task-1',
    },
  ],
}

/** STARTING = FLOW_START 失败/过期窗口（复审05 P1-06b 新恢复入口） */
const refStarting: ActionRefView = {
  id: 9,
  execId: 3,
  processInstanceId: 'proc-retry-001',
  triggerId: 'tg_auto',
  actionId: 'a1',
  actionType: 'START_SINGLE',
  itemKey: 'a1#1',
  commandKey: 'FLOW_START:4098734d',
  targetDefKey: 'leave_approval',
  targetRecordId: 'rec-target-1',
  status: 'STARTING',
}

const refStarted: ActionRefView = { ...refStarting, id: 10, status: 'STARTED' }

async function mountWithDrawer() {
  const wrapper = mount(ProcessInstanceList, { global: { stubs } })
  await flushPromises()
  const vm = wrapper.vm as unknown as { openDrawer: (r: ProcessInstance) => Promise<void> }
  await vm.openDrawer(mockInstance)
  await flushPromises()
  return wrapper
}

describe('ProcessInstanceList.vue 动作意图恢复入口（复审06/提示05 P1-08a-W）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queryInstances).mockResolvedValue({
      list: [mockInstance],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(getInstanceDetail).mockResolvedValue(mockDetail)
    vi.mocked(getProcessDefDefinitionByKey).mockResolvedValue({
      processKey: 'leave_approval',
      name: '请假审批流程',
      formKey: 'leave-request',
      version: 1,
      elements: [],
      canvas: {},
    })
    vi.mocked(listTriggerExecs).mockResolvedValue([])
    vi.mocked(listChildBatches).mockResolvedValue([])
    vi.mocked(listActionRefs).mockResolvedValue([refStarting, refStarted])
  })

  it('STARTING/FAILED 行经恢复入口调用真实重试 API，成功后刷新动作链并透出后端消息', async () => {
    vi.mocked(retryActionRef).mockResolvedValue({
      status: 'RECOVERY_ENQUEUED',
      message: '恢复命令已入队',
    })
    const wrapper = await mountWithDrawer()
    const vm = wrapper.vm as unknown as {
      handleRetryActionRef: (id: number) => Promise<void>
    }

    await vm.handleRetryActionRef(9)
    await flushPromises()

    expect(retryActionRef).toHaveBeenCalledTimes(1)
    expect(retryActionRef).toHaveBeenCalledWith(9)
    expect(ElMessage.success).toHaveBeenCalledWith('恢复命令已入队')
    // openDrawer 首次加载 + 重试成功后刷新
    expect(listActionRefs).toHaveBeenCalledTimes(2)
    expect(listActionRefs).toHaveBeenLastCalledWith('proc-retry-001')
  })

  it('重试失败透出后端可诊断消息，不重载动作链', async () => {
    vi.mocked(retryActionRef).mockRejectedValue(new ApiError(2402, '动作意图已成功启动，无需重试'))
    const wrapper = await mountWithDrawer()
    const vm = wrapper.vm as unknown as {
      handleRetryActionRef: (id: number) => Promise<void>
    }

    await vm.handleRetryActionRef(10)
    await flushPromises()

    expect(retryActionRef).toHaveBeenCalledWith(10)
    expect(ElMessage.error).toHaveBeenCalledWith('动作意图已成功启动，无需重试')
    expect(listActionRefs).toHaveBeenCalledTimes(1)
  })

  it('进行中的重试互斥：同一时刻只允许一次在途恢复请求', async () => {
    let resolveRetry!: (value: Record<string, unknown>) => void
    vi.mocked(retryActionRef).mockImplementation(
      () => new Promise((resolve) => (resolveRetry = resolve)),
    )
    const wrapper = await mountWithDrawer()
    const vm = wrapper.vm as unknown as {
      handleRetryActionRef: (id: number) => Promise<void>
    }

    const first = vm.handleRetryActionRef(9)
    await vm.handleRetryActionRef(9)
    resolveRetry({ status: 'RECOVERY_ENQUEUED' })
    await first
    await flushPromises()

    expect(retryActionRef).toHaveBeenCalledTimes(1)
  })
})
