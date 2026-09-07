import { MenuType, type MenuNode } from '@/contracts/menu'
import { useMenuStore } from '@/stores/menu'
import { useUserStore } from '@/stores/user'

/**
 * 前后台分层（v0.0.2 P55）——页面归属清单的单一常量源。
 *
 * 前台（portal）：工作台、流程中心、个人办理（四入口 + 抄送）、收件箱、
 * 任务详情与表单填报深链。后台（admin）：系统/表单/流程/通知管理、Agent 等。
 * 后台准入判定复用服务端授权语义：superAdmin 短路；否则「服务端过滤后的
 * 授权菜单树中存在后台页面」，不按用户 ID 或前端角色名硬编码。
 */

export type Area = 'portal' | 'admin'

/** 前台菜单 path（相对布局根，无前导 /）。菜单树里的其余可见页面归后台。 */
export const PORTAL_MENU_PATHS: ReadonlySet<string> = new Set([
  'workspace',
  'workflow/catalog',
  'workflow/my-cc',
  'workflow/todo',
  'workflow/my-instances',
  'workflow/my-drafts',
  'workflow/my-processed',
  'workflow/processed',
  'notify/inbox',
])

/** 前台静态深链路由（非菜单下发）的段前缀。 */
const PORTAL_STATIC_PREFIXES = ['/workflow/task/', '/form/form-render/']

/** 判定路由全路径（含前导 /）归属前台还是后台。 */
export function resolveArea(path: string): Area {
  if (PORTAL_STATIC_PREFIXES.some((p) => path.startsWith(p))) {
    return 'portal'
  }
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return PORTAL_MENU_PATHS.has(normalized) ? 'portal' : 'admin'
}

/**
 * 节点归属判定：叶子 path 存在两种历史形态（已是全路径 / 相对段），
 * 对齐守卫 menuContainsPath 的双形态语义——raw 与 composed 任一命中即认定。
 */
function nodeArea(node: { path: string; menuType: MenuType }, prefix: string): Area {
  const composed = prefix ? `${prefix}/${node.path}` : node.path
  if (resolveArea(`/${node.path}`) === 'portal' || resolveArea(`/${composed}`) === 'portal') {
    return 'portal'
  }
  return 'admin'
}

/**
 * 当前会话是否可进入后台（服务端认可的管理语义）：
 * superAdmin 短路；否则授权菜单树中存在后台页面行。
 * 撤权后菜单树收敛，本判定同步收敛（守卫与侧边栏切换按钮共用）。
 * 仅以页面行（MENU）判定：目录节点本身不构成后台准入依据。
 */
export function canEnterAdminArea(): boolean {
  const user = useUserStore()
  if (user.superAdmin) {
    return true
  }
  const menu = useMenuStore().menu
  return walkForAdmin(menu, '')
}

function walkForAdmin(nodes: MenuNode[], prefix: string): boolean {
  for (const node of nodes) {
    if (node.menuType === MenuType.MENU && nodeArea(node, prefix) === 'admin') {
      return true
    }
    if (node.children?.length) {
      const composed = prefix ? `${prefix}/${node.path}` : node.path
      if (walkForAdmin(node.children, composed)) {
        return true
      }
    }
  }
  return false
}

/**
 * 菜单树按区域过滤：保留当前区域的页面与其祖先目录。
 * 只读菜单单一数据源，不在 store 之外二次拉取。
 */
export function filterMenuByArea(nodes: MenuNode[], area: Area, prefix = ''): MenuNode[] {
  const result: MenuNode[] = []
  for (const node of nodes) {
    if (node.menuType === MenuType.BUTTON) {
      continue
    }
    const composed = prefix ? `${prefix}/${node.path}` : node.path
    if (node.children?.length) {
      const children = filterMenuByArea(node.children, area, composed)
      if (children.length) {
        result.push({ ...node, children })
      }
      continue
    }
    const nodeAreaValue = nodeArea(node, prefix)
    if (nodeAreaValue === area) {
      result.push(node)
    }
  }
  return result
}

/** 后台首叶（进入后台按钮的落点）；无后台页面授权时返回 null。 */
export function firstAdminLeafPath(): string | null {
  const found = firstAdminLeaf(useMenuStore().menu)
  return found ? `/${found}` : null
}

/**
 * 返回叶子节点的原始 path（与路由注册的相对路径一致，如 'dict'、'workflow/catalog'）。
 * 不按目录前缀组合：动态路由按菜单原始 path 扁平注册，组合路径（如 '/system/dict'）
 * 没有对应路由，会造成「进入后台」落地 404。
 */
function firstAdminLeaf(nodes: MenuNode[]): string | null {
  for (const node of nodes) {
    if (node.menuType === MenuType.MENU && nodeArea(node, '') === 'admin') {
      return node.path
    }
    if (node.children?.length) {
      const found = firstAdminLeaf(node.children)
      if (found) return found
    }
  }
  return null
}
