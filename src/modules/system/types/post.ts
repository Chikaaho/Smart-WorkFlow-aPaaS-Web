/**
 * 岗位管理前端类型 —— 镜像后端实体 SysPost 字段。
 */

/** 岗位实体（镜像 SysPost） */
export interface SysPost {
  id?: string
  code: string
  name: string
  sort?: number
  status?: number
  description?: string
  /** 审计字段 */
  createTime?: string
  updateTime?: string
}

/** 岗位分页筛选 */
export interface PostFilter {
  code?: string
  name?: string
  status?: number
}
