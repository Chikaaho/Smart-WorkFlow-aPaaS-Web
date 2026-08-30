/**
 * 定时任务调度模块合约类型。
 *
 * 对齐后端：
 * - JobInfo 实体（sw_job_info 表，BaseEntity 子类）
 * - JobLog 实体（sw_job_log 表，BaseEntity 子类）
 * - 枚举：JobStatus / JobType / ExecStatus / TriggerType
 *
 * 排除字段：deleted / tenantId / version（后端系统列，不暴露给前端）。
 * 日期字段（LocalDateTime → string，ISO-8601 格式）。
 */

// ─── 枚举（字符串字面量联合类型，不用 TypeScript enum） ───

/** 任务调度状态（对齐后端 JobStatus 枚举） */
export type JobStatus = 'NORMAL' | 'PAUSED'

/** 任务类型（对齐后端 JobType 枚举） */
export type JobType = 'BEAN' | 'FLOW'

/** 执行状态（对齐后端 ExecStatus 枚举） */
export type ExecStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'

/** 触发方式（对齐后端 TriggerType 枚举） */
export type TriggerType = 'AUTO' | 'MANUAL'

// ─── 定时任务定义（对齐后端 JobInfo 实体，不含系统列） ───

/** 定时任务定义 */
export interface JobInfo {
  /** 主键（服务端生成） */
  id?: number
  /** 任务名称 */
  jobName: string
  /** 任务组（默认 "DEFAULT"） */
  jobGroup?: string
  /** 任务类型（默认 "BEAN"） */
  jobType?: JobType
  /** Cron 表达式 */
  cronExpression: string
  /** 调度状态（默认 "NORMAL"） */
  status?: JobStatus
  /** 是否允许并发执行（默认 false） */
  concurrent?: boolean
  /** Misfire 策略：0=忽略 / 1=立即触发一次 / 2=放弃（默认 0） */
  misfirePolicy?: number
  /** 任务描述 */
  description?: string
  /** Bean 名称（jobType=BEAN 时必填） */
  beanName?: string
  /** Bean 方法参数（JSON 字符串，可选） */
  beanParams?: string
  /** 流程定义 Key（jobType=FLOW 时必填） */
  flowDefKey?: string
  /** 流程表单数据（JSON 字符串，可选） */
  formData?: string
  /** 上次执行时间（ISO-8601） */
  lastFireTime?: string
  /** 下次执行时间（ISO-8601） */
  nextFireTime?: string
  /** 创建时间（ISO-8601，服务端生成） */
  createTime?: string
  /** 更新时间（ISO-8601，服务端生成） */
  updateTime?: string
  /** 创建人 ID（服务端生成） */
  createBy?: number
  /** 更新人 ID（服务端生成） */
  updateBy?: number
}

// ─── 执行日志（对齐后端 JobLog 实体，不含系统列） ───

/** 定时任务执行日志 */
export interface JobLog {
  /** 主键（服务端生成） */
  id?: number
  /** 关联任务 ID */
  jobId: number
  /** 任务名称（冗余字段） */
  jobName?: string
  /** 任务组（冗余字段） */
  jobGroup?: string
  /** 触发方式 */
  triggerType: TriggerType
  /** 执行时参数快照（JSON 字符串） */
  jobParams?: string
  /** 执行状态 */
  execStatus: ExecStatus
  /** 执行开始时间（ISO-8601） */
  startTime?: string
  /** 执行结束时间（ISO-8601） */
  endTime?: string
  /** 执行耗时（毫秒） */
  duration?: number
  /** 执行结果或异常消息 */
  resultMsg?: string
  /** 异常堆栈（仅失败时） */
  exceptionStack?: string
  /** 创建时间（ISO-8601，服务端生成） */
  createTime?: string
}
