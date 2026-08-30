import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRequest = vi.fn()

vi.mock('@/foundation/request', () => ({
  request: <T>(config: unknown): Promise<T> => mockRequest(config),
}))

const jobApi = await import('./index')

// ─── 测试数据工厂 ───

function makeJobInfo(
  overrides: Partial<import('@/contracts/job').JobInfo> = {},
): import('@/contracts/job').JobInfo {
  return {
    id: 1,
    jobName: '测试任务',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0/30 * * * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 0,
    description: '测试描述',
    beanName: 'testHandler',
    flowDefKey: undefined,
    lastFireTime: '2026-07-21T10:00:00',
    nextFireTime: '2026-07-21T10:00:30',
    createTime: '2026-07-20T00:00:00',
    updateTime: '2026-07-20T00:00:00',
    createBy: 1,
    updateBy: 1,
    ...overrides,
  }
}

function makeJobLog(
  overrides: Partial<import('@/contracts/job').JobLog> = {},
): import('@/contracts/job').JobLog {
  return {
    id: 1,
    jobId: 1,
    jobName: '测试任务',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:05',
    duration: 5000,
    resultMsg: '执行成功',
    createTime: '2026-07-21T10:00:05',
    ...overrides,
  }
}

function makeBackendPage<T>(records: T[], total: number, pageNum: number, pageSize: number) {
  return { records, total, pageNum, pageSize }
}

// ═══════════════════════════════════════

describe('modules/job/api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── pageJobInfos ───

  describe('pageJobInfos', () => {
    it('POST /job/info/page with params + body, adapts backend Page → PageResult', async () => {
      const job = makeJobInfo()
      mockRequest.mockResolvedValueOnce(makeBackendPage([job], 100, 1, 10))

      const result = await jobApi.pageJobInfos(1, 10, { jobName: '测试' })

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info/page',
        params: { pageNum: 1, pageSize: 10 },
        data: { jobName: '测试' },
      })
      expect(result.list).toHaveLength(1)
      expect(result.list[0].jobName).toBe('测试任务')
      expect(result.total).toBe(100)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(10)
    })

    it('passes undefined query body when no filter provided', async () => {
      const job = makeJobInfo()
      mockRequest.mockResolvedValueOnce(makeBackendPage([job], 50, 2, 20))

      const result = await jobApi.pageJobInfos(2, 20)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info/page',
        params: { pageNum: 2, pageSize: 20 },
        data: undefined,
      })
      expect(result.list).toHaveLength(1)
    })

    it('returns empty list when no jobs', async () => {
      mockRequest.mockResolvedValueOnce(makeBackendPage([], 0, 1, 10))

      const result = await jobApi.pageJobInfos(1, 10)
      expect(result.list).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  // ─── getJobInfo ───

  describe('getJobInfo', () => {
    it('GET /job/info/{id} → JobInfo', async () => {
      const job = makeJobInfo()
      mockRequest.mockResolvedValueOnce(job)

      const result = await jobApi.getJobInfo(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/job/info/1',
      })
      expect(result).toEqual(job)
    })
  })

  // ─── createJobInfo ───

  describe('createJobInfo', () => {
    it('POST /job/info with body → returns new job id', async () => {
      mockRequest.mockResolvedValueOnce(42)

      const data = makeJobInfo()
      const result = await jobApi.createJobInfo(data)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info',
        data,
      })
      expect(result).toBe(42)
    })
  })

  // ─── updateJobInfo ───

  describe('updateJobInfo', () => {
    it('PUT /job/info with body → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      const data = makeJobInfo()
      await jobApi.updateJobInfo(data)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'PUT',
        url: '/job/info',
        data,
      })
    })
  })

  // ─── deleteJobInfo ───

  describe('deleteJobInfo', () => {
    it('DELETE /job/info/{id} → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      await jobApi.deleteJobInfo(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/job/info/1',
      })
    })
  })

  // ─── pauseJob ───

  describe('pauseJob', () => {
    it('POST /job/info/{id}/pause → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      await jobApi.pauseJob(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info/1/pause',
      })
    })
  })

  // ─── resumeJob ───

  describe('resumeJob', () => {
    it('POST /job/info/{id}/resume → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      await jobApi.resumeJob(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info/1/resume',
      })
    })
  })

  // ─── triggerJob ───

  describe('triggerJob', () => {
    it('POST /job/info/{id}/trigger → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      await jobApi.triggerJob(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/info/1/trigger',
      })
    })
  })

  // ─── pageJobLogs ───

  describe('pageJobLogs', () => {
    it('POST /job/log/page?jobId=&pageNum=&pageSize=, adapts backend Page', async () => {
      const log = makeJobLog()
      mockRequest.mockResolvedValueOnce(makeBackendPage([log], 30, 1, 10))

      const result = await jobApi.pageJobLogs(1, 1, 10)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/job/log/page',
        params: { jobId: 1, pageNum: 1, pageSize: 10 },
      })
      expect(result.list).toHaveLength(1)
      expect(result.list[0].execStatus).toBe('SUCCESS')
      expect(result.total).toBe(30)
    })

    it('returns empty list when no logs for given job', async () => {
      mockRequest.mockResolvedValueOnce(makeBackendPage([], 0, 1, 10))

      const result = await jobApi.pageJobLogs(999, 1, 10)
      expect(result.list).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  // ─── getJobLog ───

  describe('getJobLog', () => {
    it('GET /job/log/{id} → JobLog', async () => {
      const log = makeJobLog()
      mockRequest.mockResolvedValueOnce(log)

      const result = await jobApi.getJobLog(1)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/job/log/1',
      })
      expect(result).toEqual(log)
    })
  })
})
