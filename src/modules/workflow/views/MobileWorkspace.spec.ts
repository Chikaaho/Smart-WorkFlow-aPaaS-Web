import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { i18n } from '@/locales'
import type { TaskDetail } from '@/contracts/bpm'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/modules/workflow/api', () => ({
  queryTodoTasks: vi.fn(),
  myDrafts: vi.fn(),
  myInstances: vi.fn(),
  acceptTaskAction: vi.fn(),
  pollCommandStatus: vi.fn(),
  queryTaskDetail: vi.fn(),
  getInstanceDetail: vi.fn(),
}))
vi.mock('@/adapters/form-runtime', () => ({
  getFormData: vi.fn(),
  getFormDefinition: vi.fn(),
  resolveReferenceDisplay: vi.fn(),
}))
vi.mock('@/adapters/org-dept', () => ({ listDeptTree: vi.fn() }))

import MobileWorkspace from './MobileWorkspace.vue'
import { queryTodoTasks, queryTaskDetail, acceptTaskAction } from '@/modules/workflow/api'
import { getFormData, getFormDefinition } from '@/adapters/form-runtime'
import { listDeptTree } from '@/adapters/org-dept'
import { ApiError } from '@/foundation/request'

const mounted: Array<{ unmount: () => void }> = []
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(queryTodoTasks).mockResolvedValue({
    list: [
      {
        taskId: 'task-1',
        processInstanceId: 'pi-1',
        processName: '灾备演练申请',
        formKey: 'drill',
        businessKey: 'record-1',
        createTime: '2026-10-23T09:00:00',
      },
    ],
    total: 1,
    pageNum: 1,
    pageSize: 20,
  })
  vi.mocked(queryTaskDetail).mockResolvedValue({
    taskId: 'task-1',
    taskName: '负责人审批',
    processName: '灾备演练申请',
    formKey: 'drill',
    businessKey: 'record-1',
    processInstanceId: 'pi-1',
    canHandle: false,
    initiatorName: '申请人',
    assigneeName: '审批人',
  } as TaskDetail)
  vi.mocked(getFormDefinition).mockResolvedValue({
    title: '演练',
    fields: [
      {
        name: 'kind',
        label: '演练类型',
        type: 'DICT',
        dictType: '',
        source: 'custom',
        options: [{ key: 'POWER_OUTAGE', value: '机房断电' }],
      },
      { name: 'depts', label: '参与部门', type: 'DEPT', multiple: true },
      {
        name: 'equipment',
        label: '设备清单',
        type: 'TABLE',
        subFields: [{ name: 'name', label: '设备名称', type: 'TEXT' }],
      },
      { name: 'files', label: '附件', type: 'ATTACHMENT' },
    ],
  })
  vi.mocked(listDeptTree).mockResolvedValue([
    {
      id: 'department-internal-id',
      name: '科技运营部',
      code: 'ops',
      parentId: '0',
      sort: 0,
      status: 0,
    },
  ])
  vi.mocked(getFormData).mockResolvedValue({
    id: 'record-1',
    kind: 'POWER_OUTAGE',
    depts: '["department-internal-id"]',
    equipment: [{ name: '主服务器' }],
    files: [{ storageKey: 'live-file', name: '演练方案.pdf' }],
  })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

async function open() {
  const w = mount(MobileWorkspace, { global: { plugins: [i18n], stubs: { teleport: true } } })
  mounted.push(w)
  await flushPromises()
  expect(w.find('.m-item-title').text()).toBe('灾备演练申请')
  await w.find('.m-item').trigger('click')
  await flushPromises()
  return w
}

describe('移动任务的业务表单回看', () => {
  it('显示实际业务名称与子表内容，附件保持同一记录上下文', async () => {
    const w = await open()
    expect(w.text()).toContain('机房断电')
    expect(w.text()).toContain('科技运营部')
    expect(w.text()).toContain('主服务器')
    expect(w.text()).not.toContain('department-internal-id')
    expect(w.text()).not.toContain('[object Object]')
    const file = w.findComponent({ name: 'AttachmentControl' })
    expect(file.props('recordId')).toBe('record-1')
    expect(file.props('formKey')).toBe('drill')
    expect(file.find('button').attributes('aria-label')).toBe('下载 演练方案.pdf')
    expect(acceptTaskAction).not.toHaveBeenCalled()
  })

  it('记录读取被拒绝时展示不可用反馈，不渲染附件读取入口', async () => {
    vi.mocked(getFormData).mockRejectedValueOnce(new ApiError(403, '无权查看记录'))
    const w = await open()
    expect(w.find('.m-empty-line').text()).toBe(i18n.global.t('workflow.formRecordUnavailable'))
    expect(w.findComponent({ name: 'AttachmentControl' }).exists()).toBe(false)
    expect(getFormDefinition).not.toHaveBeenCalled()
    expect(acceptTaskAction).not.toHaveBeenCalled()
  })
})
