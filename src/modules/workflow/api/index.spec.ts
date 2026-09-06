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

  it('acceptTaskAction sends POST /workflow/commands/tasks/{taskId}/{action}', async () => {
    mockRequest.mockResolvedValueOnce({
      commandId: 'cmd-1',
      commandKey: 'k',
      commandType: 'TASK_COMPLETE',
      channel: 'SYNC',
      status: 'ACCEPTED',
      duplicated: false,
    })
    await workflowApi.acceptTaskAction('task-001', 'complete', { comment: 'ok' })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/workflow/commands/tasks/task-001/complete',
      data: { comment: 'ok' },
    })
  })

  it('queryCommandStatus sends GET /workflow/commands/{commandId}', async () => {
    mockRequest.mockResolvedValueOnce({
      commandId: 'cmd-1',
      commandType: 'TASK_COMPLETE',
      channel: 'SYNC',
      status: 'COMPLETED',
      result: null,
      failureReason: null,
      retryCount: 0,
      createTime: '2026-07-17T10:00:00',
      finishedAt: '2026-07-17T10:00:01',
    })
    const result = await workflowApi.queryCommandStatus('cmd-1')
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/commands/cmd-1',
    })
    expect(result.status).toBe('COMPLETED')
  })

  it('pollCommandStatus returns the terminal status and stops polling', async () => {
    mockRequest
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'COMPLETED' })
      .mockResolvedValueOnce({ status: 'COMPLETED' })
    const result = await workflowApi.pollCommandStatus('cmd-1', { intervalMs: 1, maxAttempts: 5 })
    expect(result?.status).toBe('COMPLETED')
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it('pollCommandStatus returns null when terminal state never reached', async () => {
    // clearAllMocks 不清 once 队列，先重置实现避免上一用例残留的 COMPLETED
    mockRequest.mockReset()
    mockRequest.mockResolvedValue({ status: 'PENDING' })
    const result = await workflowApi.pollCommandStatus('cmd-1', { intervalMs: 1, maxAttempts: 3 })
    expect(result).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(3)
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

  it('myInstances sends GET /workflow/my/instances with pagination and filter', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await workflowApi.myInstances(
      { pageNum: 1, pageSize: 10 },
      { status: 'RUNNING', keyword: '请假' },
    )
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/my/instances',
      params: { pageNum: 1, pageSize: 10, status: 'RUNNING', keyword: '请假' },
    })
  })

  it('myDrafts sends GET /workflow/drafts with pagination', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await workflowApi.myDrafts({ pageNum: 2, pageSize: 5 })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/drafts',
      params: { pageNum: 2, pageSize: 5 },
    })
  })

  it('submitDraft sends POST /workflow/drafts/{id}/submit', async () => {
    mockRequest.mockResolvedValueOnce({
      commandId: 'cmd-9',
      commandKey: 'k9',
      commandType: 'DRAFT_SUBMIT',
      channel: 'ASYNC',
      status: 'ACCEPTED',
      duplicated: false,
    })
    const resp = await workflowApi.submitDraft(7)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/workflow/drafts/7/submit',
    })
    expect(resp.status).toBe('ACCEPTED')
  })

  it('myProcessed sends GET /workflow/my/processed with pagination and source filter', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await workflowApi.myProcessed({ pageNum: 1, pageSize: 10 }, { source: 'ACTION' })
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/my/processed',
      params: { pageNum: 1, pageSize: 10, source: 'ACTION' },
    })
  })

  it('getProcessNodeCapabilities fetches and strictly parses the registry contract', async () => {
    mockRequest.mockResolvedValueOnce([
      {
        type: 'START',
        displayName: '开始',
        description: '流程入口节点',
        category: 'EVENT',
        version: '1',
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
