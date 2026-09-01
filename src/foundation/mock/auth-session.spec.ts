import { describe, it, expect, beforeAll } from 'vitest'
import {
  MOCK_SESSION_DATA,
  MOCK_SESSION_DATA_ADMIN,
  MOCK_MENU_TREE,
  MOCK_ROLE_MENU_BINDINGS,
  switchMockSession,
  type MockMenuNode,
} from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations, MOCK_LOGIN_CHALLENGES } from './handlers'

/**
 * Mock 会话/菜单过滤语义专项（M02-F02/F03，对齐真实后端 AuthMeController /
 * SysMenuServiceImpl.getMenuTree 非超管分支，step3b 后端请求级实证 A1-A9）。
 *
 * 覆盖：
 *   - 登录按 username 切换会话（superadmin 超管 / admin 普通管理员 / user 普通用户）
 *   - /auth/me：超管固定全量会话；非超管会话快照且 permissions 与绑定按钮行一致
 *   - 双角色身份语义（对齐后端）：admin 普通管理员非超管，权限由 admin 角色绑定装配；
 *     superadmin 超管旁路，角色码集合与普通 admin 严格区分
 *   - /auth/menus：超管全量树 / 非超管按绑定过滤（正面，含祖先保留、sort 升序）/
 *     无绑定空树 / 撤权（清空绑定）后空树 / 过滤树与按钮行保留
 *   - 真实 buildTree 语义：父不在绑定集合时子树不挂载（孤儿丢弃），
 *     与按钮 permission 装配（不过滤父链）分离——菜单可见与按钮可用分别有证据
 *
 * 注意：handler 原地 mutate MOCK_CURRENT_SESSION 与 MOCK_ROLE_MENU_BINDINGS
 * （与真实后端内存存储语义一致），本文件内按描述顺序依赖状态变化；
 * vitest 每 spec 文件独立模块作用域，不影响其他测试文件。
 * 每个用例开头显式 switchMockSession / 重置绑定，避免顺序耦合。
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

/** P45：先签发挑战，再携带验证码/UUID/时间戳登录（对齐真实登录契约） */
async function mockLogin(username: string, password: string) {
  const challenge = await mock<{ captchaImage: string; captchaId: string }>(
    'GET',
    '/auth/challenge',
  )
  return mock(
    'POST',
    '/auth/login',
    {},
    {
      username,
      password,
      captcha: MOCK_LOGIN_CHALLENGES.get(challenge!.data!.captchaId)!,
      captchaId: challenge!.data!.captchaId,
      timestamp: String(Date.now()),
    },
  )
}

/** 收集过滤树中所有节点的 id（DFS 先序，含子孙）。 */
function collectIds(nodes: MockMenuNode[]): string[] {
  const out: string[] = []
  const walk = (list: MockMenuNode[]) => {
    for (const n of list) {
      out.push(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

describe('foundation/mock 会话与 /auth/menus 角色过滤', () => {
  beforeAll(() => {
    const patterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'POST /api/auth/login',
      'GET /api/system/auth/me',
      'GET /api/system/auth/menus',
    ]) {
      expect(patterns).toContain(p)
    }
  })

  // ── 会话切换 ────────────────────────────────────────────────

  it('登录 admin 后 /auth/me 返回普通管理员会话（superAdmin=false，权限由 admin 绑定装配，与超管严格区分）', async () => {
    await mockLogin('admin', 'admin123')
    const r = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(r!.code).toBe(0)
    expect(r!.data.superAdmin).toBe(false)
    expect(r!.data.user.username).toBe('admin')
    expect(r!.data.roles).toEqual(['admin'])
    expect(r!.data).toEqual(MOCK_SESSION_DATA_ADMIN)
  })

  it('登录 superadmin 后 /auth/me 返回超管会话（superAdmin=true，角色码=superadmin，固定全量 permissions）', async () => {
    await mockLogin('superadmin', 'admin123')
    const r = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(r!.code).toBe(0)
    expect(r!.data.superAdmin).toBe(true)
    expect(r!.data.user.username).toBe('superadmin')
    expect(r!.data.roles).toEqual(['superadmin'])
    expect(r!.data).toEqual(MOCK_SESSION_DATA)
  })

  it('双角色身份：admin（非超管）权限由 admin 角色绑定装配，且不与超管全量混淆', async () => {
    switchMockSession('admin')
    const me = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(me!.data.superAdmin).toBe(false)
    // 权限集合 = admin 绑定（MOCK_ROLE_MENU_BINDINGS['2']）中的按钮行（menu_type=2）permission
    // （与真实后端契约一致：仅按钮行进入 permissions，页面/目录 permission 不入集合）
    expect(me!.data.permissions).toContain('system:user:add')
    expect(me!.data.permissions).toContain('system:role:edit')
    // 与超管会话完全区分：role 码集合不同，permissions 也不等于超管固定全量
    expect(me!.data.roles).not.toContain('superadmin')
    expect(MOCK_SESSION_DATA.roles).toEqual(['superadmin'])
    expect(me!.data.permissions).not.toEqual(MOCK_SESSION_DATA.permissions)
  })

  it('双角色身份：admin 非超管 /auth/menus 按 admin 绑定过滤，superadmin 返回全量（对照）', async () => {
    // admin：按 MOCK_ROLE_MENU_BINDINGS['2'] 过滤（目录 1 在绑定内 → 根链可见）
    switchMockSession('admin')
    const adminMenus = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    const adminIds = collectIds(adminMenus!.data ?? [])
    expect(adminIds).toContain('1')
    expect(adminIds).not.toContain('10') // 字典管理未绑定

    // superadmin：全量树
    switchMockSession('superadmin')
    const superMenus = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    const superIds = collectIds(superMenus!.data ?? [])
    const allIds = collectIds(MOCK_MENU_TREE)
    expect(superIds.length).toBe(allIds.length)
  })

  it('登录 user 后 /auth/me 返回普通用户会话（superAdmin=false，空绑定 → 空 permissions）', async () => {
    MOCK_ROLE_MENU_BINDINGS['3'] = []
    await mockLogin('user', 'user123')
    const r = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(r!.code).toBe(0)
    expect(r!.data.superAdmin).toBe(false)
    expect(r!.data.user.username).toBe('user')
    expect(r!.data.roles).toEqual(['user'])
    expect(r!.data.permissions).toEqual([])
  })

  // ── /auth/menus：超管全量 ───────────────────────────────────

  it('超管会话 /auth/menus 返回全量菜单树（含未绑定行，与后端旁路一致）', async () => {
    switchMockSession('superadmin')
    const r = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    expect(r!.code).toBe(0)
    const ids = collectIds(r!.data ?? [])
    const allIds = collectIds(MOCK_MENU_TREE)
    expect(ids).toEqual(allIds)
    expect(ids.length).toBe(allIds.length)
  })

  // ── /auth/menus：非超管按绑定过滤（正面，含祖先保留） ────────

  it('非超管正面：绑定 [1,11,12,110] → 祖先链保留（1→11→110），未绑定 13/14/18 不可达', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [1, 11, 12, 110]
    const r = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    expect(r!.code).toBe(0)
    const tree = r!.data!
    const ids = collectIds(tree)
    expect(ids).toContain('1')
    expect(ids).toContain('11')
    expect(ids).toContain('12')
    expect(ids).toContain('110')
    expect(ids).not.toContain('13') // 未绑定页面不可达
    expect(ids).not.toContain('14')
    expect(ids).not.toContain('18')
    // 根目录 1 在集合 → 链完整：1 → [11,12]，按钮 110 挂 11 下（可导航）
    expect(tree).toHaveLength(1)
    expect(tree[0]!.id).toBe('1')
    const children = tree[0]!.children ?? []
    expect(children.map((c) => c.id)).toEqual(['11', '12']) // sort 升序（11→2, 12→3）
    const page11 = children.find((c) => c.id === '11')
    expect(page11!.children?.map((c) => c.id)).toEqual(['110'])
  })

  it('非超管：仅绑目录 1 → 目录可见但未绑定页面不混入（子集过滤）', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [1]
    const r = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    const tree = r!.data!
    expect(tree).toHaveLength(1)
    expect(tree[0]!.id).toBe('1')
    // 未绑定页面不混入：children 为空（挂载逻辑仍递归，但无命中节点）
    expect(tree[0]!.children ?? []).toEqual([])
  })

  it('孤儿子节点不被挂载（真实 buildTree 语义）：仅绑按钮 110 → 树空，但按钮权限仍装配', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [110] // 父 11 不在集合 → 子树整体丢弃
    const menus = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    expect(menus!.data).toEqual([])

    // 权限装配与菜单挂载分离（真实后端对称：loadPermissions 不过滤父链）——
    // 「菜单不可见」与「按钮权限存在」各自有证据，不互相掩盖
    const me = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(me!.data.permissions).toEqual(['system:user:add'])
  })

  it('过滤后同层按 sort 升序（与后端 Comparator 一致）', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [1, 13, 11, 12] // 乱序绑定
    const r = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    const tree = r!.data!
    const children = tree[0]!.children ?? []
    expect(children.map((c) => c.id)).toEqual(['11', '12', '13']) // sort 2/3/4 升序
  })

  // ── 无绑定空树 / 撤权 ──────────────────────────────────────

  it('无绑定 → 空树（code=0）', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = []
    const r = await mock<typeof MOCK_MENU_TREE>('GET', '/system/auth/menus')
    expect(r!.code).toBe(0)
    expect(r!.data).toEqual([])
  })

  it('撤权（清空绑定）后 → 空树且按钮权限同步清空（与真实后端 A3 一致）', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [1, 11, 12, 110]
    const before = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    expect(collectIds(before!.data ?? [])).toContain('11')

    MOCK_ROLE_MENU_BINDINGS['3'] = [] // 撤权
    const after = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    expect(after!.code).toBe(0)
    expect(after!.data).toEqual([])
    const me = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(me!.data.permissions).toEqual([])
  })

  it('过滤树与按钮行保留：绑定 [1,11,110] → 菜单可见且按钮权限可用（同源）', async () => {
    switchMockSession('user')
    MOCK_ROLE_MENU_BINDINGS['3'] = [1, 11, 110]
    const me = await mock<typeof MOCK_SESSION_DATA>('GET', '/system/auth/me')
    expect(me!.data.permissions).toEqual(['system:user:add']) // 按钮 110 的 permission
    const menus = await mock<MockMenuNode[]>('GET', '/system/auth/menus')
    const ids = collectIds(menus!.data ?? [])
    expect(ids).toEqual(['1', '11', '110'])
  })
})
