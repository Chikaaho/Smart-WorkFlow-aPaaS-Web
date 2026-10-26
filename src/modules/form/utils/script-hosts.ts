/**
 * 表单脚本补充宿主函数（direction-ui-completion-020 · DR06 缺口）：
 * - 组织关联查询：用户信息/用户查询/部门信息/上级部门/部门列表；
 *   数据源只来自调用前已由服务端授权的目录快照（当前租户启用用户 + 部门树），
 *   不新增越权查询、不在脚本里直连接口；未装载快照时明确报错（拒绝语义清晰）。
 * - 日期计算：当前日期/当前时间/日期加减/日期差，纯函数、非法输入明确报错。
 * - 明细控件选项：读取子表列（字典/单多选）的选项值。
 *
 * 宿主函数必须同步返回，故组织快照由页面在脚本执行前装载后传入；
 * 快照内的对象按稳定 ID 命中，未命中返回 null / 空数组，不猜测展示名。
 */

export interface ScriptOrgUser {
  id: string
  name: string
  /** 主部门 ID（组织快照装载时填充；缺省表示未返回）。 */
  deptId?: string | null
  /** 有效角色 ID（停用角色与无效关联不进入快照）。 */
  roleIds?: string[]
  /** 有效岗位 ID（停用岗位与无效关联不进入快照）。 */
  postIds?: string[]
}

export interface ScriptOrgDept {
  id: string
  name: string
  parentId: string | null
}

export interface ScriptOrgRole {
  id: string
  code: string
  name: string
}

export interface ScriptOrgPost {
  id: string
  code: string
  name: string
}

export interface ScriptOrgContext {
  users: ScriptOrgUser[]
  depts: ScriptOrgDept[]
  /** 当前租户启用角色（有权限的目录快照；缺省表示服务端未返回）。 */
  roles?: ScriptOrgRole[]
  /** 当前租户启用岗位（有权限的目录快照；缺省表示服务端未返回）。 */
  posts?: ScriptOrgPost[]
}

export interface ScriptSchemaFieldLike {
  name: string
  label?: string
  type: string
  options?: { value?: string; key?: string }[]
  subFields?: ScriptSchemaFieldLike[]
}

export type ScriptHost = (...args: never[]) => unknown

const DAY_MS = 24 * 60 * 60 * 1000

function requireOrg(
  orgContext: (() => ScriptOrgContext | null) | undefined,
  fn: string,
): ScriptOrgContext {
  const context = orgContext?.()
  if (!context) {
    throw new Error(`${fn}: 组织目录未装载，暂不能查询（请稍后重试）`)
  }
  return context
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDateArg(input: unknown, fn: string): Date {
  const text = String(input ?? '').trim()
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (!matched) throw new Error(`${fn}: 无效日期「${text}」，需为 YYYY-MM-DD`)
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  if (Number.isNaN(date.getTime())) throw new Error(`${fn}: 无效日期「${text}」`)
  return date
}

function fieldOptions(field: ScriptSchemaFieldLike): string[] {
  return (field.options ?? []).map((option) => option.value || option.key || '').filter(Boolean)
}

/**
 * 组织 + 日期 + 明细选项宿主函数（中文名 + 英文别名，两个脚本运行面共用）。
 * `getSchema` 为当前表单定义快照读取；`orgContext` 为已授权组织目录快照读取。
 */
export function createSupplementalHostFunctions(
  getSchema: () => { fields: ScriptSchemaFieldLike[] } | null,
  orgContext?: () => ScriptOrgContext | null,
): Record<string, ScriptHost> {
  const findField = (name: unknown): ScriptSchemaFieldLike => {
    const text = String(name ?? '').trim()
    const field = (getSchema()?.fields ?? []).find((item) => item.name === text)
    if (!field) throw new Error(`字段「${text}」不存在`)
    return field
  }
  const findSubField = (tableName: unknown, column: unknown): ScriptSchemaFieldLike => {
    const table = findField(tableName)
    if (table.type !== 'TABLE') throw new Error(`字段「${table.name}」不是子表`)
    const text = String(column ?? '').trim()
    const sub = (table.subFields ?? []).find((item) => item.name === text)
    if (!sub) throw new Error(`子表「${table.name}」不存在列「${text}」`)
    return sub as ScriptSchemaFieldLike
  }
  const optionValues = (tableName: unknown, column: unknown): string[] =>
    fieldOptions(findSubField(tableName, column))

  const roleDirectory = (fn: string): ScriptOrgRole[] => {
    const context = requireOrg(orgContext, fn)
    if (!context.roles) throw new Error(`${fn}: 角色目录未装载，暂不能查询`)
    return context.roles
  }
  const postDirectory = (fn: string): ScriptOrgPost[] => {
    const context = requireOrg(orgContext, fn)
    if (!context.posts) throw new Error(`${fn}: 岗位目录未装载，暂不能查询`)
    return context.posts
  }
  const findUser = (id: unknown) => {
    const context = requireOrg(orgContext, '获取用户信息')
    return context.users.find((item) => item.id === String(id ?? '').trim()) ?? null
  }
  const findRole = (ref: unknown): ScriptOrgRole | null => {
    const roles = roleDirectory('获取角色信息')
    const text = String(ref ?? '').trim()
    return roles.find((role) => role.id === text || role.code === text) ?? null
  }
  const findPost = (ref: unknown): ScriptOrgPost | null => {
    const posts = postDirectory('获取岗位信息')
    const text = String(ref ?? '').trim()
    return posts.find((post) => post.id === text || post.code === text) ?? null
  }
  const userRoleIds = (id: unknown): string[] => findUser(id)?.roleIds ?? []
  const userPostIds = (id: unknown): string[] => findUser(id)?.postIds ?? []

  const dateNow = (): string => formatDate(new Date())

  return {
    获取用户信息: (id) => {
      const context = requireOrg(orgContext, '获取用户信息')
      const user = context.users.find((item) => item.id === String(id ?? '').trim())
      return user ? { id: user.id, name: user.name } : null
    },
    getUserInfo: (id) => {
      const context = requireOrg(orgContext, '获取用户信息')
      const user = context.users.find((item) => item.id === String(id ?? '').trim())
      return user ? { id: user.id, name: user.name } : null
    },
    获取用户姓名: (id) => {
      const context = requireOrg(orgContext, '获取用户姓名')
      return context.users.find((item) => item.id === String(id ?? '').trim())?.name ?? null
    },
    getUserName: (id) => {
      const context = requireOrg(orgContext, '获取用户姓名')
      return context.users.find((item) => item.id === String(id ?? '').trim())?.name ?? null
    },
    查询用户: (keyword) => {
      const context = requireOrg(orgContext, '查询用户')
      const text = String(keyword ?? '').trim()
      if (!text) return context.users.map((item) => item.id)
      return context.users
        .filter((item) => item.id === text || item.name.includes(text))
        .map((item) => item.id)
    },
    searchUsers: (keyword) => {
      const context = requireOrg(orgContext, '查询用户')
      const text = String(keyword ?? '').trim()
      if (!text) return context.users.map((item) => item.id)
      return context.users
        .filter((item) => item.id === text || item.name.includes(text))
        .map((item) => item.id)
    },
    获取部门信息: (id) => {
      const context = requireOrg(orgContext, '获取部门信息')
      const dept = context.depts.find((item) => item.id === String(id ?? '').trim())
      return dept ? { id: dept.id, name: dept.name, parentId: dept.parentId } : null
    },
    getDeptInfo: (id) => {
      const context = requireOrg(orgContext, '获取部门信息')
      const dept = context.depts.find((item) => item.id === String(id ?? '').trim())
      return dept ? { id: dept.id, name: dept.name, parentId: dept.parentId } : null
    },
    获取上级部门: (id) => {
      const context = requireOrg(orgContext, '获取上级部门')
      const dept = context.depts.find((item) => item.id === String(id ?? '').trim())
      return dept?.parentId ?? null
    },
    getParentDept: (id) => {
      const context = requireOrg(orgContext, '获取上级部门')
      const dept = context.depts.find((item) => item.id === String(id ?? '').trim())
      return dept?.parentId ?? null
    },
    获取部门名称: (id) => {
      const context = requireOrg(orgContext, '获取部门名称')
      return context.depts.find((item) => item.id === String(id ?? '').trim())?.name ?? null
    },
    getDeptName: (id) => {
      const context = requireOrg(orgContext, '获取部门名称')
      return context.depts.find((item) => item.id === String(id ?? '').trim())?.name ?? null
    },
    获取部门成员: (id) => {
      const context = requireOrg(orgContext, '获取部门成员')
      const deptId = String(id ?? '').trim()
      return context.users
        .filter((user) => user.deptId != null && user.deptId === deptId)
        .map((user) => user.id)
    },
    getDeptMembers: (id) => {
      const context = requireOrg(orgContext, '获取部门成员')
      const deptId = String(id ?? '').trim()
      return context.users
        .filter((user) => user.deptId != null && user.deptId === deptId)
        .map((user) => user.id)
    },
    获取部门列表: () => {
      const context = requireOrg(orgContext, '获取部门列表')
      return context.depts.map((item) => item.id)
    },
    getDeptIdList: () => {
      const context = requireOrg(orgContext, '获取部门列表')
      return context.depts.map((item) => item.id)
    },
    获取用户部门: (id) => findUser(id)?.deptId ?? null,
    getUserDept: (id) => findUser(id)?.deptId ?? null,
    获取用户部门名称: (id) => {
      const context = requireOrg(orgContext, '获取用户部门名称')
      const deptId = findUser(id)?.deptId
      return deptId == null
        ? null
        : (context.depts.find((dept) => dept.id === deptId)?.name ?? null)
    },
    getUserDeptName: (id) => {
      const context = requireOrg(orgContext, '获取用户部门名称')
      const deptId = findUser(id)?.deptId
      return deptId == null
        ? null
        : (context.depts.find((dept) => dept.id === deptId)?.name ?? null)
    },

    获取角色信息: (ref) => findRole(ref),
    getRoleInfo: (ref) => findRole(ref),
    获取角色名称: (ref) => findRole(ref)?.name ?? null,
    getRoleName: (ref) => findRole(ref)?.name ?? null,
    查询角色: (keyword) => {
      const roles = roleDirectory('查询角色')
      const text = String(keyword ?? '').trim()
      return roles
        .filter(
          (role) =>
            !text || role.id === text || role.code.includes(text) || role.name.includes(text),
        )
        .map((role) => role.id)
    },
    searchRoles: (keyword) => {
      const roles = roleDirectory('查询角色')
      const text = String(keyword ?? '').trim()
      return roles
        .filter(
          (role) =>
            !text || role.id === text || role.code.includes(text) || role.name.includes(text),
        )
        .map((role) => role.id)
    },
    获取角色列表: () => roleDirectory('获取角色列表').map((role) => role.id),
    getRoleIdList: () => roleDirectory('获取角色列表').map((role) => role.id),
    获取角色成员: (ref) => {
      const role = findRole(ref)
      if (!role) return []
      return requireOrg(orgContext, '获取角色成员')
        .users.filter((user) => (user.roleIds ?? []).includes(role.id))
        .map((user) => user.id)
    },
    getRoleMembers: (ref) => {
      const role = findRole(ref)
      if (!role) return []
      return requireOrg(orgContext, '获取角色成员')
        .users.filter((user) => (user.roleIds ?? []).includes(role.id))
        .map((user) => user.id)
    },
    获取用户角色: (id) => userRoleIds(id),
    getUserRoleIds: (id) => userRoleIds(id),
    获取用户角色编码: (id) => {
      const roles = roleDirectory('获取用户角色编码')
      const roleIds = new Set(userRoleIds(id))
      return roles.filter((role) => roleIds.has(role.id)).map((role) => role.code)
    },
    getUserRoleCodes: (id) => {
      const roles = roleDirectory('获取用户角色编码')
      const roleIds = new Set(userRoleIds(id))
      return roles.filter((role) => roleIds.has(role.id)).map((role) => role.code)
    },

    获取岗位信息: (ref) => findPost(ref),
    getPostInfo: (ref) => findPost(ref),
    获取岗位名称: (ref) => findPost(ref)?.name ?? null,
    getPostName: (ref) => findPost(ref)?.name ?? null,
    查询岗位: (keyword) => {
      const posts = postDirectory('查询岗位')
      const text = String(keyword ?? '').trim()
      return posts
        .filter(
          (post) =>
            !text || post.id === text || post.code.includes(text) || post.name.includes(text),
        )
        .map((post) => post.id)
    },
    searchPosts: (keyword) => {
      const posts = postDirectory('查询岗位')
      const text = String(keyword ?? '').trim()
      return posts
        .filter(
          (post) =>
            !text || post.id === text || post.code.includes(text) || post.name.includes(text),
        )
        .map((post) => post.id)
    },
    获取岗位列表: () => postDirectory('获取岗位列表').map((post) => post.id),
    getPostIdList: () => postDirectory('获取岗位列表').map((post) => post.id),
    获取岗位成员: (ref) => {
      const post = findPost(ref)
      if (!post) return []
      return requireOrg(orgContext, '获取岗位成员')
        .users.filter((user) => (user.postIds ?? []).includes(post.id))
        .map((user) => user.id)
    },
    getPostMembers: (ref) => {
      const post = findPost(ref)
      if (!post) return []
      return requireOrg(orgContext, '获取岗位成员')
        .users.filter((user) => (user.postIds ?? []).includes(post.id))
        .map((user) => user.id)
    },
    获取用户岗位: (id) => userPostIds(id),
    getUserPostIds: (id) => userPostIds(id),
    获取用户岗位编码: (id) => {
      const posts = postDirectory('获取用户岗位编码')
      const postIds = new Set(userPostIds(id))
      return posts.filter((post) => postIds.has(post.id)).map((post) => post.code)
    },
    getUserPostCodes: (id) => {
      const posts = postDirectory('获取用户岗位编码')
      const postIds = new Set(userPostIds(id))
      return posts.filter((post) => postIds.has(post.id)).map((post) => post.code)
    },

    当前日期: dateNow,
    getToday: dateNow,
    当前时间: () => {
      const now = new Date()
      return `${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    },
    getNow: () => {
      const now = new Date()
      return `${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    },
    日期加减: (input, days) => {
      const date = parseDateArg(input, '日期加减')
      const delta = Number(days)
      if (!Number.isFinite(delta)) throw new Error(`日期加减: 天数「${String(days)}」不是数字`)
      return formatDate(new Date(date.getTime() + Math.round(delta) * DAY_MS))
    },
    addDays: (input, days) => {
      const date = parseDateArg(input, '日期加减')
      const delta = Number(days)
      if (!Number.isFinite(delta)) throw new Error(`日期加减: 天数「${String(days)}」不是数字`)
      return formatDate(new Date(date.getTime() + Math.round(delta) * DAY_MS))
    },
    日期差: (start, end) => {
      const from = parseDateArg(start, '日期差')
      const to = parseDateArg(end, '日期差')
      return Math.round((to.getTime() - from.getTime()) / DAY_MS)
    },
    dateDiff: (start, end) => {
      const from = parseDateArg(start, '日期差')
      const to = parseDateArg(end, '日期差')
      return Math.round((to.getTime() - from.getTime()) / DAY_MS)
    },

    获取子表字段选项: optionValues,
    getTableColumnOptions: optionValues,
  }
}
