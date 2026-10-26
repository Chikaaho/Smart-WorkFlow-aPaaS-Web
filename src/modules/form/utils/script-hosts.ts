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
}

export interface ScriptOrgDept {
  id: string
  name: string
  parentId: string | null
}

export interface ScriptOrgContext {
  users: ScriptOrgUser[]
  depts: ScriptOrgDept[]
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
