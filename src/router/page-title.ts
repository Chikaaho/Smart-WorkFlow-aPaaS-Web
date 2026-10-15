import { i18n } from '@/locales'
import { resolveArea } from '@/foundation/area'

/**
 * BF20261013-047 页签标题：浏览器页签只展示**当前页面所属的一级页签功能**
 * （管理端 = 顶栏一级入口：系统管理/表单管理/流程管理/通知/智能体/物联网/定时任务；
 *  工作台（前台）= 该外壳的一级入口本身，取路由 meta.title，如 工作台/我的门户/流程中心/待办任务）。
 *
 * 口径（Owner）：不再所有页面都显示项目名「CH-aPaaS」；未被规则命中的深链兜底回项目名。
 * 本模块只做纯函数（路径 + 翻译函数 → 标题），由 main.ts 在路由切换与语言切换时应用。
 */

/** 未被一级功能命中时的兜底标题（项目名）。 */
export const APP_TITLE = 'CH-aPaaS'

/** 路径前缀 → 一级功能文案键（顺序敏感：更具体的前缀在前）。 */
const SECTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // 工作台（前台）一级入口
  [/^\/workspace(\/|$)/, 'common.workspace'],
  [/^\/portal(\/|$)/, 'portal.navLabel'],
  [/^\/workflow\/catalog(\/|$)/, 'workflow.processCenter'],
  [/^\/notify\/inbox(\/|$)/, 'menu.notifyInbox'],
  // 管理端顶栏一级功能
  [/^\/system(\/|$)/, 'menu.system'],
  [/^\/form(\/|$)/, 'menu.lowcode'],
  [/^\/workflow(\/|$)/, 'menu.workflow'],
  [/^\/notify(\/|$)/, 'menu.notify'],
  [/^\/agent(\/|$)/, 'menu.agent'],
  [/^\/iot(\/|$)/, 'menu.iot'],
  [/^\/job(\/|$)/, 'job.scheduledJobs'],
  // 移动端（/m/**）与账户页各自只有一个一级功能
  [/^\/m\/form(\/|$)/, 'router.mobileFormEntry'],
  [/^\/m\/workflow(\/|$)/, 'router.mobileWorkspace'],
  [/^\/m\/notify(\/|$)/, 'router.mobileInbox'],
  [/^\/account\/bindings(\/|$)/, 'auth.accountBindings'],
  [/^\/login(\/|$)/, 'auth.signIn'],
  [/^\/sso\/return(\/|$)/, 'auth.signIn'],
  [/^\/403(\/|$)/, 'router.forbidden'],
  [/^\/404(\/|$)/, 'router.pageNotFound'],
  [/^\/500(\/|$)/, 'router.serverError'],
]

/** 路径 → 一级功能文案键；无匹配返回 null（澄清见模块头）。 */
export function sectionTitleKey(path: string): string | null {
  const matched = SECTION_RULES.find(([pattern]) => pattern.test(path))
  return matched ? matched[1] : null
}

/** 路由最小形状（便于纯函数测试）。 */
export interface TitleRoute {
  path: string
  meta?: { title?: unknown }
}

/**
 * 路由 → 页签标题。
 * - 前台（工作台外壳）：一级入口即页面本身，优先用路由 meta.title（已按当前语言生成）；
 * - 其余（管理端/移动端/账户/错误页）：按路径前缀取一级功能文案；
 * - 都取不到时回退项目名。
 */
export function documentTitleFor(route: TitleRoute, translate: (key: string) => string): string {
  if (resolveArea(route.path) === 'portal') {
    const metaTitle = typeof route.meta?.title === 'string' ? route.meta.title.trim() : ''
    if (metaTitle) return metaTitle
  }
  const key = sectionTitleKey(route.path)
  return key ? translate(key) : APP_TITLE
}

/** 应用页签标题（路由切换与语言切换时调用；非浏览器环境跳过）。 */
export function applyDocumentTitle(route: TitleRoute): void {
  if (typeof document === 'undefined') return
  document.title = documentTitleFor(route, (key) => i18n.global.t(key))
}
