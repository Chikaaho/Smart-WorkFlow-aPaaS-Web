/**
 * 业务层共享类型契约：分页、统一响应包、租户上下文、数据权限范围。
 * 与后端保持枚举值对齐，详见后端 sw-biz-system 模块的数据权限定义。
 */

export interface PageQuery {
  pageNum: number
  pageSize: number
}

export interface PageResult<T> {
  list: T[]
  total: number
  pageNum: number
  pageSize: number
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/** 数据权限范围，需与后端枚举值一一对应。 */
export const DataScope = {
  SELF: 'SELF',
  DEPT: 'DEPT',
  DEPT_AND_CHILD: 'DEPT_AND_CHILD',
  CUSTOM: 'CUSTOM',
  ALL: 'ALL',
} as const

export type DataScope = (typeof DataScope)[keyof typeof DataScope]
