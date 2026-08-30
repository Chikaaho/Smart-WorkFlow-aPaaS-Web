import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasPerm, usePermission, isPermVisible } from '@/foundation/permission'

// vi.hoisted ensures mock variable is accessible inside the hoisted vi.mock factory
const mockUseUserStore = vi.hoisted(() => vi.fn())

/** Mutable shared mock session state across tests in this file */
interface MockSession {
  superAdmin: boolean
  permissions: Set<string>
  roles: Set<string>
}
const mockSession: MockSession = {
  superAdmin: false,
  permissions: new Set<string>(),
  roles: new Set<string>(),
}

function resetMock() {
  mockSession.superAdmin = false
  mockSession.permissions.clear()
  mockSession.roles.clear()
}

vi.mock('@/stores/user', () => ({
  useUserStore: mockUseUserStore,
}))

describe('hasPerm authorization chain（D143 等价自动化）', () => {
  beforeEach(() => {
    resetMock()
    mockUseUserStore.mockReturnValue(mockSession)
  })

  it('授权访问 — hasPerm(agent:model:view) 返回 true 当权限存在于 session.permissions', () => {
    mockSession.permissions.add('agent:model:view')
    expect(hasPerm('agent:model:view')).toBe(true)
  })

  it('撤权拒绝 — hasPerm(agent:model:view) 返回 false 当权限不存在于 session.permissions', () => {
    // 无权限 → false
    expect(hasPerm('agent:model:view')).toBe(false)
  })

  it('superadmin 豁免 — superAdmin=true 时所有 hasPerm(code) 返回 true', () => {
    mockSession.superAdmin = true
    // 即使 permissions 为空，superadmin 也应通过所有检查
    expect(hasPerm('agent:model:view')).toBe(true)
    expect(hasPerm('system:user:add')).toBe(true)
    expect(hasPerm('any:arbitrary:code')).toBe(true)
  })

  it('isPermVisible 空会话回退 — 未登录（placeholder 态）时恒真不拦截', () => {
    // placeholder: 非超管 + 空权限 + 空角色
    expect(isPermVisible('agent:model:view')).toBe(true)
  })

  it('后端统一 — agent:model:view 覆盖列表/详情/节点三个只读端点前端显隐', () => {
    mockSession.permissions.add('agent:model:view')
    const { hasPerm: hp } = usePermission()
    expect(hp('agent:model:view')).toBe(true)
  })
})
