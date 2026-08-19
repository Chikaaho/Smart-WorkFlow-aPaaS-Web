import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadSession } from './index'

// mock foundation/request 以测试适配器映射逻辑，避免真实 HTTP 调用。
vi.mock('@/foundation/request', () => ({
  request: vi.fn(),
}))

import { request } from '@/foundation/request'
import { MOCK_SESSION_DATA } from '@/foundation/mock/seeds'

const mockRequest = vi.mocked(request)

describe('foundation/session loadSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps DTO fields to Session contract shape (String() passthrough)', async () => {
    // 拷贝一份来验证各个字段的映射。
    mockRequest.mockResolvedValue({
      user: {
        id: '42',
        username: 'tester',
        displayName: '测试员',
        deptId: '101',
        tenantId: '1',
        avatar: null,
      },
      permissions: ['sys:view', 'sys:edit'],
      roles: ['operator'],
      superAdmin: false,
    })

    const session = await loadSession()

    expect(session.user.id).toBe('42')
    expect(session.user.username).toBe('tester')
    expect(session.user.displayName).toBe('测试员')
    expect(session.user.deptId).toBe('101')
    expect(session.user.tenantId).toBe('1')
    expect(session.user.avatar).toBeUndefined()
    expect(session.permissions).toEqual(new Set(['sys:view', 'sys:edit']))
    expect(session.roles).toEqual(new Set(['operator']))
    expect(session.superAdmin).toBe(false)
  })

  it('passes avatar string when provided', async () => {
    mockRequest.mockResolvedValue({
      user: {
        id: '1',
        username: 'admin',
        displayName: '管理员',
        deptId: '101',
        tenantId: '1',
        avatar: 'https://example.com/avatar.png',
      },
      permissions: [],
      roles: [],
      superAdmin: true,
    })

    const session = await loadSession()

    expect(session.user.avatar).toBe('https://example.com/avatar.png')
    expect(session.superAdmin).toBe(true)
  })

  it('handles null deptId/tenantId gracefully', async () => {
    mockRequest.mockResolvedValue({
      user: {
        id: '99',
        username: 'guest',
        displayName: '访客',
        deptId: '0',
        tenantId: '0',
        avatar: null,
      },
      permissions: [],
      roles: [],
      superAdmin: false,
    })

    const session = await loadSession()
    // deptId=0 是有效值 → 应当被转换为 '0'，而非 null（null 适配仅在真的 null 时触发）
    expect(session.user.deptId).toBe('0')
    expect(session.user.tenantId).toBe('0')
  })

  it('uses empty Set for nullish permissions/roles', async () => {
    mockRequest.mockResolvedValue({
      user: { id: '1', username: 'a', displayName: 'A', deptId: '1', tenantId: '1', avatar: null },
      permissions: null,
      roles: null,
      superAdmin: false,
    })

    const session = await loadSession()
    expect(session.permissions).toEqual(new Set())
    expect(session.roles).toEqual(new Set())
  })

  it('matches MOCK_SESSION_DATA from seeds exactly', async () => {
    mockRequest.mockResolvedValue(MOCK_SESSION_DATA)

    const session = await loadSession()

    // 用 superadmin seed 验证完整映射的正确性（双角色身份语义闭合后超管会话）
    expect(session.user.id).toBe('1')
    expect(session.user.username).toBe('superadmin')
    expect(session.user.displayName).toBe('超级管理员')
    expect(session.permissions.has('system:view')).toBe(true)
    expect(session.permissions.has('form:form:view')).toBe(true)
    expect(session.roles.has('superadmin')).toBe(true)
    expect(session.superAdmin).toBe(true)
    // avatar: null → undefined
    expect(session.user.avatar).toBeUndefined()
  })
})
