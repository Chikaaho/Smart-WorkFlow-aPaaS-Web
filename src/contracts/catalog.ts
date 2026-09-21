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
  /** 展示补充字段（P53）：服务端未下发时为 undefined，页面按缺失省略对应片段。 */
  description?: string
  version?: string
  lastUsedAt?: string
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

/** 工作台内置渲染器键；后端只能配置这些安全注册器，不能下发组件路径。 */
export type WorkspaceRendererKey =
  | 'stats'
  | 'todo'
  | 'favorites'
  | 'activity'
  | 'efficiency'
  | 'drafts'
  | 'messages'

/** 工作台卡片类型（租户级后台配置）。 */
export interface WorkspaceCardType {
  id: number
  typeCode: string
  displayName: string
  rendererKey: WorkspaceRendererKey
  metadataJson: string
  defaultSpan: 1 | 2
  defaultOrder: number
  status: 0 | 1
}

/** 工作台卡片实例（用户级 JSON 元数据）。 */
export interface WorkspaceCard {
  typeCode: string
  visible: boolean
  order: number
  span?: 1 | 2
  metadata?: Record<string, unknown>
}

/** 旧版组件配置兼容形状；读取时由后端归一为 cards。 */
export interface WorkspaceComponent {
  key: string
  visible: boolean
  order: number
  span?: 1 | 2
  metadata?: Record<string, unknown>
}

/** 工作台布局。 */
export interface WorkspaceLayout {
  cards: WorkspaceCard[]
  favoriteItemKeys: string[]
  components?: WorkspaceComponent[]
}

/** 工作台布局读取响应。 */
export interface WorkspaceLayoutResp {
  custom: boolean
  cardTypes: WorkspaceCardType[]
  layout: WorkspaceLayout
}
