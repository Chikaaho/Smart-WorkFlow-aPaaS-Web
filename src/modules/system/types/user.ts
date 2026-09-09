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
  posts?: PostAssociation[]
}

/** 用户岗位任职（镜像 UserController.PostAssignment）：岗位在部门内承担（I1） */
export interface PostAssociation {
  postId: string
  /** 任职部门；缺省时后端回落用户主部门 */
  deptId?: string
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
  /** 岗位任职（I1 起，替代 postIds 数字数组） */
  posts?: PostAssociation[]
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
