/**
 * 定时任务调度模块 API 层 — 10 个端点。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 * 分页端点使用 adaptPage 适配 MyBatis-Plus Page → PageResult。
 */
import { request } from '@/foundation/request'
import type { PageResult } from '@/contracts/common'
import type { JobInfo, JobLog } from '@/contracts/job'

// ─── 后端分页原始形状 ───
// MyBatis-Plus Page Jackson 序列化为 records/total/pageNum/pageSize
interface BackendPage<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

function adaptPage<T>(raw: BackendPage<T>): PageResult<T> {
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

// ═══════════════════════════════════════
// 任务定义 CRUD
// ═══════════════════════════════════════

/**
 * 分页查询任务定义。
 * POST /job/info/page?pageNum=&pageSize= + body JobInfo(可选过滤条件)
 */
export async function pageJobInfos(
  pageNum: number,
  pageSize: number,
  query?: Partial<Pick<JobInfo, 'jobName' | 'jobType' | 'status'>>,
): Promise<PageResult<JobInfo>> {
  const raw = await request<BackendPage<JobInfo>>({
    method: 'POST',
    url: '/job/info/page',
    params: { pageNum, pageSize },
    data: query,
  })
  return adaptPage(raw)
}

/**
 * 按 ID 查询任务定义。
 * GET /job/info/{id}
 */
export async function getJobInfo(id: number): Promise<JobInfo> {
  return request<JobInfo>({
    method: 'GET',
    url: `/job/info/${id}`,
  })
}

/**
 * 创建任务定义。
 * POST /job/info — body 完整 JobInfo 对象
 * @returns 新创建的任务 ID
 */
export async function createJobInfo(
  data: Omit<JobInfo, 'id' | 'createTime' | 'updateTime' | 'createBy' | 'updateBy'>,
): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/job/info',
    data,
  })
}

/**
 * 更新任务定义。
 * PUT /job/info — body 完整 JobInfo 对象（id 必填）
 */
export async function updateJobInfo(data: JobInfo): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: '/job/info',
    data,
  })
}

/**
 * 删除任务定义（软删除 + 从 Quartz 移除，幂等）。
 * DELETE /job/info/{id}
 */
export async function deleteJobInfo(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/job/info/${id}`,
  })
}

/**
 * 暂停任务（幂等）。
 * POST /job/info/{id}/pause
 */
export async function pauseJob(id: number): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/job/info/${id}/pause`,
  })
}

/**
 * 恢复任务（幂等）。
 * POST /job/info/{id}/resume
 */
export async function resumeJob(id: number): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/job/info/${id}/resume`,
  })
}

/**
 * 手动触发一次任务执行（不改变调度计划）。
 * POST /job/info/{id}/trigger
 */
export async function triggerJob(id: number): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/job/info/${id}/trigger`,
  })
}

// ═══════════════════════════════════════
// 执行日志
// ═══════════════════════════════════════

/**
 * 按任务 ID 分页查询执行日志。
 * POST /job/log/page?jobId=&pageNum=&pageSize=
 */
export async function pageJobLogs(
  jobId: number,
  pageNum: number,
  pageSize: number,
): Promise<PageResult<JobLog>> {
  const raw = await request<BackendPage<JobLog>>({
    method: 'POST',
    url: '/job/log/page',
    params: { jobId, pageNum, pageSize },
  })
  return adaptPage(raw)
}

/**
 * 按 ID 查询单条日志详情。
 * GET /job/log/{id}
 */
export async function getJobLog(id: number): Promise<JobLog> {
  return request<JobLog>({
    method: 'GET',
    url: `/job/log/${id}`,
  })
}
