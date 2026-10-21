/**
 * 角色管理前端类型 —— 镜像后端实体 SysRole 字段。
 */

/** 角色实体（镜像 SysRole） */
export interface SysRole {
  id?: string
  name: string
  code: string
  /** 角色所属租户；用户管理的角色配置按目标用户租户过滤 */
  tenantId?: string
  sort?: number
  status?: number
  /**
   * 数据权限范围，与后端 DataScope 枚举 ordinal 对齐，当前按 0-4 顺序
   * （ALL=0 / DEPT=1 / DEPT_AND_CHILD=2 / SELF=3 / CUSTOM=4），数值映射待联调确认。
   */
  dataScope?: number
  /** 自定义数据权限部门 ID 清单（dataScope=CUSTOM 时生效） */
  deptIds?: string[]
  builtIn?: boolean
  description?: string
  /** 审计字段 */
  createTime?: string
  updateTime?: string
}

/** 角色分页筛选 */
export interface RoleFilter {
  name?: string
  code?: string
  status?: number
  /** 指定租户；超管按目标用户所属租户取角色时使用 */
  tenantId?: string
}
