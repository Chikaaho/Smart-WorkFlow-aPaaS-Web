import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@/foundation/auth/token'
import { dispatchMock } from './index'
import { switchMockSession } from './seeds'
import { MOCK_TENANTS } from './tenant-handlers'

const initial = structuredClone(MOCK_TENANTS)
const call = (method: string, path: string, body?: unknown, query = {}) =>
  dispatchMock(method, `/system/tenant${path}`, '/api', query, body)

describe('tenant UI mock handlers', () => {
  beforeEach(() => {
    MOCK_TENANTS.splice(0, MOCK_TENANTS.length, ...structuredClone(initial))
    switchMockSession('superadmin')
    setAccessToken('ui-test-only')
  })

  it('filters and paginates the same tenant records', async () => {
    const page = await call('GET', '/page', undefined, { pageNum: 2, pageSize: 1 })
    expect(page?.data).toMatchObject({ total: 3, records: [{ code: '1' }] })
    await call('PUT', '/2/status', { status: 1 })
    const filtered = await call('GET', '/page', undefined, { name: '深圳', status: 1 })
    expect(filtered?.data).toMatchObject({ total: 1, records: [{ id: '2', status: 1 }] })
  })

  it('rejects missing fields without creating a partial row and never retains the password', async () => {
    expect((await call('POST', '', { name: '分公司' }))?.code).toBe(400)
    expect(MOCK_TENANTS).toHaveLength(3)
    const created = await call('POST', '', {
      name: '分公司',
      adminUsername: 'admin',
      adminPassword: 'ui-only',
    })
    expect(created?.code).toBe(0)
    expect(MOCK_TENANTS.at(-1)).toMatchObject({ name: '分公司', adminUsername: 'admin' })
    expect(JSON.stringify(MOCK_TENANTS)).not.toContain('ui-only')
  })

  it('keeps root read-only and rejects unauthenticated and ordinary sessions', async () => {
    expect((await call('PUT', '/0', { name: '改名' }))?.code).toBe(403)
    expect((await call('PUT', '/0/status', { status: 1 }))?.code).toBe(403)
    switchMockSession('admin')
    expect((await call('GET', '/page'))?.code).toBe(403)
    setAccessToken(null)
    expect((await call('GET', '/page'))?.code).toBe(401)
    expect(MOCK_TENANTS).toEqual(initial)
  })
})
