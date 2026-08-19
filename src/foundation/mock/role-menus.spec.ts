import { describe, it, expect, beforeAll } from 'vitest'
import { MOCK_ROLES_LIST, MOCK_MENU_TREE, MOCK_ROLE_MENU_BINDINGS } from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * 角色菜单/按钮权限 Mock handler 一致性专项（M02-F02/F03，契约对齐 step1 §5）。
 *
 * 覆盖 GET/PUT /system/role/{id}/menus 全部契约语义：
 *   - GET：已绑定 menuId 数字数组 / 空角色 data=[] / 未知角色 data=[]（真实 listMenuIds 不校验角色存在）
 *   - PUT：整体替换、null/[]=清空、重复保存幂等（filter+distinct）、未知角色静默成功（孤儿关系）、
 *     superadmin → code=400「内置超管角色不可修改或删除」且绑定不被修改
 *   - 状态真实更新：PUT 后 GET / 页面回填必须能观察到（方向 §5 风险 1 防护）
 *   - 夹具语义：按钮节点（menuType=2 / component=null / permission 非空）、superadmin dataScope=0（陈旧值清除）
 *
 * 注意：handler 直接原地 mutate MOCK_ROLE_MENU_BINDINGS（与真实后端内存存储语义一致），
 * 本文件内按描述顺序依赖状态变化；vitest 每 spec 文件独立模块作用域，不影响其他测试文件。
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

describe('foundation/mock role-menus handler 一致性', () => {
  beforeAll(() => {
    const patterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/system/role'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of ['GET /api/system/role/:id/menus', 'PUT /api/system/role/:id/menus']) {
      expect(patterns).toContain(p)
    }
  })

  // ── 夹具语义（方向 §2.2 陈旧值清除 + 按钮节点补齐） ──────────

  it('superadmin 夹具 dataScope 已修正为 0（对齐后端 DataScope ordinal ALL=0，陈旧值 5 已清除）', () => {
    const superadmin = MOCK_ROLES_LIST.find((r) => r.code === 'superadmin')
    expect(superadmin).toBeDefined()
    expect(superadmin!.dataScope).toBe(0)
    expect(MOCK_ROLES_LIST.some((r) => r.dataScope === 5)).toBe(false)
  })

  it('权限树夹具含按钮节点（menuType=2 / component=null / permission 非空）', () => {
    const buttons: Array<{ menuType: number; component: string | null; permission?: string }> = []
    const walk = (nodes: Array<Record<string, unknown>>) => {
      for (const n of nodes) {
        if (n.menuType === 2) buttons.push(n as never)
        if (Array.isArray(n.children)) walk(n.children as Array<Record<string, unknown>>)
      }
    }
    walk(MOCK_MENU_TREE as unknown as Array<Record<string, unknown>>)
    expect(buttons.length).toBeGreaterThanOrEqual(6)
    for (const b of buttons) {
      expect(b.menuType).toBe(2)
      expect(b.component).toBeNull()
      expect(typeof b.permission).toBe('string')
      expect((b.permission ?? '').length).toBeGreaterThan(0)
    }
  })

  it('夹具 id 唯一（菜单树 / 角色列表无重复 id，避免 setCheckedKeys 漂移）', () => {
    const menuIds: string[] = []
    const walk = (nodes: Array<Record<string, unknown>>) => {
      for (const n of nodes) {
        menuIds.push(n.id as string)
        if (Array.isArray(n.children)) walk(n.children as Array<Record<string, unknown>>)
      }
    }
    walk(MOCK_MENU_TREE as unknown as Array<Record<string, unknown>>)
    expect(new Set(menuIds).size).toBe(menuIds.length)
    const roleIds = MOCK_ROLES_LIST.map((r) => r.id)
    expect(new Set(roleIds).size).toBe(roleIds.length)
  })

  // ── GET：读取 ────────────────────────────────────────────────

  it('GET：admin（id=2）返回全量绑定 menuId 数字数组', async () => {
    const r = await mock<number[]>('GET', '/system/role/2/menus')
    expect(r!.code).toBe(0)
    expect(Array.isArray(r!.data)).toBe(true)
    expect(r!.data).toEqual(MOCK_ROLE_MENU_BINDINGS['2'])
    expect(r!.data.every((n) => typeof n === 'number')).toBe(true)
    // 包含目录/页面/按钮混合行（真实 listMenuIds 不过滤 menu_type）
    expect(r!.data).toContain(1)
    expect(r!.data).toContain(11)
    expect(r!.data).toContain(110)
  })

  it('GET：user（id=3）无绑定 → data=[]（code=0）', async () => {
    const r = await mock<number[]>('GET', '/system/role/3/menus')
    expect(r!.code).toBe(0)
    expect(r!.data).toEqual([])
  })

  it('GET：未知角色 → data=[]（与真实 listMenuIds 一致：不校验角色存在）', async () => {
    const r = await mock<number[]>('GET', '/system/role/99999/menus')
    expect(r!.code).toBe(0)
    expect(r!.data).toEqual([])
  })

  // ── PUT：替换保存 / 清空 / 幂等 / 状态真实更新 ───────────────

  it('PUT：替换保存后 GET 可读回（状态真实更新，方向 §5 风险 1 防护）', async () => {
    const put = await mock('PUT', '/system/role/3/menus', {}, [11, 110])
    expect(put!.code).toBe(0)
    expect(put!.data).toBeNull()

    const after = await mock<number[]>('GET', '/system/role/3/menus')
    expect(after!.data).toEqual([11, 110])
  })

  it('PUT：空数组=清空 → GET 返回 []', async () => {
    await mock('PUT', '/system/role/3/menus', {}, [])
    const after = await mock<number[]>('GET', '/system/role/3/menus')
    expect(after!.code).toBe(0)
    expect(after!.data).toEqual([])
  })

  it('PUT：body=null 同样清空（真实 updateMenuIds null→仅删除）', async () => {
    await mock('PUT', '/system/role/3/menus', {}, [11, 110])
    await mock('PUT', '/system/role/3/menus', {}, null)
    const after = await mock<number[]>('GET', '/system/role/3/menus')
    expect(after!.data).toEqual([])
  })

  it('PUT：重复保存幂等（去重 + 结果一致）', async () => {
    await mock('PUT', '/system/role/3/menus', {}, [11, 110, 11])
    const first = await mock<number[]>('GET', '/system/role/3/menus')
    await mock('PUT', '/system/role/3/menus', {}, [11, 110, 11])
    const second = await mock<number[]>('GET', '/system/role/3/menus')
    expect(first!.data).toEqual([11, 110])
    expect(second!.data).toEqual(first!.data)
    expect(second!.data).toHaveLength(2)
  })

  // ── PUT：受保护角色 / 未知角色 ────────────────────────────────

  it('PUT：superadmin（id=1）→ code=400「内置超管角色不可修改或删除」，绑定不被修改', async () => {
    const before = await mock<number[]>('GET', '/system/role/1/menus')
    const put = await mock('PUT', '/system/role/1/menus', {}, [1, 11])
    expect(put!.code).toBe(400)
    expect(put!.message).toBe('内置超管角色不可修改或删除')
    expect(put!.data).toBeNull()

    const after = await mock<number[]>('GET', '/system/role/1/menus')
    expect(after!.data).toEqual(before!.data)
  })

  it('PUT：未知角色 → 静默成功 code=0（真实为写孤儿关系，方向 §3 非目标不处理）', async () => {
    const put = await mock('PUT', '/system/role/99999/menus', {}, [11])
    expect(put!.code).toBe(0)
    const after = await mock<number[]>('GET', '/system/role/99999/menus')
    expect(after!.data).toEqual([11])
  })

  // ── 匹配器：:id 精确段匹配，不会吞 /role/:id/menus ───────────

  it('路由区分：/system/role/:id 与 /system/role/:id/menus 互不误命中', async () => {
    const role = await mock('GET', '/system/role/2')
    expect(role!.code).toBe(0)
    expect((role!.data as { id: string }).id).toBe('2')

    const menus = await mock<number[]>('GET', '/system/role/2/menus')
    expect(menus!.code).toBe(0)
    expect(Array.isArray(menus!.data)).toBe(true)
  })
})
