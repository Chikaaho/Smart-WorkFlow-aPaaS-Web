/**
 * IoT 与存储 mock：设备命令、预约、文件。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { MOCK_CURRENT_SESSION, MOCK_STORAGE_FILES } from './seeds'
import type { MockRegistration } from './mock-shared'

export /** P62 S5 mock（临时）：设备命令（含一条 UNKNOWN 供人工核实演示）。 */
const MOCK_IOT_DEVICE_COMMANDS: {
  id: number
  createTime: string
  updateTime: string
  tenantId: number
  productId: string
  deviceName: string
  deviceKey: string | null
  commandType: string
  commandKey: string
  semanticMode: string
  payload: string | null
  status:
    | 'QUEUED'
    | 'SENDING'
    | 'SENT'
    | 'DELIVERED'
    | 'ACKED'
    | 'SUCCESS'
    | 'FAILED'
    | 'UNKNOWN'
    | 'EXPIRED'
  idempotentKey: string | null
  expiryTime: string | null
  retryCount: number | null
  lastError: string | null
  tencentRequestId: string | null
  clientToken: string | null
  deviceOutput: string | null
  result: string | null
  approvalBizId: string | null
}[] = [
  {
    id: 9301,
    createTime: '2026-09-30T10:00:00',
    updateTime: '2026-09-30T10:01:00',
    tenantId: 0,
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    deviceKey: 'demo-device-01',
    commandType: 'ACTION',
    commandKey: 'power_on',
    semanticMode: 'DEFERRED',
    payload: '{"switch":1}',
    status: 'UNKNOWN',
    idempotentKey: 'mock-rcpt-01',
    expiryTime: '2026-09-30T10:05:00',
    retryCount: 0,
    lastError: '回执超时：传输已发出但未获确定业务回执（转待核实，不自动重发）',
    tencentRequestId: 'req-1',
    clientToken: null,
    deviceOutput: null,
    result: null,
    approvalBizId: 'mock-instance-01',
  },
  {
    id: 9302,
    createTime: '2026-09-30T09:30:00',
    updateTime: '2026-09-30T09:32:00',
    tenantId: 0,
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    deviceKey: 'demo-device-01',
    commandType: 'ACTION',
    commandKey: 'set_brightness',
    semanticMode: 'DEFERRED',
    payload: '{"brightness":5}',
    status: 'SUCCESS',
    idempotentKey: 'mock-rcpt-02',
    expiryTime: '2026-09-30T09:40:00',
    retryCount: 0,
    lastError: null,
    tencentRequestId: 'req-2',
    clientToken: null,
    deviceOutput: null,
    result: '{"source":"RECEIPT","requestId":"req-2"}',
    approvalBizId: 'mock-instance-02',
  },
]

export /** P63 mock（临时）：IoT 预约单可变种子（实例 ID 对齐待办任务种子，覆盖全部状态供肉眼验收）。 */
const MOCK_IOT_RESERVATIONS: {
  id: number
  processInstanceId: string
  processDefKey: string
  defVersion: number
  formKey: string
  recordId: string
  deviceKey: string
  productId: string
  deviceName: string
  commandKey: string
  commandType: string
  payload: string | null
  dueAtUtc: string
  timezoneId: string
  dueLocalText: string
  lateWindowSeconds: number
  status: 'PENDING' | 'DISPATCHING' | 'DISPATCHED' | 'CANCELED' | 'EXPIRED' | 'FAILED'
  commandId: number | null
  rejectReason: string | null
  cancelBy: string | null
  cancelReason: string | null
  cancelTime: string | null
  createTime: string
}[] = [
  {
    id: 9501,
    processInstanceId: 'mock-proc-001',
    processDefKey: 'leave_approval',
    defVersion: 1,
    formKey: 'leave-request',
    recordId: 'fd_001',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'power_on',
    commandType: 'ACTION',
    payload: '{"switch":1}',
    dueAtUtc: '2026-10-07T01:30:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-07 09:30:00',
    lateWindowSeconds: 60,
    status: 'PENDING',
    commandId: null,
    rejectReason: null,
    cancelBy: null,
    cancelReason: null,
    cancelTime: null,
    createTime: '2026-10-06 09:00:00',
  },
  {
    id: 9502,
    processInstanceId: 'mock-proc-002',
    processDefKey: 'purchase_approval',
    defVersion: 1,
    formKey: 'purchase-order',
    recordId: 'fd_003',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'set_brightness',
    commandType: 'ACTION',
    payload: '{"brightness":5}',
    dueAtUtc: '2026-10-06T01:00:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-06 09:00:00',
    lateWindowSeconds: 120,
    status: 'DISPATCHED',
    commandId: 9302,
    rejectReason: null,
    cancelBy: null,
    cancelReason: null,
    cancelTime: null,
    createTime: '2026-10-05 15:00:00',
  },
  {
    id: 9503,
    processInstanceId: 'mock-proc-003',
    processDefKey: 'contract_approval',
    defVersion: 1,
    formKey: 'contract-approval',
    recordId: 'fd_005',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'power_off',
    commandType: 'ACTION',
    payload: '{"switch":0}',
    dueAtUtc: '2026-10-06T02:00:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-06 10:00:00',
    lateWindowSeconds: 60,
    status: 'CANCELED',
    commandId: null,
    rejectReason: null,
    cancelBy: 'admin',
    cancelReason: '审批被驳回，无需关机',
    cancelTime: '2026-10-06 08:50:00',
    createTime: '2026-10-05 16:00:00',
  },
  {
    id: 9504,
    processInstanceId: 'mock-proc-004',
    processDefKey: 'expense_approval',
    defVersion: 1,
    formKey: 'expense-report',
    recordId: 'gen_001',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'power_on',
    commandType: 'ACTION',
    payload: '{"switch":1}',
    dueAtUtc: '2026-10-05T02:00:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-05 10:00:00',
    lateWindowSeconds: 60,
    status: 'FAILED',
    commandId: null,
    rejectReason: '设备离线，超过迟到窗口未下发',
    cancelBy: null,
    cancelReason: null,
    cancelTime: null,
    createTime: '2026-10-04 11:00:00',
  },
  {
    id: 9505,
    processInstanceId: 'mock-proc-005',
    processDefKey: 'leave_approval',
    defVersion: 1,
    formKey: 'leave-request',
    recordId: 'gen_002',
    deviceKey: 'demo-device-01',
    productId: 'demo-product',
    deviceName: 'demo-device-01',
    commandKey: 'power_on',
    commandType: 'ACTION',
    payload: '{"switch":1}',
    dueAtUtc: '2026-10-04T02:00:00Z',
    timezoneId: 'Asia/Shanghai',
    dueLocalText: '2026-10-04 10:00:00',
    lateWindowSeconds: 60,
    status: 'EXPIRED',
    commandId: null,
    rejectReason: null,
    cancelBy: null,
    cancelReason: null,
    cancelTime: null,
    createTime: '2026-10-03 10:00:00',
  },
]

export const iotMockRegistrations: MockRegistration[] = [
  // GET /api/iot/devices/:productId/:deviceName/commands — 设备命令回查（P62 S5 mock，临时）
  {
    method: 'GET',
    pattern: '/api/iot/devices/:productId/:deviceName/commands',
    handler: () => ({ code: 0, message: 'ok', data: MOCK_IOT_DEVICE_COMMANDS }),
  },
  // POST /api/iot/commands/:commandId/manual-verify — 人工核实（P62 S5 mock，临时）
  {
    method: 'POST',
    pattern: '/api/iot/commands/:commandId/manual-verify',
    handler: (params, _query, body) => {
      const commandId = (params as Record<string, string>).commandId
      const req = body as { outcome?: string; basis?: string }
      if (!req?.basis || !req.basis.trim()) {
        return { code: 400, message: '人工核实必须携带可信依据（无依据不得宣告结果）', data: null }
      }
      const command = MOCK_IOT_DEVICE_COMMANDS.find((c) => String(c.id) === commandId)
      if (!command) {
        return { code: 404, message: '命令不存在', data: null }
      }
      if (command.status !== 'UNKNOWN') {
        return {
          code: 400,
          message: '仅结果未知（UNKNOWN）的命令可人工核实: 当前 ' + command.status,
          data: null,
        }
      }
      command.status = (req.outcome === 'FAILED' ? 'FAILED' : 'SUCCESS') as typeof command.status
      command.result = JSON.stringify({ source: 'MANUAL_VERIFY', basis: req.basis, operatorId: 1 })
      return {
        code: 0,
        message: 'ok',
        data: { verdict: 'APPLIED', statusBefore: 'UNKNOWN', statusAfter: command.status },
      }
    },
  },
  // GET /api/iot/reservations?processInstanceId=xxx — 实例维度预约查询（P63 mock，临时）
  // processInstanceId 缺省返回全量（便于 IoT 侧肉眼验收）；深拷贝返回避免泄漏可变种子引用。
  {
    method: 'GET',
    pattern: '/api/iot/reservations',
    handler: (_params, query) => {
      const pid = (query.processInstanceId ?? '').trim()
      const list =
        pid === ''
          ? MOCK_IOT_RESERVATIONS
          : MOCK_IOT_RESERVATIONS.filter((r) => r.processInstanceId === pid)
      return { code: 0, message: 'ok', data: JSON.parse(JSON.stringify(list)) }
    },
  },
  // POST /api/iot/reservations/:id/cancel — 取消预约（P63 mock，临时）
  // 幂等：仅 PENDING 可取消并落取消人/原因/时间；非 PENDING 返回 NOT_CANCELLABLE（不报错）。
  {
    method: 'POST',
    pattern: '/api/iot/reservations/:id/cancel',
    handler: (params, _query, body) => {
      const id = (params as Record<string, string>).id
      const req = body as { reason?: string }
      const reservation = MOCK_IOT_RESERVATIONS.find((r) => String(r.id) === id)
      if (!reservation) {
        return { code: 404, message: '预约单不存在', data: null }
      }
      if (reservation.status !== 'PENDING') {
        return { code: 0, message: 'ok', data: { outcome: 'NOT_CANCELLABLE' } }
      }
      reservation.status = 'CANCELED'
      reservation.cancelBy = MOCK_CURRENT_SESSION.user.username || 'mock-user'
      reservation.cancelReason = req?.reason?.trim() || ''
      reservation.cancelTime = new Date().toISOString().slice(0, 19).replace('T', ' ')
      return { code: 0, message: 'ok', data: { outcome: 'CANCELED' } }
    },
  },
  // ── 文件存储：分页列表 ─────────────────────────────────
  // GET /api/storage/files?page=&size=
  // query 参数名 page/size 对齐 listFiles() 发送的 axios params
  // 响应字段 pageNum/pageSize 对齐后端 MP Page Jackson 序列化
  {
    method: 'GET',
    pattern: '/api/storage/files',
    handler: (_params, query) => {
      const page = Number(query.page ?? 1)
      const size = Number(query.size ?? 10)
      const total = MOCK_STORAGE_FILES.length
      const start = (page - 1) * size
      const records = MOCK_STORAGE_FILES.slice(start, start + size)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum: page, pageSize: size },
      }
    },
  },
  // ── 文件存储：上传 ────────────────────────────────────
  // POST /api/storage/files/upload (multipart/form-data)
  // Mock 模式不解析 FormData body，直接返回静态上传结果
  {
    method: 'POST',
    pattern: '/api/storage/files/upload',
    handler: (_params, _query, _body) => {
      const id = MOCK_STORAGE_FILES.length + 1
      const now = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
      const storageKey = `mock-upload-${id}-${Date.now()}`
      MOCK_STORAGE_FILES.unshift({
        id,
        originalName: '新上传的文件.txt',
        storageKey,
        storageName: storageKey,
        fileSize: 1024,
        contentType: 'text/plain',
        fileExt: 'txt',
        providerType: 'local',
        bucketName: 'default',
        storageUrl: `/upload/${storageKey}`,
        createTime: now,
        updateTime: now,
        createBy: 1,
        updateBy: 1,
      })
      return {
        code: 0,
        message: 'ok',
        data: {
          storageKey,
          storageName: storageKey,
          storageUrl: `/upload/${storageKey}`,
          fileSize: 1024,
        },
      }
    },
  },
  // ── 文件存储：查询详情 ─────────────────────────────
  // GET /api/storage/files/:storageKey
  {
    method: 'GET',
    pattern: '/api/storage/files/:storageKey',
    handler: (params) => {
      const { storageKey } = params as Record<string, string>
      const file = MOCK_STORAGE_FILES.find((f) => f.storageKey === storageKey)
      if (!file) {
        return { code: 404, message: '文件不存在', data: null }
      }
      return { code: 0, message: 'ok', data: { ...file } }
    },
  },
  // ── 文件存储：删除 ─────────────────────────────────
  // DELETE /api/storage/files/:storageKey
  // 幂等：不存在的 storageKey 也返回 code: 0
  {
    method: 'DELETE',
    pattern: '/api/storage/files/:storageKey',
    handler: (params) => {
      const { storageKey } = params as Record<string, string>
      const idx = MOCK_STORAGE_FILES.findIndex((f) => f.storageKey === storageKey)
      if (idx !== -1) {
        MOCK_STORAGE_FILES.splice(idx, 1)
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
]
