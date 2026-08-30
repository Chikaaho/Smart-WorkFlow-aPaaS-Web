import { MenuType, type MenuNode } from '@/contracts/menu'

/**
 * 侧边栏 / 面包屑的纯派生工具——只读菜单单一数据源（决策文档 · 外壳刀 §4/§5），不持有状态。
 * 菜单节点 path 为相对布局根的路径（如 'system'、'form/form'），统一映射为绝对路径供 el-menu 使用。
 */

export function toFullPath(node: MenuNode): string {
  return node.path.startsWith('/') ? node.path : `/${node.path}`
}

/** 从根到「全路径等于 fullPath 的叶子」的节点链；用于面包屑与选中父级展开。匹配不到返回 []。 */
export function buildMenuTrail(nodes: MenuNode[], fullPath: string): MenuNode[] {
  for (const node of nodes) {
    if (toFullPath(node) === fullPath) {
      return [node]
    }
    if (node.children?.length) {
      const childTrail = buildMenuTrail(node.children, fullPath)
      if (childTrail.length) {
        return [node, ...childTrail]
      }
    }
  }
  return []
}

/** 当前路径所在分支上所有目录节点的全路径，作为 el-menu 默认展开项（选中态联动父级展开）。 */
export function openedMenuKeys(nodes: MenuNode[], fullPath: string): string[] {
  return buildMenuTrail(nodes, fullPath)
    .filter((node) => node.menuType === MenuType.DIRECTORY)
    .map(toFullPath)
}

/** 侧边栏可见节点：剔除按钮型 / 隐藏项，按 sort 升序，递归处理子节点。 */
export function visibleMenu(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .filter((node) => node.menuType !== MenuType.BUTTON && !node.hidden)
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((node) =>
      node.children?.length ? { ...node, children: visibleMenu(node.children) } : node,
    )
}
