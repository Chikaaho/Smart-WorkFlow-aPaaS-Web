/** 临时 UI 验收数据；仅由 dev:mock 装载，不作为后端租户行为证据。 */
import type { MockHandler, MockMethod } from './index'
import { getAccessToken } from '@/foundation/auth/token'
import { MOCK_CURRENT_SESSION } from './seeds'

export const MOCK_TENANTS = [
  {
    id: '0',
    code: '0',
    name: '超管',
    adminUsername: 'admin',
    status: 0,
    createTime: '2026-10-01 09:00',
  },
  {
    id: '1',
    code: '1',
    name: 'CH 科技',
    adminUsername: 'chenxi',
    status: 0,
    createTime: '2026-10-10 09:00',
  },
  {
    id: '2',
    code: '2',
    name: '深圳中心',
    adminUsername: 'linyue',
    status: 0,
    createTime: '2026-10-15 14:30',
  },
]

function accessGate() {
  if (!getAccessToken() || !MOCK_CURRENT_SESSION.user.id) {
    return { code: 401, message: '未认证', data: null }
  }
  if (!MOCK_CURRENT_SESSION.superAdmin) {
    return { code: 403, message: '无权限', data: null }
  }
  return null
}

export const tenantMockRegistrations: {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}[] = [
  {
    method: 'GET',
    pattern: '/api/system/tenant/page',
    handler: (_params, query) => {
      const denied = accessGate()
      if (denied) return denied
      const pageNum = Math.max(1, Number(query.pageNum) || 1)
      const pageSize = Math.max(1, Number(query.pageSize) || 10)
      const rows = MOCK_TENANTS.filter(
        (row) =>
          (!query.name || row.name.includes(query.name)) &&
          (query.status === undefined || row.status === Number(query.status)),
      )
      return {
        code: 0,
        message: 'ok',
        data: {
          records: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
          total: rows.length,
          pageNum,
          pageSize,
        },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/tenant/:id',
    handler: ({ id }) =>
      accessGate() ?? {
        code: MOCK_TENANTS.some((row) => row.id === id) ? 0 : 404,
        message: 'ok',
        data: MOCK_TENANTS.find((row) => row.id === id) ?? null,
      },
  },
  {
    method: 'POST',
    pattern: '/api/system/tenant',
    handler: (_params, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      const values = body as { name?: string; adminUsername?: string; adminPassword?: string }
      if (!values?.name?.trim() || !values.adminUsername?.trim() || !values.adminPassword) {
        return { code: 400, message: '请填写租户名称、管理员账号和初始密码', data: null }
      }
      const id = String(Math.max(...MOCK_TENANTS.map((row) => Number(row.id))) + 1)
      MOCK_TENANTS.push({
        id,
        code: id,
        name: values.name.trim(),
        adminUsername: values.adminUsername.trim(),
        status: 0,
        createTime: '2026-10-22 09:00',
      })
      return { code: 0, message: 'ok', data: id }
    },
  },
  ...(['name', 'status'] as const).map((field) => ({
    method: 'PUT' as const,
    pattern: `/api/system/tenant/:id${field === 'status' ? '/status' : ''}` as `/${string}`,
    handler: (({ id }, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      if (id === '0') return { code: 403, message: '超管租户只能查看', data: null }
      const row = MOCK_TENANTS.find((item) => item.id === id)
      if (!row) return { code: 404, message: '租户不存在', data: null }
      const values = body as { name?: string; status?: number }
      if (field === 'name') {
        if (!values?.name?.trim()) return { code: 400, message: '请输入租户名称', data: null }
        row.name = values.name.trim()
      } else {
        if (values?.status !== 0 && values?.status !== 1) {
          return { code: 400, message: '租户状态无效', data: null }
        }
        row.status = values.status
      }
      return { code: 0, message: 'ok', data: null }
    }) as MockHandler,
  })),
]
