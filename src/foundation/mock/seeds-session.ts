/**
 * 会话/用户种子：登录用户、超管与管理员会话快照、当前会话切换、会话权限装配。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */
import { MOCK_MENU_TREE } from './seeds-menu'
import type { MockMenuNode } from './seeds-menu'
import { MOCK_ROLES_LIST, MOCK_ROLE_MENU_BINDINGS } from './seeds-system'

export const MOCK_USERS = [
  { username: 'superadmin', displayName: '超级管理员', password: 'admin123' },
  { username: 'admin', displayName: '管理员', password: 'admin123' },
  { username: 'user', displayName: '普通用户', password: 'user123' },
]

export interface MockSessionData {
  user: {
    id: string
    username: string
    displayName: string
    deptId: string
    tenantId: string
    avatar: string | null
  }
  permissions: string[]
  roles: string[]
  superAdmin: boolean
}

export function collectSessionPermissions(roles: string[]): string[] {
  const roleIds = MOCK_ROLES_LIST.filter((r) => roles.includes(r.code)).map((r) => Number(r.id))
  const bindings = roleIds.flatMap((id) => MOCK_ROLE_MENU_BINDINGS[String(id)] ?? [])
  const idSet = new Set(bindings)
  const perms = new Set<string>()
  const walk = (nodes: MockMenuNode[]): void => {
    for (const node of nodes) {
      if (idSet.has(Number(node.id)) && node.menuType === 2 && node.permission) {
        perms.add(node.permission)
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(MOCK_MENU_TREE as MockMenuNode[])
  return [...perms]
}

export const MOCK_SESSION_DATA: MockSessionData = {
  user: {
    id: '1',
    username: 'superadmin',
    displayName: '超级管理员',
    deptId: '101',
    tenantId: '0',
    avatar: null,
  },
  permissions: [
    'system:view',
    'form:view',
    'form:form:view',
    'workflow:view',
    'notify:view',
    'notify:template:view',
    'notify:template:manage',
    'notify:batch:send',
    'workflow:catalog:view',
    'workflow:catalog:manage',
    'workflow:cc:view',
    'workflow:urge',
    'notify:record:view',
    'notify:record:resend',
    'system:user:list',
    'system:role:list',
    'system:dept:list',
    'system:post:list',
    'system:userGroup:list',
    'system:userGroup:manage',
    'storage:view',
    'job:view',
    'job:list',
    'job:log',
    'agent:view',
    'agent:model:view',
    'agent:model:manage',
    'agent:model:test',
    'agent:tool:view',
    'agent:tool:manage',
  ],
  roles: ['superadmin'],
  superAdmin: true,
}

export const MOCK_SESSION_DATA_ADMIN: MockSessionData = {
  user: {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    deptId: '101',
    tenantId: '1',
    avatar: null,
  },
  // 权限在文件底部依赖声明完备后补齐（collectSessionPermissions 依赖 MOCK_ROLES_LIST /
  // MOCK_ROLE_MENU_BINDINGS，此处处于 TDZ 之前不可调用）
  permissions: [],
  roles: ['admin'],
  superAdmin: false,
}

export const MOCK_SESSION_DATA_USER: MockSessionData = {
  user: {
    id: '2',
    username: 'user',
    displayName: '普通用户',
    deptId: '101',
    tenantId: '1',
    avatar: null,
  },
  permissions: [],
  roles: ['user'],
  superAdmin: false,
}

export const MOCK_SESSION_DATA_UNAUTHENTICATED: MockSessionData = {
  user: {
    id: '',
    username: '',
    displayName: '',
    deptId: '',
    tenantId: '',
    avatar: null,
  },
  permissions: [],
  roles: [],
  superAdmin: false,
}

export let MOCK_CURRENT_SESSION: MockSessionData = MOCK_SESSION_DATA

export function switchMockSession(username: string): void {
  if (username === 'unauthenticated') {
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA_UNAUTHENTICATED
  } else if (username === 'admin') {
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA_ADMIN
    // admin 权限实时按角色绑定重算（bindings 可能被测试/菜单管理 mutate，
    // 固定快照会导致权限与菜单脱节——对齐真实后端每次认证实时装配）。
    // P32 表单数据导入导出按钮权限由 MOCK_ROLE_MENU_BINDINGS['2'] 的
    // V43 按钮 230/231/232 经同源装配自然获得，不再单独 push（避免与 /auth/me 重建路径漂移）。
    MOCK_SESSION_DATA_ADMIN.permissions = collectSessionPermissions(['admin'])
  } else if (username === 'user') {
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA_USER
  } else {
    // 默认 / superadmin / 其他 → 超管会话
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA
  }
}
