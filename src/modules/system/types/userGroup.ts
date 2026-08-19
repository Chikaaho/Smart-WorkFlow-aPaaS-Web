/**
 * 用户组前端类型 —— 镜像后端实体 SysUserGroup。
 *
 * 字段语义（D112）：
 * - groupCode 业务标识：租户内稳定唯一，创建后不可修改（后端强制忽略变更）
 * - status 0=启用 1=停用（停用组保留配置与成员，不得作为新引用对象）
 * - memberIds 成员用户 ID 列表（非持久字段，详情回填）
 */

/** 用户组实体（镜像 SysUserGroup） */
export interface SysUserGroup {
  id?: string
  /** 业务标识（租户内唯一，创建后不可修改） */
  groupCode: string
  /** 展示名称 */
  groupName: string
  /** 状态：0=启用 1=停用 */
  status?: number
  /** 说明 */
  remark?: string
  /** 成员用户 ID 列表（回填用） */
  memberIds?: string[]
  /** 审计字段 */
  createTime?: string
  updateTime?: string
}

/** 用户组创建/更新表单（镜像 UserGroupFormRequest DTO） */
export interface UserGroupFormRequest {
  id?: string
  groupCode: string
  groupName: string
  status?: number
  remark?: string
  memberIds?: string[]
}

/** 用户组列表筛选 */
export interface UserGroupFilter {
  groupCode?: string
  groupName?: string
  status?: number
}
