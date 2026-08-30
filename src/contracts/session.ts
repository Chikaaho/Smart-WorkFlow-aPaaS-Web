/**
 * 会话规范态：业务层只认这里的形状，后端响应经 adapter（foundation/session）映射进来。
 * 字段形状已锁定（决策文档 v2 §3），不得新增/拆分字段。
 */

export interface SessionUser {
  id: string
  username: string
  displayName: string
  deptId: string | null
  tenantId: string | null
  avatar?: string
}

export interface Session {
  user: SessionUser
  permissions: Set<string>
  roles: Set<string>
  superAdmin: boolean
}
