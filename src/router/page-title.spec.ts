import { describe, it, expect } from 'vitest'
import { APP_TITLE, applyDocumentTitle, documentTitleFor, sectionTitleKey } from './page-title'

/**
 * BF20261013-047 页签标题单测。
 * Owner 口径：页签只展示当前页面所属的**一级页签功能**（不再所有页面都显示项目名）。
 */
const translate = (key: string) => `T:${key}`

describe('page-title', () => {
  it('管理端路径 → 顶栏一级功能', () => {
    expect(sectionTitleKey('/system/user')).toBe('menu.system')
    expect(sectionTitleKey('/system/dict-manage')).toBe('menu.system')
    expect(sectionTitleKey('/form/form-def-list')).toBe('menu.lowcode')
    expect(sectionTitleKey('/form/designer/abc')).toBe('menu.lowcode')
    expect(sectionTitleKey('/workflow/defs')).toBe('menu.workflow')
    expect(sectionTitleKey('/workflow/defs/1/design')).toBe('menu.workflow')
    expect(sectionTitleKey('/notify/template')).toBe('menu.notify')
    expect(sectionTitleKey('/agent/tool')).toBe('menu.agent')
    expect(sectionTitleKey('/iot/connections')).toBe('menu.iot')
    expect(sectionTitleKey('/job/list')).toBe('job.scheduledJobs')
  })

  it('移动端 / 账户 / 错误页 / 登录各自的一级功能', () => {
    expect(sectionTitleKey('/m/form/form_x')).toBe('router.mobileFormEntry')
    expect(sectionTitleKey('/m/workflow')).toBe('router.mobileWorkspace')
    expect(sectionTitleKey('/m/notify')).toBe('router.mobileInbox')
    expect(sectionTitleKey('/account/bindings')).toBe('auth.accountBindings')
    expect(sectionTitleKey('/login')).toBe('auth.signIn')
    expect(sectionTitleKey('/sso/return')).toBe('auth.signIn')
    expect(sectionTitleKey('/403')).toBe('router.forbidden')
    expect(sectionTitleKey('/404')).toBe('router.pageNotFound')
    expect(sectionTitleKey('/500')).toBe('router.serverError')
  })

  it('未命中规则的深链 → 兜底项目名', () => {
    expect(sectionTitleKey('/unknown/path')).toBeNull()
    expect(documentTitleFor({ path: '/unknown/path' }, translate)).toBe(APP_TITLE)
  })

  it('工作台（前台）页面：一级入口即页面本身 → 用路由 meta.title', () => {
    expect(
      documentTitleFor({ path: '/workspace/todo', meta: { title: '待办任务' } }, translate),
    ).toBe('待办任务')
    expect(
      documentTitleFor({ path: '/workflow/catalog', meta: { title: '流程中心' } }, translate),
    ).toBe('流程中心')
    expect(documentTitleFor({ path: '/portal', meta: { title: '我的门户' } }, translate)).toBe(
      '我的门户',
    )
  })

  it('前台页面缺 meta.title 时回落到一级功能规则', () => {
    expect(documentTitleFor({ path: '/workspace/todo' }, translate)).toBe('T:common.workspace')
  })

  it('管理端页面忽略子页名（meta.title 不再进页签）', () => {
    expect(
      documentTitleFor({ path: '/workflow/defs', meta: { title: '流程定义' } }, translate),
    ).toBe('T:menu.workflow')
    expect(
      documentTitleFor({ path: '/form/designer/abc', meta: { title: '表单设计器' } }, translate),
    ).toBe('T:menu.lowcode')
  })

  it('applyDocumentTitle 落到 document.title（中文本地化）', () => {
    applyDocumentTitle({ path: '/system/user' })
    expect(document.title).toBe('系统管理')
    applyDocumentTitle({ path: '/workflow/defs' })
    expect(document.title).toBe('流程管理')
    applyDocumentTitle({ path: '/unknown/path' })
    expect(document.title).toBe(APP_TITLE)
  })
})
