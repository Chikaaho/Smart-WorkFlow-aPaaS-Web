/**
 * 定时任务种子：任务信息与执行日志。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const MOCK_JOB_INFOS: Array<{
  id: number
  jobName: string
  jobGroup: string
  jobType: 'BEAN' | 'FLOW'
  cronExpression: string
  status: 'NORMAL' | 'PAUSED'
  concurrent: boolean
  misfirePolicy: number
  description: string
  beanName: string | null
  beanParams: string | null
  flowDefKey: string | null
  formData: string | null
  lastFireTime: string | null
  nextFireTime: string | null
  createTime: string
  updateTime: string
  createBy: number
  updateBy: number
}> = [
  {
    id: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0 0 2 * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 1,
    description: '每日凌晨2点执行数据库备份',
    beanName: 'dataBackupHandler',
    beanParams: '{"backupType": "full", "compress": true}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-21T02:00:00',
    nextFireTime: '2026-07-22T02:00:00',
    createTime: '2026-07-15T00:00:00',
    updateTime: '2026-07-15T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 2,
    jobName: '周报自动生成',
    jobGroup: 'DEFAULT',
    jobType: 'FLOW',
    cronExpression: '0 0 9 ? * MON',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 0,
    description: '每周一9点发起周报提交流程',
    beanName: null,
    beanParams: null,
    flowDefKey: 'weekly-report-process',
    formData: '{"templateType": "weekly", "notifyUsers": [1, 2]}',
    lastFireTime: '2026-07-20T09:00:00',
    nextFireTime: '2026-07-27T09:00:00',
    createTime: '2026-07-10T00:00:00',
    updateTime: '2026-07-10T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 3,
    jobName: '临时数据清理',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0 30 1 * * ?',
    status: 'PAUSED',
    concurrent: false,
    misfirePolicy: 2,
    description: '清理超过30天的临时文件',
    beanName: 'tempFileCleanupHandler',
    beanParams: '{"maxAgeDays": 30, "dryRun": false}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-19T01:30:00',
    nextFireTime: null,
    createTime: '2026-07-08T00:00:00',
    updateTime: '2026-07-18T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    jobType: 'BEAN',
    cronExpression: '0/30 * * * * ?',
    status: 'NORMAL',
    concurrent: true,
    misfirePolicy: 1,
    description: '每30秒检查系统各组件健康状态并发送告警',
    beanName: 'healthCheckHandler',
    beanParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-21T10:00:30',
    nextFireTime: '2026-07-21T10:01:00',
    createTime: '2026-06-01T00:00:00',
    updateTime: '2026-06-01T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 5,
    jobName: '请假到期自动审批',
    jobGroup: 'DEFAULT',
    jobType: 'FLOW',
    cronExpression: '0 0 10 * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 1,
    description: '每日10点检查逾期未审批的请假申请并自动通过',
    beanName: null,
    beanParams: null,
    flowDefKey: 'leave-auto-approve',
    formData: '{"maxOverdueDays": 3, "autoApproveType": "LEAVE"}',
    lastFireTime: '2026-07-21T10:00:00',
    nextFireTime: '2026-07-22T10:00:00',
    createTime: '2026-07-05T00:00:00',
    updateTime: '2026-07-05T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
]

export const MOCK_JOB_LOGS: Array<{
  id: number
  jobId: number
  jobName: string
  jobGroup: string
  triggerType: 'AUTO' | 'MANUAL'
  jobParams: string | null
  execStatus: 'RUNNING' | 'SUCCESS' | 'FAILED'
  startTime: string
  endTime: string | null
  duration: number | null
  resultMsg: string | null
  exceptionStack: string | null
  createTime: string
}> = [
  {
    id: 1,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"backupType": "full", "compress": true}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T02:00:00',
    endTime: '2026-07-21T02:05:32',
    duration: 332000,
    resultMsg: '备份完成，文件大小 2.3GB，已上传至 OSS',
    exceptionStack: null,
    createTime: '2026-07-21T02:05:32',
  },
  {
    id: 2,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"backupType": "full", "compress": true}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-20T02:00:00',
    endTime: '2026-07-20T02:04:58',
    duration: 298000,
    resultMsg: '备份完成，文件大小 2.1GB，已上传至 OSS',
    exceptionStack: null,
    createTime: '2026-07-20T02:04:58',
  },
  {
    id: 3,
    jobId: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    triggerType: 'AUTO',
    jobParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:30',
    endTime: '2026-07-21T10:00:31',
    duration: 1200,
    resultMsg: '所有组件正常',
    exceptionStack: null,
    createTime: '2026-07-21T10:00:31',
  },
  {
    id: 4,
    jobId: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    triggerType: 'AUTO',
    jobParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    execStatus: 'FAILED',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:05',
    duration: 5012,
    resultMsg: '磁盘使用率超过阈值：92%',
    exceptionStack:
      'java.lang.RuntimeException: Disk usage 92% exceeds threshold 90%\n\tat com.example.health.DiskCheck.run(DiskCheck.java:42)\n\tat com.example.health.HealthCheckHandler.execute(HealthCheckHandler.java:28)',
    createTime: '2026-07-21T10:00:05',
  },
  {
    id: 5,
    jobId: 2,
    jobName: '周报自动生成',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"templateType": "weekly", "notifyUsers": [1, 2]}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-20T09:00:00',
    endTime: '2026-07-20T09:00:15',
    duration: 15000,
    resultMsg: '已发起周报流程，分配审批人：张三',
    exceptionStack: null,
    createTime: '2026-07-20T09:00:15',
  },
  {
    id: 6,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'MANUAL',
    jobParams: '{"backupType": "incremental", "compress": false}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T09:15:00',
    endTime: '2026-07-21T09:17:45',
    duration: 165000,
    resultMsg: '增量备份完成，文件大小 340MB',
    exceptionStack: null,
    createTime: '2026-07-21T09:17:45',
  },
  {
    id: 7,
    jobId: 5,
    jobName: '请假到期自动审批',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"maxOverdueDays": 3, "autoApproveType": "LEAVE"}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:03',
    duration: 3200,
    resultMsg: '自动审批完成：3条请假申请已通过',
    exceptionStack: null,
    createTime: '2026-07-21T10:00:03',
  },
  {
    id: 8,
    jobId: 3,
    jobName: '临时数据清理',
    jobGroup: 'DEFAULT',
    triggerType: 'MANUAL',
    jobParams: '{"maxAgeDays": 15, "dryRun": true}',
    execStatus: 'RUNNING',
    startTime: '2026-07-21T10:05:00',
    endTime: null,
    duration: null,
    resultMsg: null,
    exceptionStack: null,
    createTime: '2026-07-21T10:05:00',
  },
]
