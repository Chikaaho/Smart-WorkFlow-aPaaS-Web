/**
 * 字典管理前端类型 —— 镜像后端实体 SysDictType / SysDictData 字段。
 *
 * 【不复用下拉的 DictItem 契约】DictItem 是只读视图,字段名经映射会错位（决策 A2）。
 * 管理页使用本文件定义的类型,dictValue 保持实体名,不混用 code。
 */

/** 字典类型实体（镜像 SysDictType） */
export interface SysDictType {
  id?: string
  name: string
  code: string
  status: number
  description?: string
  /** 审计字段 */
  createTime?: string
  updateTime?: string
  createBy?: string
  updateBy?: string
  version?: number
}

/** 字典项实体（镜像 SysDictData） */
export interface SysDictData {
  id?: string
  dictCode: string
  label: string
  dictValue: string
  sort: number
  status: number
  isDefault: number
  cssClass?: string
  listClass?: string
  description?: string
  /** 审计字段 */
  createTime?: string
  updateTime?: string
  createBy?: string
  updateBy?: string
  version?: number
}

/** 字典类型分页筛选 */
export interface DictTypeFilter {
  name?: string
  code?: string
  status?: number
}

/** 字典项分页筛选 */
export interface DictDataFilter {
  /** 所属字典编码（EQ 固定,从路由参数注入） */
  dictCode: string
  label?: string
  dictValue?: string
  status?: number
}
