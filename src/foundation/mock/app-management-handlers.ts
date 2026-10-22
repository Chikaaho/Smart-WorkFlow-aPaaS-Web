/** 应用外观交互的 dev:mock 数据闭环，不承担正式授权或持久化验收。 */
import { getAccessToken } from '@/foundation/auth/token'
import type { FormAppSaveReq } from '@/contracts/app-center'
import type { MockHandler, MockMethod } from './index'
import { MOCK_APP_STORE, MOCK_CURRENT_SESSION, type MockApp } from './seeds'

function accessGate() {
  if (!getAccessToken() || !MOCK_CURRENT_SESSION.user.id)
    return { code: 401, message: '未认证', data: null }
  if (
    !MOCK_CURRENT_SESSION.superAdmin &&
    !MOCK_CURRENT_SESSION.permissions.includes('form:app:manage')
  )
    return { code: 403, message: '无权限', data: null }
  return null
}
function fields(body: unknown) {
  const req = body as FormAppSaveReq | null
  if (
    !req ||
    typeof req.name !== 'string' ||
    !req.name.trim() ||
    req.name.length > 100 ||
    !['ALL', 'SPECIFIED'].includes(req.visibleScopeType)
  )
    return null
  if (req.color && !/^#[0-9a-f]{6}$/i.test(req.color)) return null
  const specified = req.visibleScopeType === 'SPECIFIED'
  return {
    name: req.name.trim(),
    icon: req.icon ?? null,
    color: req.color ?? null,
    sortNo: req.sortNo ?? 0,
    visibleScopeType: req.visibleScopeType,
    visibleUserIds: specified ? [...(req.userIds ?? [])] : null,
    visibleDeptIds: specified ? [...(req.deptIds ?? [])] : null,
    visibleRoleCodes: specified ? [...(req.roleCodes ?? [])] : null,
    visiblePostIds: specified ? [...(req.postIds ?? [])] : null,
    visibleTenantIds: specified ? [...(req.tenantIds ?? [])] : null,
  }
}
let nextId = 1
export const appManagementMockRegistrations: {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}[] = [
  {
    method: 'POST',
    pattern: '/api/form/app/manage',
    handler: (_params, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      const values = fields(body)
      if (!values) return { code: 400, message: '应用信息无效', data: null }
      let id: string
      do {
        id = `mock-app-ui-${nextId++}`
      } while (MOCK_APP_STORE.has(id))
      const app: MockApp = {
        ...values,
        id,
        status: 'ENABLED',
        source: 'MANUAL',
        dirs: [],
        directForms: [],
      }
      MOCK_APP_STORE.set(id, app)
      return { code: 0, message: 'ok', data: { ...app, formCount: 0, dirCount: 0 } }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/form/app/manage/:id',
    handler: (params, _query, body) => {
      const denied = accessGate()
      if (denied) return denied
      const app = MOCK_APP_STORE.get(params.id!)
      if (!app) return { code: 1700, message: '应用不存在或不可见', data: null }
      const values = fields(body)
      if (!values) return { code: 400, message: '应用信息无效', data: null }
      Object.assign(app, values)
      return { code: 0, message: 'ok', data: app }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/form/app/manage/:id',
    handler: (params) => {
      const denied = accessGate()
      if (denied) return denied
      const app = MOCK_APP_STORE.get(params.id!)
      if (app && (app.dirs.length || app.directForms.length))
        return { code: 400, message: '应用仍有目录或表单，不能删除', data: null }
      MOCK_APP_STORE.delete(params.id!)
      return { code: 0, message: 'ok', data: null }
    },
  },
]
