/**
 * 用户管理前端类型 —— 镜像后端实体 SysUser 字段。
 *
 * SysUser 不含 password 字段（后端不返回密文），不含 deleted/version/tenantId 噪音列。
 * 创建/更新表单使用 UserFormRequest DTO（含 plainPassword 字段）。
 */

/** 用户实体（镜像 SysUser，不含 password 密文） */
export interface SysUser {
  id?: string
  username: string
  realName?: string
  email?: string
  phone?: string
  sex?: number
  status?: number
  deptId?: string
  isAdmin?: boolean
  avatar?: string
  /** 审计字段 */
  createTime?: string
  updateTime?: string
  roleIds?: string[]
  postIds?: string[]
}

/** 用户创建/更新表单（镜像 UserFormRequest DTO） */
export interface UserFormRequest {
  id?: string
  username: string
  realName?: string
  email?: string
  phone?: string
  sex?: number
  status?: number
  deptId?: string
  /** 明文密码，仅创建时必填，更新时可选 */
  plainPassword?: string
  roleIds?: string[]
  postIds?: string[]
}

/** 用户分页筛选 */
export interface UserFilter {
  username?: string
  realName?: string
  status?: number
  deptId?: string
  postId?: string
  roleId?: string
}
