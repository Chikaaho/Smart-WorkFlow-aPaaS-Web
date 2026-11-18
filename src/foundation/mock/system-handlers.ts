/**
 * 系统管理 mock：用户/角色/部门/岗位/用户组/字典/工作台卡片/委托/审计。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { buildMockPermissions, currentMenuIds, mockSessionUid } from './mock-shared'
import {
  MOCK_CURRENT_SESSION,
  MOCK_DEPTS_LIST,
  MOCK_DICT_DATA,
  MOCK_DICT_TYPES,
  MOCK_MENU_TREE,
  MOCK_POSTS_LIST,
  MOCK_ROLES_LIST,
  MOCK_ROLE_MENU_BINDINGS,
  MOCK_SESSION_DATA,
  MOCK_USERS_LIST,
  MOCK_USER_GROUPS_LIST,
  MOCK_WORKSPACE_LAYOUTS,
} from './seeds'
import { mockTenantView } from './tenant-handlers'
import type { MockMenuNode, MockSessionData } from './seeds'
import type { MockRegistration } from './mock-shared'

export /**
 * 按真实后端 buildTree 语义过滤菜单树：
 * 仅在「节点 id ∈ 可用集合」时才挂载（父不在集合 → 该子树整体丢弃，孤儿子节点不挂载）；
 * 同层按 sort 升序（与后端 Comparator 一致）。节点浅拷贝，不改动共享夹具
 * （跨会话复用不污染：admin 全量树永远来自原始 MOCK_MENU_TREE）。
 */
function buildMockMenuTree(): MockMenuNode[] {
  const tree = MOCK_MENU_TREE as MockMenuNode[]
  if (MOCK_CURRENT_SESSION.superAdmin) return tree
  const allowed = currentMenuIds()
  if (allowed.size === 0) return []

  const pick = (nodes: MockMenuNode[]): MockMenuNode[] => {
    const picked: MockMenuNode[] = []
    for (const node of nodes) {
      if (!allowed.has(Number(node.id))) continue
      const clone: MockMenuNode = { ...node }
      if (node.children?.length) {
        clone.children = pick(node.children)
      }
      picked.push(clone)
    }
    picked.sort((a, b) => a.sort - b.sort)
    return picked
  }
  return pick(tree)
}

export function mockWorkspaceCardTypes() {
  return [
    {
      id: 9401,
      typeCode: 'todo',
      displayName: '我的待办',
      rendererKey: 'todo',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 2,
      status: 0,
    },
    {
      id: 9402,
      typeCode: 'stats',
      displayName: '统计概览',
      rendererKey: 'stats',
      metadataJson: '{}',
      defaultSpan: 2,
      defaultOrder: 1,
      status: 0,
    },
    {
      id: 9403,
      typeCode: 'favoriteItems',
      displayName: '快捷发起',
      rendererKey: 'favorites',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 3,
      status: 0,
    },
    {
      id: 9404,
      typeCode: 'activity',
      displayName: '业务动态',
      rendererKey: 'activity',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 4,
      status: 0,
    },
    {
      id: 9405,
      typeCode: 'efficiency',
      displayName: '流程效能',
      rendererKey: 'efficiency',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 5,
      status: 0,
    },
    {
      id: 9406,
      typeCode: 'drafts',
      displayName: '草稿',
      rendererKey: 'drafts',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 6,
      status: 0,
    },
    {
      id: 9407,
      typeCode: 'messages',
      displayName: '消息',
      rendererKey: 'messages',
      metadataJson: '{}',
      defaultSpan: 1,
      defaultOrder: 7,
      status: 0,
    },
  ]
}

export const systemMockRegistrations: MockRegistration[] = [
  // ── 当前用户会话 ──────────────────────────────────────────
  // GET /api/system/auth/me → SessionDTO
  // 真实后端：AuthMeController 按当前登录用户装配会话（超管 → 全量 permissions；
  // 非超管 → permissions 由角色绑定按钮行装配，见 UserDetailsProviderImpl.loadByUserId）。
  // mock 对齐：superadmin（超管旁路）→ MOCK_SESSION_DATA（固定全量权限）；
  // admin（普通管理员）/ user（非超管）→ 会话快照，permissions 取该用户角色绑定中的
  // 按钮行 permission（与 /auth/menus 的过滤同源，保证按钮显隐与菜单可见性一致）。
  {
    method: 'GET',
    pattern: '/api/system/auth/me',
    handler: () => {
      if (!MOCK_CURRENT_SESSION.user.id) {
        return { code: 401, message: '未认证', data: null }
      }
      if (MOCK_CURRENT_SESSION.superAdmin) {
        return { code: 0, message: 'ok', data: MOCK_SESSION_DATA }
      }
      const session: MockSessionData = {
        ...MOCK_CURRENT_SESSION,
        permissions: buildMockPermissions(),
      }
      return { code: 0, message: 'ok', data: session }
    },
  },
  // ── 当前用户菜单 ─────────────────────────────────────────
  // GET /api/system/auth/menus → MenuNode[]
  // 真实后端（step3b 请求级实证）：超管 → 全量树；非超管 → 按用户角色绑定
  // （sys_user_role → sys_role_menu）过滤，getMenuTree 仅在父节点存在于绑定集合时
  // 才挂载子节点 —— 孤儿子节点（父不在集合）不会被挂载，无绑定 → 空树。
  // 过滤后同层按 sort 升序（与后端 Comparator 一致）。
  {
    method: 'GET',
    pattern: '/api/system/auth/menus',
    handler: () => {
      const tree = buildMockMenuTree()
      return { code: 0, message: 'ok', data: tree }
    },
  },
  // ── 字典 ──────────────────────────────────────────────────
  // GET /api/system/dict/data/list/:type
  // 响应形状：ApiResponse<DictItemDTO[]>, DictItemDTO = { code: string, label: string }
  {
    method: 'GET',
    pattern: '/api/system/dict/data/list/:type',
    handler: (params) => ({
      code: 0,
      message: 'ok',
      data: MOCK_DICT_DATA[(params as Record<string, string>).type] ?? [],
    }),
  },
  // ── 字典类型清单（设计器 DICT 绑定下拉） ────────────────────
  // POST /api/system/dict/type/page?pageNum=&pageSize=
  // 响应严格对齐后端分页原始形状 BackendPageResult<{code,name}> =
  //   { records, total, pageNum, pageSize }（foundation/dict.listDictTypes 取 records）
  {
    method: 'POST',
    pattern: '/api/system/dict/type/page',
    handler: (_params, query) => ({
      code: 0,
      message: 'ok',
      data: {
        records: MOCK_DICT_TYPES,
        total: MOCK_DICT_TYPES.length,
        pageNum: Number(query.pageNum ?? 1),
        pageSize: Number(query.pageSize ?? 1000),
      },
    }),
  },
  {
    method: 'POST',
    pattern: '/api/system/post-delegate/page',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: { records: [], total: 0, pageNum: 1, pageSize: 10 },
    }),
  },
  {
    method: 'POST',
    pattern: '/api/system/post-delegate',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
  {
    method: 'PUT',
    pattern: '/api/system/post-delegate',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
  {
    method: 'PUT',
    pattern: '/api/system/post-delegate/:id/status',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
  {
    method: 'DELETE',
    pattern: '/api/system/post-delegate/:id',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
  // ── 用户管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/user/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = MOCK_USERS_LIST.map((row) => mockTenantView(row))
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.tenantId != null) list = list.filter((row) => row.tenantId === String(f.tenantId))
        const keyword = String(f.keyword ?? f.username ?? f.realName ?? '')
        if (keyword)
          list = list.filter((u) => u.username.includes(keyword) || u.realName.includes(keyword))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((u) => u.status === Number(f.status))
        if (f.deptId !== undefined && f.deptId !== null && f.deptId !== '') {
          const root = String(f.deptId)
          const children = new Set([root])
          let changed = true
          while (changed) {
            changed = false
            for (const dept of MOCK_DEPTS_LIST) {
              if (children.has(dept.parentId) && !children.has(dept.id)) {
                children.add(dept.id)
                changed = true
              }
            }
          }
          list = list.filter((u) => children.has(u.deptId))
        }
        if (f.postId)
          list = list.filter((u) => (u.posts ?? []).some((p) => p.postId === String(f.postId)))
        if (f.roleId) list = list.filter((u) => u.roleIds?.includes(String(f.roleId)))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const user = MOCK_USERS_LIST.find((u) => u.id === id)
      if (!user) return { code: 404, message: '用户不存在', data: null }
      return { code: 0, message: 'ok', data: mockTenantView(user) }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newUser = {
        id,
        tenantId: String(data.tenantId ?? '1'),
        username: String(data.username ?? ''),
        realName: String(data.realName ?? ''),
        email: String(data.email ?? ''),
        phone: String(data.phone ?? ''),
        sex: Number(data.sex ?? 0),
        status: Number(data.status ?? 0),
        deptId: String(data.deptId ?? ''),
        roleIds: Array.isArray(data.roleIds) ? data.roleIds.map(String) : [],
        posts: (Array.isArray(data.posts)
          ? data.posts.map((item: { postId: unknown; deptId?: unknown }) => ({
              postId: String(item.postId),
              ...(item.deptId === undefined || item.deptId === null
                ? {}
                : { deptId: String(item.deptId) }),
            }))
          : []) as { postId: string; deptId?: string }[],
        isAdmin: false,
        avatar: null,
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_USERS_LIST.push(newUser as (typeof MOCK_USERS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_USERS_LIST.findIndex((u) => u.id === String(data.id))
      if (idx === -1) return { code: 404, message: '用户不存在', data: null }
      const existing = MOCK_USERS_LIST[idx]
      MOCK_USERS_LIST[idx] = {
        ...existing,
        username: String(data.username ?? existing.username),
        realName: String(data.realName ?? existing.realName),
        email: String(data.email ?? existing.email),
        phone: String(data.phone ?? existing.phone),
        sex: data.sex !== undefined ? Number(data.sex) : existing.sex,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        deptId: data.deptId !== undefined ? String(data.deptId) : existing.deptId,
        roleIds: Array.isArray(data.roleIds) ? data.roleIds.map(String) : existing.roleIds,
        posts: (Array.isArray(data.posts)
          ? data.posts.map((item: { postId: unknown; deptId?: unknown }) => ({
              postId: String(item.postId),
              ...(item.deptId === undefined || item.deptId === null
                ? {}
                : { deptId: String(item.deptId) }),
            }))
          : existing.posts) as typeof existing.posts,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_USERS_LIST.findIndex((u) => u.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_USERS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id/roles',
    handler: (params) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      return user
        ? { code: 0, message: 'ok', data: [...(user.roleIds ?? [])] }
        : { code: 404, message: '用户不存在', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user/:id/roles',
    handler: (params, _query, body) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      const roleIds = Array.isArray(body) ? body.map(String) : []
      if (roleIds.includes('1')) return { code: 403, message: '不能绑定 superadmin', data: null }
      if (!user) return { code: 404, message: '用户不存在', data: null }
      user.roleIds = roleIds
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id/posts',
    handler: (params) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      // I1 契约：岗位任职为 {postId, deptId?} 对象数组
      const associations = (user?.posts ?? []).map((item) => ({
        postId: item.postId,
        ...(item.deptId ? { deptId: item.deptId } : {}),
      })) as Array<{ postId: string; deptId?: string }>
      return user
        ? { code: 0, message: 'ok', data: associations }
        : { code: 404, message: '用户不存在', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user/:id/posts',
    handler: (params, _query, body) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      if (!user) return { code: 404, message: '用户不存在', data: null }
      user.posts = (
        Array.isArray(body)
          ? body.map((item: { postId: unknown; deptId?: unknown }) => ({
              postId: String(item.postId),
              ...(item.deptId === undefined || item.deptId === null
                ? {}
                : { deptId: String(item.deptId) }),
            }))
          : []
      ) as typeof user.posts
      return { code: 0, message: 'ok', data: null }
    },
  },
  // ── 用户组管理 CRUD（D112：P28/I36） ────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/user-group/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_USER_GROUPS_LIST]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.groupCode) list = list.filter((g) => g.groupCode.includes(String(f.groupCode)))
        if (f.groupName) list = list.filter((g) => g.groupName.includes(String(f.groupName)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((g) => g.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/:id',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const group = MOCK_USER_GROUPS_LIST.find((g) => g.id === id)
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      return { code: 0, message: 'ok', data: { ...group, memberIds: [...group.memberIds] } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user-group',
    handler: (_params, _query, body) => {
      const data = (body ?? {}) as Record<string, unknown>
      if (!data.groupCode || !data.groupName)
        return { code: 400, message: '业务标识与组名称不能为空', data: null }
      const existing = MOCK_USER_GROUPS_LIST.find(
        (g) => g.groupCode === String(data.groupCode) && g.status !== undefined,
      )
      if (existing) return { code: 400, message: '用户组业务标识已存在', data: null }
      const nextId = String(Math.max(0, ...MOCK_USER_GROUPS_LIST.map((g) => Number(g.id))) + 1)
      const group = {
        id: nextId,
        groupCode: String(data.groupCode),
        groupName: String(data.groupName),
        status: data.status === undefined ? 0 : Number(data.status),
        remark: data.remark == null ? null : String(data.remark),
        memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
        createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updateTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      MOCK_USER_GROUPS_LIST.push(group)
      return { code: 0, message: 'ok', data: nextId }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group',
    handler: (_params, _query, body) => {
      const data = (body ?? {}) as Record<string, unknown>
      const idx = MOCK_USER_GROUPS_LIST.findIndex((g) => g.id === String(data.id))
      if (idx < 0) return { code: 404, message: '用户组不存在', data: null }
      const existing = MOCK_USER_GROUPS_LIST[idx]
      MOCK_USER_GROUPS_LIST[idx] = {
        ...existing,
        groupName: data.groupName != null ? String(data.groupName) : existing.groupName,
        status: data.status === undefined ? existing.status : Number(data.status),
        remark: data.remark == null ? existing.remark : String(data.remark),
        // 业务标识不可变：忽略请求携带的 groupCode 变更
        groupCode: existing.groupCode,
        updateTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user-group/:id',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const idx = MOCK_USER_GROUPS_LIST.findIndex((g) => g.id === id)
      if (idx < 0) return { code: 404, message: '用户组不存在', data: null }
      MOCK_USER_GROUPS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/disable',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.status = 1
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/enable',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.status = 0
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/:id/members',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      return { code: 0, message: 'ok', data: [...group.memberIds] }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.memberIds = Array.isArray(body) ? body.map(String) : []
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      const add = Array.isArray(body) ? body.map(String) : []
      group.memberIds = [...new Set([...group.memberIds, ...add])]
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      const remove = new Set(Array.isArray(body) ? body.map(String) : [])
      group.memberIds = group.memberIds.filter((id) => !remove.has(id))
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/candidates',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 20)
      const keyword = query.keyword ? String(query.keyword) : ''
      let list = MOCK_USERS_LIST.filter((u) => u.status === 0)
      if (keyword)
        list = list.filter((u) => u.username.includes(keyword) || u.realName.includes(keyword))
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  // ── 角色管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/role/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = MOCK_ROLES_LIST.map((row) =>
        mockTenantView(row, row.code === 'superadmin' ? '0' : '1'),
      )
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.tenantId != null) list = list.filter((row) => row.tenantId === String(f.tenantId))
        if (f.name) list = list.filter((r) => r.name.includes(String(f.name)))
        if (f.code) list = list.filter((r) => r.code.includes(String(f.code)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((r) => r.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/role/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const role = MOCK_ROLES_LIST.find((r) => r.id === id)
      if (!role) return { code: 404, message: '角色不存在', data: null }
      return { code: 0, message: 'ok', data: { ...role } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/role',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newRole = {
        id,
        name: String(data.name ?? ''),
        code: String(data.code ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 1),
        dataScope: 1,
        builtIn: false,
        description: String(data.description ?? ''),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_ROLES_LIST.push(newRole as (typeof MOCK_ROLES_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/role',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_ROLES_LIST.findIndex((r) => r.id === String(data.id))
      if (idx === -1) return { code: 404, message: '角色不存在', data: null }
      const existing = MOCK_ROLES_LIST[idx]
      MOCK_ROLES_LIST[idx] = {
        ...existing,
        name: String(data.name ?? existing.name),
        code: String(data.code ?? existing.code),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/role/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_ROLES_LIST.findIndex((r) => r.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_ROLES_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // ── 角色菜单/按钮权限绑定（M02-F02/F03，契约对齐 step1 §5） ──
  // GET /api/system/role/:id/menus → R<number[]>
  // 真实后端：SysRoleServiceImpl.listMenuIds 仅按 role_id 查 sys_role_menu，
  // 不校验角色是否存在、不过滤 menu_type（目录/页面/按钮全返回）。
  // 未知角色 → data=[]（code=0），与真实 API 一致（无绑定的空角色同样返回 []）。
  {
    method: 'GET',
    pattern: '/api/system/role/:id/menus',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const bindings = MOCK_ROLE_MENU_BINDINGS[id]
      return { code: 0, message: 'ok', data: bindings ? [...bindings] : [] }
    },
  },
  // PUT /api/system/role/:id/menus → R<null>
  // 真实后端：updateMenuIds = 先删后插；body=number[]，null/[]=清空；
  // 应用层 filter(nonNull).distinct() 去重（重复提交幂等）；未知角色静默成功（写孤儿关系）。
  // 受保护角色：built_in=true && code='superadmin' → 业务错误（HTTP 200 + body code=400，
  // 「内置超管角色不可修改或删除」），绑定不被修改（方向 §5 风险 4 / §6 验收 4）。
  {
    method: 'PUT',
    pattern: '/api/system/role/:id/menus',
    handler: (params, _query, body) => {
      const id = String((params as Record<string, string>).id)
      const role = MOCK_ROLES_LIST.find((r) => r.id === id)
      // superadmin 保护判定与后端一致：code 判定（真实后端不校验角色存在，
      // 仅当角色存在且 builtIn+code=superadmin 才拒绝）
      if (role?.builtIn === true && role.code === 'superadmin') {
        return { code: 400, message: '内置超管角色不可修改或删除', data: null }
      }
      // 先删后插（null / [] / 非数组均按清空处理）；应用层 filter+distinct 去重（幂等）
      const requested = Array.isArray(body)
        ? body.filter((n): n is number => n !== null && n !== undefined).map(Number)
        : []
      MOCK_ROLE_MENU_BINDINGS[id] = [...new Set(requested)]
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/system/role/:id/users → R<PageResult<SysUser>>（I1 角色成员反向视图）
  // 真实后端：sys_user_role 绑定关系的分页视图；按 id 升序；role 无成员返回空页。
  {
    method: 'GET',
    pattern: '/api/system/role/:id/users',
    handler: (params, query) => {
      const id = String((params as Record<string, string>).id)
      const pageNum = Math.max(Number(query.pageNum ?? 1) || 1, 1)
      const pageSize = Math.max(Number(query.pageSize ?? 10) || 10, 1)
      const members = MOCK_USERS_LIST.filter((u) => (u.roleIds ?? []).includes(id))
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: {
          records: members.slice(start, start + pageSize),
          total: members.length,
          pageNum,
          pageSize,
        },
      }
    },
  },
  // ── 部门管理 CRUD ──────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/system/dept/tree',
    handler: (_params, query) => {
      // 与后端契约对齐（I31）：name=包含匹配（trim 后空白等价未填写）、status=0/1 精确相等；
      // 结果 = 直接命中 + 沿 parentId 上溯至 '0' 或断链的祖先，去重，sort 升序稳定排序；
      // 无参数时返回全量（与旧行为一致）；非法 status 显式 400。
      const name = String(query.name ?? '').trim()
      const statusRaw = query.status
      const hasStatus = statusRaw !== undefined && statusRaw !== ''
      if (hasStatus && statusRaw !== '0' && statusRaw !== '1') {
        return { code: 400, message: '非法部门状态参数', data: null }
      }

      const owned = MOCK_DEPTS_LIST.map((row) => mockTenantView(row)).filter(
        (row) => query.tenantId == null || row.tenantId === query.tenantId,
      )
      let hits = [...owned]
      if (name) hits = hits.filter((d) => d.name.includes(name))
      if (hasStatus) hits = hits.filter((d) => d.status === Number(statusRaw))

      if (!name && !hasStatus) {
        // 无筛选条件：与现状一致，直接返回全量（保持既有顺序）
        return { code: 0, message: 'ok', data: hits }
      }

      // 祖先补全：沿 parentId 上溯（断链即停），Map 去重保证无重复节点
      const byId = new Map(owned.map((d) => [d.id, d]))
      const result = new Map<string, (typeof MOCK_DEPTS_LIST)[number]>()
      for (const hit of hits) {
        let cur: (typeof MOCK_DEPTS_LIST)[number] | undefined = hit
        while (cur && !result.has(cur.id)) {
          result.set(cur.id, cur)
          cur = cur.parentId && cur.parentId !== '0' ? byId.get(cur.parentId) : undefined
        }
      }
      // sort 升序（nullsLast）+ 同 sort 按 id 升序，与后端 Comparator(comparing(sort, nullsLast).thenComparing(id)) 一致
      const list = [...result.values()].sort(
        (a, b) =>
          (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) ||
          Number(a.id) - Number(b.id),
      )
      return { code: 0, message: 'ok', data: list }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/dept/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const dept = MOCK_DEPTS_LIST.find((d) => d.id === id)
      if (!dept) return { code: 404, message: '部门不存在', data: null }
      return { code: 0, message: 'ok', data: mockTenantView(dept) }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/dept',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newDept = {
        id,
        tenantId: String(data.tenantId ?? '1'),
        parentId: String(data.parentId ?? '0'),
        name: String(data.name ?? ''),
        code: String(data.code ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 0),
        ...(data.leaderId === undefined || data.leaderId === null || data.leaderId === ''
          ? {}
          : { leaderId: String(data.leaderId) }),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_DEPTS_LIST.push(newDept as unknown as (typeof MOCK_DEPTS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/dept',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_DEPTS_LIST.findIndex((d) => d.id === String(data.id))
      if (idx === -1) return { code: 404, message: '部门不存在', data: null }
      const existing = MOCK_DEPTS_LIST[idx]
      MOCK_DEPTS_LIST[idx] = {
        ...existing,
        parentId: data.parentId !== undefined ? String(data.parentId) : existing.parentId,
        name: String(data.name ?? existing.name),
        code: String(data.code ?? existing.code),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        leaderId:
          data.leaderId === undefined || data.leaderId === null || data.leaderId === ''
            ? undefined
            : String(data.leaderId),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      } as (typeof MOCK_DEPTS_LIST)[number]
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/dept/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_DEPTS_LIST.findIndex((d) => d.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_DEPTS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // ── 岗位管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/post/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = MOCK_POSTS_LIST.map((row) => mockTenantView(row))
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.tenantId != null) list = list.filter((row) => row.tenantId === String(f.tenantId))
        if (f.code) list = list.filter((p) => p.code.includes(String(f.code)))
        if (f.name) list = list.filter((p) => p.name.includes(String(f.name)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((p) => p.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/post/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const post = MOCK_POSTS_LIST.find((p) => p.id === id)
      if (!post) return { code: 404, message: '岗位不存在', data: null }
      return { code: 0, message: 'ok', data: { ...post } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/post',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newPost = {
        id,
        code: String(data.code ?? ''),
        name: String(data.name ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 1),
        description: String(data.description ?? ''),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_POSTS_LIST.push(newPost as (typeof MOCK_POSTS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/post',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_POSTS_LIST.findIndex((p) => p.id === String(data.id))
      if (idx === -1) return { code: 404, message: '岗位不存在', data: null }
      const existing = MOCK_POSTS_LIST[idx]
      MOCK_POSTS_LIST[idx] = {
        ...existing,
        code: String(data.code ?? existing.code),
        name: String(data.name ?? existing.name),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/post/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_POSTS_LIST.findIndex((p) => p.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_POSTS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/system/workspace/layout
  {
    method: 'GET',
    pattern: '/api/system/workspace/layout',
    handler: () => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const stored = MOCK_WORKSPACE_LAYOUTS[uid]
      if (!stored) {
        return {
          code: 0,
          message: 'ok',
          data: {
            custom: false,
            cardTypes: mockWorkspaceCardTypes(),
            layout: {
              cards: [
                { typeCode: 'stats', visible: true, order: 1, span: 2 },
                { typeCode: 'todo', visible: true, order: 2 },
                { typeCode: 'favoriteItems', visible: true, order: 3 },
                { typeCode: 'activity', visible: true, order: 4 },
                { typeCode: 'efficiency', visible: true, order: 5 },
                { typeCode: 'drafts', visible: true, order: 6 },
                { typeCode: 'messages', visible: true, order: 7 },
              ],
              favoriteItemKeys: [],
            },
          },
        }
      }
      return {
        code: 0,
        message: 'ok',
        data: { custom: true, cardTypes: mockWorkspaceCardTypes(), layout: stored.layout },
      }
    },
  },
  // GET /api/system/workspace/card-types
  {
    method: 'GET',
    pattern: '/api/system/workspace/card-types',
    handler: () => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      return { code: 0, message: 'ok', data: mockWorkspaceCardTypes() }
    },
  },
  // GET /api/system/workspace/card-types/manage
  {
    method: 'GET',
    pattern: '/api/system/workspace/card-types/manage',
    handler: () => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      return { code: 0, message: 'ok', data: mockWorkspaceCardTypes() }
    },
  },
  // PUT /api/system/workspace/layout
  {
    method: 'PUT',
    pattern: '/api/system/workspace/layout',
    handler: (_params, _query, body) => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const layout = body as {
        cards?: Array<{ typeCode?: string }>
        components?: Array<{ key?: string }>
      }
      const allowed = [
        'todo',
        'stats',
        'favoriteItems',
        'activity',
        'efficiency',
        'drafts',
        'messages',
      ]
      const cards = layout?.cards ?? layout?.components?.map((c) => ({ typeCode: c.key }))
      if (!cards?.length) return { code: 400, message: '布局缺少 cards', data: null }
      for (const c of cards) {
        if (!c.typeCode || !allowed.includes(c.typeCode))
          return { code: 400, message: `未知卡片类型: ${c.typeCode}`, data: null }
      }
      MOCK_WORKSPACE_LAYOUTS[uid] = { layout: { ...layout, cards } }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/system/workspace/layout — 恢复默认
  {
    method: 'DELETE',
    pattern: '/api/system/workspace/layout',
    handler: () => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      delete MOCK_WORKSPACE_LAYOUTS[uid]
      return { code: 0, message: 'ok', data: null }
    },
  },
]
