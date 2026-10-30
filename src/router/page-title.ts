import { i18n } from '@/locales'
import { resolveArea } from '@/foundation/area'

/**
 * BF20261013-047 页签标题：浏览器页签展示**当前页面所属的一级页签功能**
 * （管理端 = 顶栏一级入口：系统管理/表单管理/流程管理/通知/智能体/物联网/定时任务；
 *  工作台（前台）= 该外壳的一级入口本身，取路由 meta.title，如 工作台/我的门户/流程中心/待办任务）。
 *
 * 双入口页（BF20261013-047 追加口径，Owner）：「流程管理」分组里的页面同时在前台可达
 * （流程中心/待办任务/我发起的/抄送我的/任务详情/表单填报…），命名随**进入控制台**——
 * 从后台进入显示「管理」（流程管理），从前台进入或**直接链入**（收藏/粘贴链接）默认显示
 * **用户视角**（流程中心/待办任务…）。
 *
 * 本模块只做纯函数 + 极薄的进入控制台状态（由 main.ts 在路由切换与语言切换时驱动）。
 */

/** 未被一级功能命中时的兜底标题（项目名）。 */
export const APP_TITLE = 'CH-aPaaS'

/** 进入控制台：前台（工作台外壳）/ 后台（管理端）。 */
export type Console = 'portal' | 'admin'

/** 双入口深链（前台可达且在后台「流程管理」分组里也在）——命名随进入控制台。 */
const DUAL_CONSOLE_PREFIXES = [
  '/workflow/catalog',
  '/workflow/todo',
  '/workflow/processed',
  '/workflow/my-instances',
  '/workflow/my-drafts',
  '/workflow/my-processed',
  '/workflow/my-cc',
  '/workflow/task/',
  '/form/form-render/',
]

/** 路径前缀 → 一级功能文案键（顺序敏感：更具体的前缀在前）。 */
const SECTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // 工作台（前台）一级入口
  [/^\/workspace(\/|$)/, 'common.workspace'],
  [/^\/portal(\/|$)/, 'portal.navLabel'],
  [/^\/workflow\/catalog(\/|$)/, 'workflow.processCenter'],
  [/^\/notify\/inbox(\/|$)/, 'menu.notifyInbox'],
  // 管理端顶栏一级功能
  [/^\/system(\/|$)/, 'menu.system'],
  [/^\/form\/app-manage(\/|$)/, 'form.appCenter.manageTitle'],
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

/** 双入口页判定（命名随进入控制台）。 */
export function isDualConsolePath(path: string): boolean {
  return DUAL_CONSOLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

/** 路由最小形状（便于纯函数测试）。 */
export interface TitleRoute {
  path: string
  meta?: { title?: unknown }
}

/**
 * 进入控制台的推进规则（每次导航调用一次）：
 * - 落在管理端页面 → 后台；
 * - 双入口页 → **保持**当前控制台（后台进入的一串页面继续按后台命名）；
 * - 纯前台页（工作台/我的门户）→ 回到前台。
 * 初始值为前台 = 直接链入的默认用户视角。
 */
export function nextConsole(route: TitleRoute, current: Console): Console {
  if (resolveArea(route.path) === 'admin') return 'admin'
  if (isDualConsolePath(route.path)) return current
  return 'portal'
}

/**
 * 路由 → 页签标题。
 * - 管理端/移动端/账户/错误页：按路径前缀取一级功能文案；
 * - 前台页面：双入口页在**后台进入**时显示「流程管理」，否则优先用路由 meta.title（用户视角，已按当前语言生成）；
 * - 都取不到时回退项目名。
 */
export function documentTitleFor(
  route: TitleRoute,
  translate: (key: string) => string,
  console: Console = 'portal',
): string {
  if (resolveArea(route.path) === 'portal') {
    if (isDualConsolePath(route.path) && console === 'admin') {
      return translate('menu.workflow')
    }
    const metaTitle = typeof route.meta?.title === 'string' ? route.meta.title.trim() : ''
    if (metaTitle) return metaTitle
  }
  const key = sectionTitleKey(route.path)
  return key ? translate(key) : APP_TITLE
}

/** 当前进入控制台（路由切换推进；语言切换按同一口径重算标题）。 */
let currentConsole: Console = 'portal'

/** 路由切换：推进控制台并应用标题。 */
export function syncDocumentTitle(route: TitleRoute): void {
  currentConsole = nextConsole(route, currentConsole)
  renderTitle(route)
}

/** 语言切换：按当前页同一口径重算标题。 */
export function refreshDocumentTitle(route: TitleRoute): void {
  renderTitle(route)
}

/** 当前进入控制台（只读，供测试/调试）。 */
export function currentConsoleOf(): Console {
  return currentConsole
}

function renderTitle(route: TitleRoute): void {
  if (typeof document === 'undefined') return
  document.title = documentTitleFor(route, (key) => i18n.global.t(key), currentConsole)
}
