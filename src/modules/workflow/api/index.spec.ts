import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRequest = vi.fn()

vi.mock('@/foundation/request', () => ({
  request: <T>(config: unknown): Promise<T> => mockRequest(config),
}))

const workflowApi = await import('./index')

describe('modules/workflow/api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queryTodoTasks sends GET /workflow/tasks/todo with pagination and adapts records→list', async () => {
    const mockRecords = [
      {
        taskId: 't1',
        processInstanceId: 'p1',
        processName: '单节点审批',
        formKey: 'leave-request',
        businessKey: 'fd_001',
        createTime: '2026-07-17T10:00:00',
      },
    ]
    mockRequest.mockResolvedValueOnce({
      records: mockRecords,
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const result = await workflowApi.queryTodoTasks({ pageNum: 1, pageSize: 10 })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/tasks/todo',
      params: { pageNum: 1, pageSize: 10 },
    })
    expect(result.list).toHaveLength(1)
    expect(result.list[0].processName).toBe('单节点审批')
    expect(result.total).toBe(1)
  })

  it('queryTaskDetail sends GET /workflow/tasks/{taskId}', async () => {
    const mockDetail = {
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
      approvalHistory: [],
    }
    mockRequest.mockResolvedValueOnce(mockDetail)
    const result = await workflowApi.queryTaskDetail('task-001')
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/tasks/task-001',
    })
    expect(result.taskId).toBe('task-001')
    expect(result.processVariables).toEqual({ formKey: 'leave-request', amount: 5000 })
  })

  it('completeTask sends POST /workflow/tasks/{taskId}/complete', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await workflowApi.completeTask('task-001')
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/workflow/tasks/task-001/complete',
    })
  })

  it('rejectTask sends POST /workflow/tasks/{taskId}/reject', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await workflowApi.rejectTask('task-001')
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/workflow/tasks/task-001/reject',
    })
  })

  it('queryProcessedTasks sends GET /workflow/tasks/processed with pagination', async () => {
    const mockRecords = [
      {
        taskId: 't1',
        taskName: '审批',
        processInstanceId: 'pi-001',
        processName: '单节点审批',
        formKey: 'leave-request',
        businessKey: 'fd_001',
        createTime: '2026-07-16T10:00:00',
        endTime: '2026-07-16T11:00:00',
      },
    ]
    mockRequest.mockResolvedValueOnce({
      records: mockRecords,
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const result = await workflowApi.queryProcessedTasks({ pageNum: 1, pageSize: 10 })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/tasks/processed',
      params: { pageNum: 1, pageSize: 10 },
    })
    expect(result.list).toHaveLength(1)
    expect(result.list[0].endTime).toBe('2026-07-16T11:00:00')
    expect(result.total).toBe(1)
  })

  it('pageProcessDefs sends GET /workflow/defs and adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [
        {
          id: 1,
          processKey: 'sk',
          name: 'N',
          formKey: 'fk',
          defVersion: 1,
          status: 'PUBLISHED',
          createTime: '',
          updateTime: '',
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const result = await workflowApi.pageProcessDefs({ pageNum: 1, pageSize: 10 })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/defs',
      params: { pageNum: 1, pageSize: 10 },
    })
    expect(result.list).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('pageProcessDefs forwards formKey filter param when provided (P52)', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })

    await workflowApi.pageProcessDefs({ pageNum: 1, pageSize: 10 }, 'leave-request')

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/defs',
      params: { pageNum: 1, pageSize: 10, formKey: 'leave-request' },
    })
  })

  it('pageProcessDefs omits formKey param when not provided', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })

    await workflowApi.pageProcessDefs({ pageNum: 1, pageSize: 10 }, undefined)

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/defs',
      params: { pageNum: 1, pageSize: 10 },
    })
  })

  it('getProcessNodeCapabilities fetches and strictly parses the registry contract', async () => {
    mockRequest.mockResolvedValueOnce([
      {
        type: 'START',
        displayName: '开始',
        description: '流程入口节点',
        category: 'EVENT',
        version: 'p57-v1',
        topology: { minIncoming: 0, maxIncoming: 0, minOutgoing: 1, maxOutgoing: 1 },
        configFields: [],
        supports: { design: true, save: true, publish: true, run: true },
      },
    ])

    const result = await workflowApi.getProcessNodeCapabilities()

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: workflowApi.PROCESS_NODE_CAPABILITIES_URL,
    })
    expect(result[0]?.type).toBe('START')
  })
})
