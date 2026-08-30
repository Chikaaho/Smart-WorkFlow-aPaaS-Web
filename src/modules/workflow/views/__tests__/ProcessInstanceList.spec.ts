import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProcessInstanceList from '../ProcessInstanceList.vue'
import type { ProcessInstance } from '@/contracts/bpm'

// ─── Mock BPMN viewer (must be before vi.mock calls due to hoisting) ───
const mockViewerInstance = vi.hoisted(() => ({
  destroy: vi.fn(),
  fitViewport: vi.fn(),
  highlight: vi.fn(),
  clearHighlight: vi.fn(),
}))

// ─── Mock API ───
const mockQueryInstances = vi.hoisted(() => vi.fn())
const mockGetInstanceDetail = vi.hoisted(() => vi.fn())
const mockPageProcessDefs = vi.hoisted(() => vi.fn())
const mockGetProcessDefGraph = vi.hoisted(() => vi.fn())

vi.mock('@/modules/workflow/api', () => ({
  queryInstances: (...args: unknown[]) => mockQueryInstances(...args),
  getInstanceDetail: (...args: unknown[]) => mockGetInstanceDetail(...args),
  pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  getProcessDefGraph: (...args: unknown[]) => mockGetProcessDefGraph(...args),
}))

vi.mock('@/adapters/bpmn', () => ({
  mountBpmnViewer: vi.fn().mockResolvedValue(mockViewerInstance),
}))

// ─── Mock StandardListTemplate（浅 stub：只渲染 slot 内容，绕过其内部复杂子组件） ───
vi.mock('@/components/page-layout', () => ({
  StandardListTemplate: {
    name: 'StandardListTemplate',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
    template: `<div class="mock-standard-list">
      <slot name="filter" />
      <slot />
      <slot name="empty-action" />
    </div>`,
  },
}))

// ─── 测试夹具 ───
const MOCK_LIST: ProcessInstance[] = [
  {
    id: 1,
    processInstanceId: 'proc-001',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-001',
    formKey: 'leave-request',
    initiatorId: 1,
    status: 'RUNNING',
    createTime: '2026-07-20T09:30:00',
  },
  {
    id: 2,
    processInstanceId: 'proc-002',
    processDefKey: 'skeleton_approval',
    processName: '单节点审批流程',
    businessKey: 'rec-002',
    formKey: 'it_application',
    initiatorId: 2,
    status: 'APPROVED',
    createTime: '2026-07-15T14:00:00',
  },
]

const MOCK_DETAIL = {
  ...MOCK_LIST[0],
  activeNodeIds: ['Activity_approve1'],
  flowTrace: [
    {
      activityId: 'StartEvent_1',
      activityName: '开始',
      activityType: 'startEvent',
      startTime: '2026-07-20T09:30:00',
      endTime: '2026-07-20T09:30:00',
      assignee: null,
      taskId: null,
    },
    {
      activityId: 'Activity_submit',
      activityName: '提交申请',
      activityType: 'userTask',
      startTime: '2026-07-20T09:30:00',
      endTime: '2026-07-20T10:15:00',
      assignee: '1',
      taskId: 'task-001',
    },
    {
      activityId: 'Activity_approve1',
      activityName: '部门经理审批',
      activityType: 'userTask',
      startTime: '2026-07-20T10:15:00',
      endTime: null,
      assignee: '2',
      taskId: 'task-002',
    },
  ],
}

function createWrapper() {
  return mount(ProcessInstanceList, {
    global: {
      stubs: {
        // 不 stub Element Plus 组件——让它们正常渲染（el-table 在 jsdom 中降级为普通 table）
        'el-drawer': {
          template: '<div v-if="modelValue" class="mock-drawer"><slot /></div>',
          props: ['modelValue', 'title', 'size', 'destroyOnClose', 'closeOnClickModal'],
        },
      },
    },
  })
}

describe('ProcessInstanceList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 mock：列表 + 流程定义 map + BPMN XML 均成功
    mockPageProcessDefs.mockResolvedValue({
      list: [
        {
          id: 1,
          processKey: 'leave_approval',
          name: '请假审批流程',
          formKey: 'leave-request',
          defVersion: 1,
          status: 'PUBLISHED',
          createTime: '',
          updateTime: '',
        },
        {
          id: 2,
          processKey: 'skeleton_approval',
          name: '单节点审批流程',
          formKey: 'it_application',
          defVersion: 1,
          status: 'PUBLISHED',
          createTime: '',
          updateTime: '',
        },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 100,
    })
    mockGetProcessDefGraph.mockResolvedValue('<definitions />')
  })

  // ────────────────────────────────────────────
  // 列表
  // ────────────────────────────────────────────

  it('挂载后加载实例列表并渲染表格行', async () => {
    mockQueryInstances.mockResolvedValue({
      list: MOCK_LIST,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    // 列表应包含 2 条记录
    expect(mockQueryInstances).toHaveBeenCalledTimes(1)
    const rows = wrapper.findAll('.el-table__body tbody tr')
    expect(rows.length).toBe(2)
  })

  it('API 报错时显示错误提示', async () => {
    mockQueryInstances.mockRejectedValue({ msg: '服务器内部错误' })

    const wrapper = createWrapper()
    // 等待异步操作完成（mock resolver/rejector）
    await new Promise((r) => setTimeout(r, 100))
    await nextTick()

    expect(wrapper.find('.el-alert--error').exists()).toBe(true)
  })

  // ────────────────────────────────────────────
  // 详情抽屉
  // ────────────────────────────────────────────

  it('点击"查看详情"打开抽屉并显示实例基本信息', async () => {
    mockQueryInstances.mockResolvedValue({
      list: MOCK_LIST,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    mockGetInstanceDetail.mockResolvedValue(MOCK_DETAIL)

    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    // 点击第一行的"查看详情"按钮
    const btn = wrapper.find('.el-table__body tbody tr:first-child .el-button')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')

    // 等待异步加载
    await new Promise((r) => setTimeout(r, 100))
    await nextTick()

    // 应调用详情 API
    expect(mockGetInstanceDetail).toHaveBeenCalledWith('proc-001')
    // 应调用 getProcessDefGraph
    expect(mockGetProcessDefGraph).toHaveBeenCalled()
  })

  it('实例不存在时 drawer 内显示错误', async () => {
    mockQueryInstances.mockResolvedValue({
      list: MOCK_LIST,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    // 实例不存在：API 抛 ApiError(code=404)
    const notFoundError = new Error('流程实例不存在') as Error & { msg: string; code: number }
    notFoundError.msg = '流程实例不存在'
    notFoundError.code = 404
    mockGetInstanceDetail.mockRejectedValue(notFoundError)

    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const btn = wrapper.find('.el-table__body tbody tr:first-child .el-button')
    await btn.trigger('click')

    await new Promise((r) => setTimeout(r, 100))
    await nextTick()

    // drawer 内应显示错误 alert
    const drawerError = wrapper.find('.mock-drawer .el-alert--error')
    expect(drawerError.exists()).toBe(true)
  })
})
