/** 临时 UI 验收数据；仅由 dev:mock 装载，不作为后端租户行为证据。 */
import type { MockHandler, MockMethod } from './index'
import { getAccessToken } from '@/foundation/auth/token'
import { MOCK_CURRENT_SESSION } from './seeds'

interface MockTenant {
  id: string
  code: string
  name: string
  adminUserId?: string | null
  adminUsername?: string | null
  status: number
  createTime: string
  creationRequestId?: string
}
interface MockTenantAdministrator {
  id: string
  tenantId: string
  username: string
  realName?: string | null
}

// Mock 层只镜像接口形状；业务模块不反向依赖 Mock。
export const MOCK_TENANTS: MockTenant[] = [
  {
    id: '0',
    code: '0',
    name: '超管',
    adminUsername: 'admin',
    adminUserId: '1',
    status: 0,
    createTime: '2026-10-01 09:00',
  },
  {
    id: '1',
    code: '1',
    name: 'CH 科技',
    adminUsername: 'chenxi',
    adminUserId: '71001',
    status: 0,
    createTime: '2026-10-10 09:00',
  },
  {
    id: '2',
    code: '2',
    name: '深圳中心',
    adminUsername: 'linyue',
    adminUserId: '72001',
    status: 0,
    createTime: '2026-10-15 14:30',
  },
]

export const MOCK_TENANT_ADMINISTRATORS: MockTenantAdministrator[] = [
  { id: '71001', tenantId: '1', username: 'chenxi', realName: '陈曦' },
  { id: '72001', tenantId: '2', username: 'linyue', realName: '林悦' },
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

/** 既有组织演示数据固定归属租户 1；显式新建对象沿用自身归属。仅隔离 UI 数据。 */
export function mockTenantView<T extends object>(row: T, defaultTenant = '1') {
  const tenantId = String((row as { tenantId?: unknown }).tenantId ?? defaultTenant)
  return {
    ...row,
    tenantId,
    tenantName: MOCK_TENANTS.find((tenant) => tenant.id === tenantId)?.name ?? '',
  }
}

export const tenantMockRegistrations: {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}[] = [
  {
    method: 'GET',
    pattern: '/api/system/tenant-context/current',
    handler: () => {
      if (!getAccessToken() || !MOCK_CURRENT_SESSION.user.id)
        return { code: 401, message: '未认证', data: null }
      const tenant = MOCK_TENANTS.find((row) => row.id === MOCK_CURRENT_SESSION.user.tenantId)
      return tenant
        ? {
            code: 0,
            message: 'ok',
            data: {
              id: tenant.id,
              code: tenant.code,
              name: tenant.name,
              writable: tenant.status === 0,
            },
          }
        : { code: 404, message: '租户不存在', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/tenant-context/options',
    handler: (_params, query) => {
      const denied = accessGate()
      if (denied) return denied
      const keyword = (query.keyword ?? '').trim()
      return {
        code: 0,
        message: 'ok',
        data: MOCK_TENANTS.filter(
          (row) =>
            (!keyword || row.name.includes(keyword) || row.code.includes(keyword)) &&
            (query.creatable !== 'true' || row.status === 0),
        ).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          writable: row.status === 0,
        })),
      }
    },
  },

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
      const values = body as {
        name?: string
        adminUsername?: string
        adminPassword?: string
        requestId?: string
      }
      if (!values?.requestId || !/^[A-Za-z0-9_-]{16,64}$/.test(values.requestId)) {
        return { code: 400, message: '创建请求标识无效', data: null }
      }
      const existing = MOCK_TENANTS.find((row) => row.creationRequestId === values.requestId)
      if (existing) return { code: 0, message: 'ok', data: existing.id }
      if (!values?.name?.trim() || !values.adminUsername?.trim() || !values.adminPassword) {
        return { code: 400, message: '请填写租户名称、管理员账号和初始密码', data: null }
      }
      const id = String(Math.max(...MOCK_TENANTS.map((row) => Number(row.id))) + 1)
      const adminId = `73${id.padStart(3, '0')}`
      MOCK_TENANTS.push({
        id,
        code: id,
        name: values.name.trim(),
        adminUsername: values.adminUsername.trim(),
        adminUserId: adminId,
        creationRequestId: values.requestId,
        status: 0,
        createTime: '2026-10-22 09:00',
      })
      MOCK_TENANT_ADMINISTRATORS.push({
        id: adminId,
        tenantId: id,
        username: values.adminUsername.trim(),
      })
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/tenant/:id/administrators',
    handler: ({ id }) => {
      const denied = accessGate()
      if (denied) return denied
      if (id === '0') return { code: 403, message: '超管租户只能查看', data: null }
      if (!MOCK_TENANTS.some((row) => row.id === id))
        return { code: 404, message: '租户不存在', data: null }
      return {
        code: 0,
        message: 'ok',
        data: MOCK_TENANT_ADMINISTRATORS.filter((user) => user.tenantId === id).map(
          ({ id: userId, username, realName }) => ({ id: userId, username, realName }),
        ),
      }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/tenant/:id/administrator',
    handler: ({ id }, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      if (id === '0') return { code: 403, message: '超管租户只能查看', data: null }
      const tenant = MOCK_TENANTS.find((row) => row.id === id)
      if (!tenant) return { code: 404, message: '租户不存在', data: null }
      const adminId = String((body as { adminUserId?: string })?.adminUserId ?? '')
      const admin = MOCK_TENANT_ADMINISTRATORS.find(
        (user) => user.tenantId === id && user.id === adminId,
      )
      if (!admin) return { code: 400, message: '请选择该租户内有效的管理员', data: null }
      tenant.adminUserId = admin.id
      tenant.adminUsername = admin.username
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/tenant/:id/administrator',
    handler: ({ id }, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      if (id === '0') return { code: 403, message: '超管租户只能查看', data: null }
      const tenant = MOCK_TENANTS.find((row) => row.id === id)
      if (!tenant) return { code: 404, message: '租户不存在', data: null }
      if (tenant.adminUserId) return { code: 400, message: '已配置管理员', data: null }
      const values = body as { adminUsername?: string; adminPassword?: string }
      if (
        !values?.adminUsername?.trim() ||
        !values.adminPassword ||
        values.adminPassword.length < 6
      ) {
        return { code: 400, message: '请填写管理员账号和有效初始密码', data: null }
      }
      const adminId = String(
        Math.max(73000, ...MOCK_TENANT_ADMINISTRATORS.map((user) => Number(user.id))) + 1,
      )
      MOCK_TENANT_ADMINISTRATORS.push({
        id: adminId,
        tenantId: id,
        username: values.adminUsername.trim(),
      })
      tenant.adminUserId = adminId
      tenant.adminUsername = values.adminUsername.trim()
      return { code: 0, message: 'ok', data: adminId }
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
