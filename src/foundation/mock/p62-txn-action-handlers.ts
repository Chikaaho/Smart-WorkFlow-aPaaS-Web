/**
 * P62 事务动作 mock（动作行、调用、预约、台账、C1 策略）。
 * 从 handlers.ts 原样搬出（行为零变化），由 handlers.ts 聚合注册。
 */
import type { MockRegistration } from './mock-shared'

export const p62TxnActionMockRegistrations: MockRegistration[] = [
  {
    method: 'GET',
    pattern: '/api/form/action/list',
    handler: (_params, query) => ({
      code: 0,
      message: 'ok',
      data: p62List(String(query?.formId ?? '')),
    }),
  },
  {
    method: 'GET',
    pattern: '/api/form/action/:id',
    handler: (params) => {
      const hit = P62_TXN_ACTION_STORE.get(String((params as Record<string, string>).id))
      return hit
        ? { code: 0, message: 'ok', data: hit }
        : { code: 1600, message: '事务动作不存在', data: null }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action',
    handler: (_params, query, body) => {
      const raw = (body ?? {}) as Record<string, unknown>
      const id = 'mock-txn-' + Math.random().toString(36).slice(2, 10)
      const row: P62TxnActionRow = {
        id,
        formId: String(query?.formId ?? ''),
        actionKey: String(raw.actionKey ?? ''),
        name: String(raw.name ?? ''),
        actionType: (raw.actionType ?? 'RESERVE') as P62TxnActionRow['actionType'],
        status: 'DRAFT',
        currentVersion: null,
        description: (raw.description as string) ?? null,
        configJson: JSON.stringify(raw.config ?? {}),
        updateTime: p62Now(),
      }
      P62_TXN_ACTION_STORE.set(id, row)
      return { code: 0, message: 'ok', data: row }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/form/action/:id',
    handler: (params, _query, body) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      const raw = (body ?? {}) as Record<string, unknown>
      const updated: P62TxnActionRow = {
        ...row,
        name: String(raw.name ?? row.name),
        description: (raw.description as string) ?? row.description,
        configJson: raw.config ? JSON.stringify(raw.config) : row.configJson,
        updateTime: p62Now(),
      }
      P62_TXN_ACTION_STORE.set(id, updated)
      return { code: 0, message: 'ok', data: updated }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action/:id/validate',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      const cfg = row.configJson ? (JSON.parse(row.configJson) as Record<string, unknown>) : {}
      const errors: Array<{ field: string; message: string; code: number }> = []
      if (!cfg.balanceField) {
        errors.push({ field: 'config.balanceField', message: '余额字段必填', code: 1603 })
      }
      if (row.actionType === 'RESERVE' && !cfg.reservedField) {
        errors.push({ field: 'config.reservedField', message: '预占字段必填', code: 1603 })
      }
      if (row.actionType === 'RESERVE' && !cfg.expiresInSeconds) {
        errors.push({
          field: 'config.expiresInSeconds',
          message: '预占时效等级必填（发布时冻结）',
          code: 1602,
        })
      }
      return { code: 0, message: 'ok', data: errors }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action/:id/publish',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      const updated: P62TxnActionRow = {
        ...row,
        status: 'PUBLISHED',
        currentVersion: (row.currentVersion ?? 0) + 1,
        updateTime: p62Now(),
      }
      P62_TXN_ACTION_STORE.set(id, updated)
      return { code: 0, message: 'ok', data: updated }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action/:id/disable',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      const updated: P62TxnActionRow = { ...row, status: 'DISABLED', updateTime: p62Now() }
      P62_TXN_ACTION_STORE.set(id, updated)
      return { code: 0, message: 'ok', data: updated }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action/:id/enable',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      const updated: P62TxnActionRow = { ...row, status: 'PUBLISHED', updateTime: p62Now() }
      P62_TXN_ACTION_STORE.set(id, updated)
      return { code: 0, message: 'ok', data: updated }
    },
  },
  {
    method: 'GET',
    pattern: '/api/form/action/c1-policy',
    handler: (_params, query) => {
      const formId = String(query?.formId ?? '')
      const hit = P62_C1_POLICY.get(formId)
      return {
        code: 0,
        message: 'ok',
        data: {
          id: hit ? 'mock-c1' : null,
          formId,
          enabled: hit?.enabled ?? false,
          policyJson: hit?.policyJson ?? null,
          appliedAt: null,
          updateTime: null,
        },
      }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/form/action/c1-policy',
    handler: (_params, query, body) => {
      const formId = String(query?.formId ?? '')
      const raw = (body ?? {}) as { policy?: Record<string, unknown> }
      const policy = raw.policy ?? { enabled: false }
      P62_C1_POLICY.set(formId, {
        enabled: policy.enabled === true,
        policyJson: JSON.stringify(policy),
      })
      return {
        code: 0,
        message: 'ok',
        data: {
          id: 'mock-c1',
          formId,
          enabled: policy.enabled === true,
          policyJson: JSON.stringify(policy),
          appliedAt: p62Now(),
          updateTime: p62Now(),
        },
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/form/action/:id/invoke',
    handler: (params, _query, body) => {
      const id = String((params as Record<string, string>).id)
      const row = P62_TXN_ACTION_STORE.get(id)
      if (!row) return { code: 1600, message: '事务动作不存在', data: null }
      if (row.status === 'DISABLED')
        return { code: 1601, message: '事务动作已停用，不能发起新调用', data: null }
      const raw = (body ?? {}) as Record<string, unknown>
      const invocationId = 'mock-inv-' + Math.random().toString(36).slice(2, 10)
      const invocationKey = String(raw.invocationKey ?? 'AUTO:' + invocationId)
      const reservationId =
        row.actionType === 'RESERVE' ? 'mock-res-' + Math.random().toString(36).slice(2, 8) : null
      const list = P62_TXN_INVOCATIONS.get(id) ?? []
      list.unshift({
        id: invocationId,
        actionId: id,
        actionVersion: row.currentVersion ?? 1,
        invocationKey,
        bizRecordId: raw.recordId ?? null,
        status: 'SUCCEEDED',
        errorCode: null,
        errorMsg: null,
        resultJson: null,
        durationMs: 3,
        callerId: 1,
        createTime: p62Now(),
      })
      P62_TXN_INVOCATIONS.set(id, list)
      if (reservationId) {
        const reservations = P62_TXN_RESERVATIONS.get(id) ?? []
        reservations.unshift({
          id: reservationId,
          actionId: id,
          actionVersion: row.currentVersion ?? 1,
          formId: row.formId,
          recordId: raw.recordId ?? '',
          bizKeysJson: null,
          quantity: String(raw.quantity ?? '0'),
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          reserveInvocationId: invocationId,
          settleInvocationId: null,
          settledAt: null,
          createTime: p62Now(),
        })
        P62_TXN_RESERVATIONS.set(id, reservations)
      }
      const ledger = P62_TXN_LEDGER.get(id) ?? []
      ledger.unshift({
        id: 'mock-led-' + Math.random().toString(36).slice(2, 8),
        actionId: id,
        actionVersion: row.currentVersion ?? 1,
        invocationId,
        reservationId,
        entryType: row.actionType,
        formId: row.formId,
        recordId: raw.recordId ?? '',
        quantity: String(raw.quantity ?? '0'),
        balanceAfter: '100',
        reservedAfter: '0',
        bizKeysJson: null,
        createTime: p62Now(),
      })
      P62_TXN_LEDGER.set(id, ledger)
      return {
        code: 0,
        message: 'ok',
        data: {
          invocationId,
          status: 'SUCCEEDED',
          actionVersion: row.currentVersion ?? 1,
          reservationId,
          quantity: raw.quantity ?? null,
          balanceAfter: '100',
          reservedAfter: '0',
          errorCode: null,
          errorMsg: null,
          durationMs: 3,
          replay: false,
        },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/form/action/:id/invocations',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const list = P62_TXN_INVOCATIONS.get(id) ?? []
      return {
        code: 0,
        message: 'ok',
        data: { records: list, total: list.length, current: 1, size: 20 },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/form/action/:id/reservations',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const list = P62_TXN_RESERVATIONS.get(id) ?? []
      return {
        code: 0,
        message: 'ok',
        data: { records: list, total: list.length, current: 1, size: 20 },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/form/action/:id/ledger',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const list = P62_TXN_LEDGER.get(id) ?? []
      return {
        code: 0,
        message: 'ok',
        data: { records: list, total: list.length, current: 1, size: 20 },
      }
    },
  },
]

export // ─── P62 事务动作 mock（管理/发布校验/调用/回查；内存演示，语义对齐真实后端） ───

interface P62TxnActionRow {
  id: string
  formId: string
  actionKey: string
  name: string
  actionType: 'RESERVE' | 'CONFIRM' | 'RELEASE' | 'ADJUST'
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  currentVersion: number | null
  description: string | null
  configJson: string | null
  updateTime: string
}

export const P62_TXN_ACTION_STORE = new Map<string, P62TxnActionRow>()

export const P62_TXN_INVOCATIONS = new Map<string, Record<string, unknown>[]>()

export const P62_TXN_RESERVATIONS = new Map<string, Record<string, unknown>[]>()

export const P62_TXN_LEDGER = new Map<string, Record<string, unknown>[]>()

export const P62_C1_POLICY = new Map<string, { enabled: boolean; policyJson: string | null }>()

export function p62Now(): string {
  return new Date().toISOString()
}

export function p62List(formId: string): P62TxnActionRow[] {
  return Array.from(P62_TXN_ACTION_STORE.values()).filter((a) => a.formId === formId)
}
