/**
 * v0.0.2 OA：流程中心目录 / 分类 / 工作台布局契约。
 * 稳定标识 itemKey = processKey；展示名称为流程定义名称；
 * 关联表单由服务端解析唯一合法绑定，前端不靠名称或路由解析绑定。
 */

/** 流程中心可发起事项（普通视角仅含可见+已发布+active 绑定项）。 */
export interface CatalogItem {
  itemKey: string
  name: string
  formKey: string
  categoryId: number | null
  status: 'PUBLISHED' | 'DRAFT'
  formPublished: boolean
  bindingActive: boolean
}

/** 流程分类（单层）。 */
export interface CatalogCategory {
  id: number
  name: string
  sortNo: number
  itemCount?: number
}

/** 分类保存请求。 */
export interface CategorySaveReq {
  name: string
  sortNo?: number
}

/** 分类聚合数量：categoryId → 可见事项数（未分类归入 key "0"）。 */
export type CategoryCounts = Record<string, number>

/** 工作台组件键（I4 §3.7：统一工作台七入口，含我的已办）。 */
export type WorkspaceComponentKey =
  | 'todo'
  | 'myProcessed'
  | 'myInitiated'
  | 'cc'
  | 'favoriteItems'
  | 'drafts'
  | 'messages'

/** 工作台组件配置项。span 为布局宽度：1=半宽（默认），2=整行。 */
export interface WorkspaceComponent {
  key: WorkspaceComponentKey
  visible: boolean
  order: number
  span?: number
}

/** 工作台布局。 */
export interface WorkspaceLayout {
  components: WorkspaceComponent[]
  favoriteItemKeys: string[]
}

/** 工作台布局读取响应。 */
export interface WorkspaceLayoutResp {
  custom: boolean
  layout: WorkspaceLayout
}
