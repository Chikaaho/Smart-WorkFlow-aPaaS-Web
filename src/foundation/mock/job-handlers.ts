/**
 * 定时任务 mock：任务信息与执行日志。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { MOCK_JOB_INFOS, MOCK_JOB_LOGS } from './seeds'
import type { MockRegistration } from './mock-shared'

export const jobMockRegistrations: MockRegistration[] = [
  // POST /api/job/info/page — 分页查询（支持 jobName/status/jobType 筛选）
  {
    method: 'POST',
    pattern: '/api/job/info/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_JOB_INFOS]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.jobName) list = list.filter((j) => j.jobName.includes(String(f.jobName)))
        if (f.status) list = list.filter((j) => j.status === String(f.status))
        if (f.jobType) list = list.filter((j) => j.jobType === String(f.jobType))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  // GET /api/job/info/:id — 查询单个任务
  {
    method: 'GET',
    pattern: '/api/job/info/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      return { code: 0, message: 'ok', data: { ...job } }
    },
  },
  // POST /api/job/info — 创建任务
  {
    method: 'POST',
    pattern: '/api/job/info',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = MOCK_JOB_INFOS.length > 0 ? Math.max(...MOCK_JOB_INFOS.map((j) => j.id)) + 1 : 1
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const newJob = {
        id,
        jobName: String(data.jobName ?? ''),
        jobGroup: String(data.jobGroup ?? 'DEFAULT'),
        jobType: (data.jobType as 'BEAN' | 'FLOW') ?? 'BEAN',
        cronExpression: String(data.cronExpression ?? ''),
        status: (data.status as 'NORMAL' | 'PAUSED') ?? 'NORMAL',
        concurrent: Boolean(data.concurrent ?? false),
        misfirePolicy: Number(data.misfirePolicy ?? 0),
        description: String(data.description ?? ''),
        beanName: data.beanName ? String(data.beanName) : null,
        beanParams: data.beanParams ? String(data.beanParams) : null,
        flowDefKey: data.flowDefKey ? String(data.flowDefKey) : null,
        formData: data.formData ? String(data.formData) : null,
        lastFireTime: null,
        nextFireTime: null,
        createTime: now,
        updateTime: now,
        createBy: 1,
        updateBy: 1,
      }
      MOCK_JOB_INFOS.push(newJob as (typeof MOCK_JOB_INFOS)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  // PUT /api/job/info — 更新任务
  {
    method: 'PUT',
    pattern: '/api/job/info',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_JOB_INFOS.findIndex((j) => j.id === Number(data.id))
      if (idx === -1) return { code: 404, message: '任务不存在', data: null }
      const existing = MOCK_JOB_INFOS[idx]
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      MOCK_JOB_INFOS[idx] = {
        ...existing,
        jobName: data.jobName !== undefined ? String(data.jobName) : existing.jobName,
        jobGroup: data.jobGroup !== undefined ? String(data.jobGroup) : existing.jobGroup,
        jobType: data.jobType !== undefined ? (data.jobType as 'BEAN' | 'FLOW') : existing.jobType,
        cronExpression:
          data.cronExpression !== undefined ? String(data.cronExpression) : existing.cronExpression,
        status: data.status !== undefined ? (data.status as 'NORMAL' | 'PAUSED') : existing.status,
        concurrent: data.concurrent !== undefined ? Boolean(data.concurrent) : existing.concurrent,
        misfirePolicy:
          data.misfirePolicy !== undefined ? Number(data.misfirePolicy) : existing.misfirePolicy,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        beanName:
          data.beanName !== undefined
            ? data.beanName
              ? String(data.beanName)
              : null
            : existing.beanName,
        beanParams:
          data.beanParams !== undefined
            ? data.beanParams
              ? String(data.beanParams)
              : null
            : existing.beanParams,
        flowDefKey:
          data.flowDefKey !== undefined
            ? data.flowDefKey
              ? String(data.flowDefKey)
              : null
            : existing.flowDefKey,
        formData:
          data.formData !== undefined
            ? data.formData
              ? String(data.formData)
              : null
            : existing.formData,
        updateTime: now,
        updateBy: 1,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/job/info/:id — 删除任务（幂等）
  {
    method: 'DELETE',
    pattern: '/api/job/info/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_JOB_INFOS.findIndex((j) => j.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_JOB_INFOS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/job/info/:id/pause — 暂停任务
  {
    method: 'POST',
    pattern: '/api/job/info/:id/pause',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      job.status = 'PAUSED'
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/job/info/:id/resume — 恢复任务
  {
    method: 'POST',
    pattern: '/api/job/info/:id/resume',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      job.status = 'NORMAL'
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/job/info/:id/trigger — 手动触发
  {
    method: 'POST',
    pattern: '/api/job/info/:id/trigger',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      // Mock 触发：追加一条 MANUAL 执行日志
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const logId = MOCK_JOB_LOGS.length > 0 ? Math.max(...MOCK_JOB_LOGS.map((l) => l.id)) + 1 : 1
      MOCK_JOB_LOGS.push({
        id: logId,
        jobId: job.id,
        jobName: job.jobName,
        jobGroup: job.jobGroup,
        triggerType: 'MANUAL',
        jobParams: job.beanParams ?? job.formData ?? null,
        execStatus: 'RUNNING',
        startTime: now,
        endTime: null,
        duration: null,
        resultMsg: null,
        exceptionStack: null,
        createTime: now,
      })
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/job/log/page?jobId=&pageNum=&pageSize= — 分页查询日志
  {
    method: 'POST',
    pattern: '/api/job/log/page',
    handler: (_params, query) => {
      const jobId = Number(query.jobId)
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = MOCK_JOB_LOGS.filter((l) => l.jobId === jobId)
      if (query.execStatus) {
        list = list.filter((l) => l.execStatus === query.execStatus)
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  // GET /api/job/log/:id — 查询单条日志
  {
    method: 'GET',
    pattern: '/api/job/log/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const log = MOCK_JOB_LOGS.find((l) => l.id === id)
      if (!log) return { code: 404, message: '日志不存在', data: null }
      return { code: 0, message: 'ok', data: { ...log } }
    },
  },
]
