/**
 * 菜单树规范态，对齐决策文档 v2 §6 描述的后端菜单树端点形状。
 * component 为文件路径风格字符串（如 "system/views/index"），由 foundation/menu 经白名单解析为实际组件。
 */

export const MenuType = {
  DIRECTORY: 0,
  MENU: 1,
  BUTTON: 2,
} as const

export type MenuType = (typeof MenuType)[keyof typeof MenuType]

export interface MenuNode {
  id: string
  parentId: string | null
  name: string
  title: string
  path: string
  component: string | null
  icon?: string
  sort: number
  menuType: MenuType
  permission?: string
  /** 仅用于侧边栏渲染：隐藏项不出现在导航树（仍可被路由命中）。 */
  hidden?: boolean
  children?: MenuNode[]
}
