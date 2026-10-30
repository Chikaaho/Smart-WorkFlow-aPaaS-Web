import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@/foundation/auth/token'
import { dispatchMock } from './index'
import { MOCK_APP_STORE, MOCK_APP_SEEDS, switchMockSession } from './seeds'

const call = (method: string, path: string, body?: unknown) =>
  dispatchMock(method, `/form/app/manage${path}`, '/api', {}, body)
describe('application appearance mock round trip', () => {
  beforeEach(() => {
    MOCK_APP_STORE.clear()
    for (const app of MOCK_APP_SEEDS) MOCK_APP_STORE.set(app.id, structuredClone(app))
    switchMockSession('superadmin')
    setAccessToken('ui-test-only')
  })
  it('preserves appearance and all visibility dimensions when listing and editing', async () => {
    const created = await call('POST', '', {
      name: '外观验证',
      icon: 'Calendar',
      color: '#2563eb',
      visibleScopeType: 'SPECIFIED',
      userIds: [1],
      deptIds: [2],
      roleCodes: ['member'],
      postIds: [3],
      tenantIds: [4],
    })
    expect(created?.code).toBe(0)
    const id = (created?.data as { id: string }).id
    const listed = await call('GET', '/list')
    expect((listed?.data as { id: string }[]).find((app) => app.id === id)).toMatchObject({
      icon: 'Calendar',
      color: '#2563eb',
      visibleUserIds: [1],
      visibleDeptIds: [2],
      visibleRoleCodes: ['member'],
      visiblePostIds: [3],
      visibleTenantIds: [4],
    })
    expect(
      (
        await call('PUT', `/${id}`, {
          name: '已修改',
          icon: 'Grid',
          color: '#059669',
          visibleScopeType: 'ALL',
        })
      )?.code,
    ).toBe(0)
    expect(MOCK_APP_STORE.get(id)).toMatchObject({
      icon: 'Grid',
      color: '#059669',
      visibleDeptIds: null,
      visibleRoleCodes: null,
    })
  })
  it('rejects invalid colors and protects apps with existing references', async () => {
    expect(
      (await call('POST', '', { name: '无效', color: 'url(x)', visibleScopeType: 'ALL' }))?.code,
    ).toBe(400)
    expect(MOCK_APP_STORE.size).toBe(MOCK_APP_SEEDS.length)
    expect((await call('DELETE', '/mock-app-001'))?.code).toBe(400)
    expect(MOCK_APP_STORE.has('mock-app-001')).toBe(true)
  })
  it('rejects unauthenticated and unauthorized mutations', async () => {
    switchMockSession('user')
    expect((await call('POST', '', { name: '越权', visibleScopeType: 'ALL' }))?.code).toBe(403)
    setAccessToken(null)
    expect((await call('DELETE', '/mock-app-002'))?.code).toBe(401)
  })
})
