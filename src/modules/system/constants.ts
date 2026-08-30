/**
 * 系统管理状态语义常量（仅服务用户页 / 部门页）。
 *
 * 与后端契约对齐（I51 状态语义对齐）：
 * - 用户 sys_user：0=正常、1=停用、2=锁定（AuthController 登录校验仅 status==0 放行，
 *   status==2 报「账号已锁定」，其余含 null 报「账号已停用」；字典 sys_user_status）
 * - 部门 sys_dept：0=正常、1=停用（仅 0/1，无锁定；字典 sys_common_status）
 *
 * 注意：角色/岗位为相反的 1=启用/0=停用 语义，本文件不服务角色/岗位/字典页。
 */

/** 用户状态（sys_user_status 字典） */
export const SYS_USER_STATUS = {
  /** 正常（可登录） */
  NORMAL: 0,
  /** 停用 */
  DISABLED: 1,
  /** 锁定 */
  LOCKED: 2,
} as const

/** 部门状态（sys_common_status 字典） */
export const SYS_DEPT_STATUS = {
  /** 正常 */
  NORMAL: 0,
  /** 停用 */
  DISABLED: 1,
} as const

/** 用户状态下拉选项（表单 + 筛选共用） */
export const userStatusOptions = [
  { label: '正常', value: SYS_USER_STATUS.NORMAL },
  { label: '停用', value: SYS_USER_STATUS.DISABLED },
  { label: '锁定', value: SYS_USER_STATUS.LOCKED },
] as const

/** 部门状态下拉选项（表单共用） */
export const deptStatusOptions = [
  { label: '正常', value: SYS_DEPT_STATUS.NORMAL },
  { label: '停用', value: SYS_DEPT_STATUS.DISABLED },
] as const

/** 用户状态列表 tag 类型映射（三态全写，避免二元式把 2 误显示为停用） */
export function userStatusTagType(status?: number): 'success' | 'info' | 'warning' {
  switch (status) {
    case SYS_USER_STATUS.NORMAL:
      return 'success'
    case SYS_USER_STATUS.DISABLED:
      return 'info'
    case SYS_USER_STATUS.LOCKED:
      return 'warning'
    default:
      return 'info'
  }
}

/** 用户状态列表 tag 文案映射（未知值按停用展示，与后端"非 0 即不可登录"口径一致） */
export function userStatusLabel(status?: number): string {
  switch (status) {
    case SYS_USER_STATUS.NORMAL:
      return '正常'
    case SYS_USER_STATUS.DISABLED:
      return '停用'
    case SYS_USER_STATUS.LOCKED:
      return '锁定'
    default:
      return '停用'
  }
}

/** 部门状态列表 tag 类型映射（仅 0/1） */
export function deptStatusTagType(status?: number): 'success' | 'info' {
  return status === SYS_DEPT_STATUS.NORMAL ? 'success' : 'info'
}

/** 部门状态列表 tag 文案映射 */
export function deptStatusLabel(status?: number): string {
  return status === SYS_DEPT_STATUS.NORMAL ? '正常' : '停用'
}
