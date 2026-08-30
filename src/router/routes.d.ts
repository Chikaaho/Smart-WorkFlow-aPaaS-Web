import 'vue-router'

/**
 * vue-router RouteMeta 类型扩展：本工作区路由元数据契约。
 *
 * - authority：静态路由（router/index.ts）声明的访问权限串数组，守卫按
 *   「非超管持有任一权限或菜单树可达」判定（guard.ts hasRouteAccess）。
 * - permission：动态菜单路由（buildRoutesFromMenu）携带的页面权限串，
 *   仅作元数据；服务端已按授权过滤菜单，守卫不重复强制。
 * - public / errorCode / title / icon 为既有字段，一并声明以获得完整类型提示。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 静态路由访问权限串（任一命中即可），未声明 = 不做权限校验。 */
    authority?: string[]
    /** 动态菜单路由的页面权限串（仅元数据）。 */
    permission?: string
    /** 公开路由（登录/错误页），跳过认证与权限校验。 */
    public?: boolean
    /** 错误页状态码。 */
    errorCode?: number
    /** 页面标题。 */
    title?: string
    /** 菜单图标名。 */
    icon?: string
  }
}

export {}
