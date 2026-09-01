import type { Router, RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { getAccessToken, clearToken } from '@/foundation/auth/token'
import { refresh, logout } from '@/foundation/auth'
import { loadSession } from '@/foundation/session'
import { loadMenu, buildRoutesFromMenu, findFirstLeafPath } from '@/foundation/menu'
import type { MenuNode } from '@/contracts/menu'
import { useUserStore } from '@/stores/user'
import { useMenuStore } from '@/stores/menu'

export const ROOT_LAYOUT_NAME = 'app-root'
const NOT_FOUND_ROUTE_NAME = 'not-found-catchall'
/** 无权限直达的落地页（公开路由，避免重定向循环）。 */
const FORBIDDEN_PATH = '/403'

let dynamicRoutesBuilt = false
let buildingPromise: Promise<void> | null = null
let addedRouteNames: string[] = []

function isSafeRedirectPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}

/**
 * 路径是否在菜单树中可达（DFS 同时匹配两种 path 形态）：
 * - 原始全路径（mock seeds 形态：子节点直接存 "notify/template"）；
 * - 祖先组合路径（真实后端形态：目录存 "notify"、叶子存 "template"，嵌套注册后组合成
 *   "/notify/template"）。
 * 非超管的后端会话 permissions 只装配按钮行（menu_type=2），页面行权限串
 * （如 notify:template:view）不进会话——「该路径在服务端过滤后的授权菜单树中」
 * 才是与真实授权模型一致的可达性判据。
 */
function menuContainsPath(nodes: MenuNode[], targetPath: string, prefix?: string): boolean {
  for (const node of nodes) {
    const composed = prefix ? `${prefix}/${node.path}` : node.path
    if (node.path === targetPath || composed === targetPath) {
      return true
    }
    if (node.children?.length && menuContainsPath(node.children, targetPath, composed)) {
      return true
    }
  }
  return false
}

/**
 * 路由权限校验（P36 R1：静态路由直达的守卫级拒绝）。
 *
 * - meta.authority（string[]，静态路由声明）：非超管须持有其中任一权限；
 *   但若目标 path 在用户菜单树中可达，视为服务端已授权（覆盖页面行权限不进
 *   会话 permissions 的后端装配口径），放行。
 * - meta.permission（string，动态菜单路由）：菜单树本身即服务端过滤后的授权
 *   结果，不再重复强制（强制会误伤仅绑定页面行的真实授权用户）。
 * - superAdmin 短路放行；无 authority 声明的路由不受影响。
 */
function hasRouteAccess(to: RouteLocationNormalized): boolean {
  const user = useUserStore()
  if (user.superAdmin) {
    return true
  }
  const required = to.meta.authority
  if (!required || required.length === 0) {
    return true
  }
  if (required.some((code) => user.permissions.has(code))) {
    return true
  }
  // 会话 permissions 无命中时回退菜单可达性（服务端授权决定）。
  // 菜单路径是不含前导 / 的相对 path（如 notify/template），
  // 与 Vue Router to.path（含 /）对比时统一去掉前导斜杠。
  const targetPath = to.path.startsWith('/') ? to.path.slice(1) : to.path
  return menuContainsPath(useMenuStore().menu, targetPath)
}

function loginRedirectTarget(to: RouteLocationNormalized) {
  const redirect = to.fullPath
  return {
    path: '/login',
    query: isSafeRedirectPath(redirect) && redirect !== '/login' ? { redirect } : undefined,
  }
}

async function buildDynamicRoutes(router: Router): Promise<void> {
  const [session, menu] = await Promise.all([loadSession(), loadMenu()])
  useUserStore().setSession(session)
  // 同一份菜单载荷既建路由、又存入 menu store 供侧边栏渲染（单一数据源，决策文档 · 外壳刀 §4）。
  useMenuStore().setMenu(menu)

  const routes = buildRoutesFromMenu(menu)
  for (const route of routes) {
    router.addRoute(ROOT_LAYOUT_NAME, route)
    if (route.name) {
      addedRouteNames.push(String(route.name))
    }
  }

  // 404 必须在动态路由之后注册，否则会先于业务路由匹配，把所有业务页面吞成 404。
  router.addRoute({
    path: '/:pathMatch(.*)*',
    name: NOT_FOUND_ROUTE_NAME,
    redirect: '/404',
  })

  dynamicRoutesBuilt = true
}

/** 登出/401 时撤销已注册的动态路由 + 清会话，保证重新登录后用新会话/菜单数据重建。 */
export function clearDynamicRoutes(router: Router): void {
  for (const name of addedRouteNames) {
    if (router.hasRoute(name)) {
      router.removeRoute(name)
    }
  }
  if (router.hasRoute(NOT_FOUND_ROUTE_NAME)) {
    router.removeRoute(NOT_FOUND_ROUTE_NAME)
  }
  addedRouteNames = []
  dynamicRoutesBuilt = false
  buildingPromise = null
  useUserStore().clearSession()
  useMenuStore().clearMenu()
}

export async function authGuard(
  router: Router,
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext,
): Promise<void> {
  if (to.meta.public) {
    next()
    return
  }

  if (!getAccessToken()) {
    try {
      // 冷启动静默续登：浏览器自动携带 rt cookie 调 /auth/refresh，
      // 成功后 access 回到内存，继续加载 session + menu 构建动态路由。
      await refresh()
    } catch {
      // refresh 失败（无 cookie / 无效 / 过期 / 撤销 / 重放）→ 清理全部认证残留
      // （access 内存态、用户会话、权限菜单、动态路由）再回登录页，不留半登录态。
      clearDynamicRoutes(router)
      clearToken()
      next(loginRedirectTarget(to))
      return
    }
  }

  if (!dynamicRoutesBuilt) {
    if (!buildingPromise) {
      buildingPromise = buildDynamicRoutes(router).catch(async (error: unknown) => {
        // 会话装配失败 = 登出 + 跳登录（决策文档 v2 §5）。
        console.error('[guard] failed to assemble session/menu', error)
        await logout()
        clearDynamicRoutes(router)
        throw error
      })
    }
    try {
      await buildingPromise
    } catch {
      next(loginRedirectTarget(to))
      return
    }
    next({ ...to, replace: true })
    return
  }

  // 根路径默认落地：菜单已装载，DFS 取首个可访问叶子；取不到兜底 /404。
  // 不在路由定义层用 redirect 处理，因为 Vue Router 的 redirect 在 beforeEach 之前解析，
  // 冷启动时菜单 store 为空必然回退 /404，导致用户看不到登录页。
  if (to.path === '/') {
    const firstLeaf = findFirstLeafPath(useMenuStore().menu)
    next(firstLeaf ?? '/404')
    return
  }

  // 路由权限校验（P36 R1）：meta.authority 声明的静态路由，非授权用户直达 → /403。
  if (!hasRouteAccess(to)) {
    next(FORBIDDEN_PATH)
    return
  }

  next()
}
