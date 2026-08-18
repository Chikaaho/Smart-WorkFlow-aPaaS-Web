/**
 * 部门管理前端类型 —— 镜像后端实体 SysDept 字段。
 *
 * children 字段为前端树形渲染用，后端 tree 端点不返回嵌套结构，
 * 前端需自行 flat→tree 转换注入 children。
 */

/** 部门实体（镜像 SysDept） */
export interface SysDept {
  id?: string
  parentId?: string
  name: string
  code: string
  sort?: number
  status?: number
  /** 审计字段 */
  createTime?: string
  updateTime?: string
  /** 前端树形渲染用，后端不返回 */
  children?: SysDept[]
}

/**
 * 部门树查询条件（GET /system/dept/tree 查询参数）。
 *
 * 与后端契约对齐（I31）：
 * - name：部门名称包含匹配（LIKE %name%）；trim 后空白等价未填写，不传或空白 = 不筛选。
 * - status：0=正常、1=停用（SYS_DEPT_STATUS）；不传 = 全部；非法值后端显式 400，前端不产生。
 */
export interface DeptQuery {
  name?: string
  status?: number
}
