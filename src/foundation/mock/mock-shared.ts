/**
 * Mock 共享辅助：被多个域 handler 文件引用的分页、权限装配、会话 UID 等。
 * 域专属辅助放各 *-handlers.ts；此处只收跨域共享，避免长成新的上帝文件。
 */
import {
  MOCK_CURRENT_SESSION,
  MOCK_MENU_TREE,
  MOCK_ROLES_LIST,
  MOCK_ROLE_MENU_BINDINGS,
} from './seeds'
import type { MockHandler, MockMethod } from './index'
import type { MockMenuNode } from './seeds'

export // ─── 会话/菜单过滤辅助（对齐真实后端 SysMenuServiceImpl 语义） ──

/** 当前会话（非超管）的全部角色 id。 */
function currentRoleIds(): number[] {
  const roles = MOCK_CURRENT_SESSION.roles
  return MOCK_ROLES_LIST.filter((r) => roles.includes(r.code)).map((r) => Number(r.id))
}

export /** 当前会话（非超管）可用的菜单 id 集合（跨角色绑定并集、数字归一）。 */
function currentMenuIds(): Set<number> {
  const ids = new Set<number>()
  for (const roleId of currentRoleIds()) {
    const bindings = MOCK_ROLE_MENU_BINDINGS[String(roleId)]
    if (bindings) for (const id of bindings) ids.add(id)
  }
  return ids
}

export /**
 * 当前会话（非超管）的按钮行 permission 装配（对齐 UserDetailsProviderImpl.loadByUserId：
 * 经 sys_role_menu 取按钮行 → permission 字段）。仅收集，不判断角色 status（与真实后端
 * 对称：菜单/权限侧不过滤角色 status，step3b A11 实证；mock 夹具角色均启用，无差异面）。
 * 超管不用本函数（/auth/me 对超管直接返回全量权限，与后端旁路一致）。
 */
function buildMockPermissions(): string[] {
  const perms = new Set<string>()
  if (MOCK_CURRENT_SESSION.superAdmin) return [...perms]
  const allowed = currentMenuIds()
  const collect = (nodes: MockMenuNode[]): void => {
    for (const node of nodes) {
      if (allowed.has(Number(node.id)) && node.menuType === 2 && node.permission) {
        perms.add(node.permission)
      }
      if (node.children?.length) collect(node.children)
    }
  }
  collect(MOCK_MENU_TREE as MockMenuNode[])
  return [...perms]
}

// ─── 注册条目类型 ────────────────────────────────────────

export interface MockRegistration {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}

export function mockSessionUid(): string {
  return MOCK_CURRENT_SESSION.user?.id ?? ''
}

export function paginateMock<T>(list: T[], query: Record<string, string>) {
  const pageNum = Math.max(1, Number(query.pageNum ?? '1'))
  const pageSize = Math.max(1, Number(query.pageSize ?? '10'))
  const start = (pageNum - 1) * pageSize
  return {
    records: list.slice(start, start + pageSize),
    total: list.length,
    pageNum,
    pageSize,
  }
}
