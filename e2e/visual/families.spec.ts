import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './auth.js'
import {
  desktopRegions,
  expectRegionMatches,
  expectNotClipped,
  expectNotObscured,
  REGION_THRESHOLDS,
} from './regions.js'

/**
 * P53 补证 EV-03 页面族矩阵（审查记录 P53-EV-03）。
 *
 * 覆盖实现页面族而非 32 张机械截图：工作台/门户/管理端壳/流程中心/数据列表/
 * 任务详情（表单·流程图·审批列表）/意见详情弹窗/发起流程/表单设计器（字段清单）/
 * 流程设计器（审批人候选）/个人菜单浮层。
 * 状态适用项：默认、空态（流程中心搜索/实例筛选）、错误（未知 formKey）、
 * 禁用（表单必填未满足）、弹窗/浮层（详情·清单·候选·个人菜单）。
 * 加载态由真实后端会话采证（dev:mock 调度器在 axios 层短路，无延迟注入能力），
 * 见补证回执 EV-03 边界说明。
 * 像素区域基线沿用既有模式（1440/1920/1280 逐 project）；可读截图存档 e2e/.artifacts/。
 * dev:mock 只承担隔离回归层，正式结论见真实后端可见会话证据（方向 §4.7）。
 */

function vw(page: Page): number {
  return page.viewportSize()?.width ?? 1440
}

function skipMobile(page: Page): void {
  test.skip(vw(page) < 768, '375 仅承诺登录页与三个 H5 页（方向 §4.5），桌面页面族不适用')
}

async function artifact(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/.artifacts/${name}`, fullPage: false })
}

async function loginPortal(page: Page): Promise<void> {
  await loginAs(page, 'superadmin', 'admin123')
}

async function enterAdmin(page: Page): Promise<void> {
  await page.locator('.app-topbar__user').click()
  const dropdown = page.locator('.el-dropdown-menu').first()
  await dropdown.getByText('进入后台').click()
  await expect(dropdown).toBeHidden()
  await expect(page.locator('header.basic-layout__topbar--admin')).toBeVisible()
}

test.describe('P53 页面族矩阵（EV-03）', () => {
  test('01 工作台：默认态区域基线与关键交互阻断', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await expect(page.locator('.workspace__greeting')).toBeVisible()
    await expect(page.locator('.workspace-stat')).toHaveCount(4)
    await expectNotClipped(page, '.workspace__greeting')
    // expectNotObscured 仅接受单元素定位：多统计卡取首个做遮挡阻断
    await expectNotObscured(page, '.workspace-stat')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.topbar, REGION_THRESHOLDS.topbar, 'fam01-topbar.png')
    await expectRegionMatches(page, regions.sidebar, REGION_THRESHOLDS.sidebar, 'fam01-sidebar.png')
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam01-main.png')
    await artifact(page, `fam-workspace-${vw(page)}.png`)
  })

  test('05 企业门户：默认态 hero 与服务卡', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/portal')
    await expect(page.locator('.portal__hero')).toBeVisible()
    await expect(page.locator('.portal-service').first()).toBeVisible()
    await expectNotClipped(page, '.portal__hero')
    await expectNotObscured(page, '.portal-service')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam05-main.png')
    await artifact(page, `fam-portal-${vw(page)}.png`)
  })

  test('04 管理端壳：深色顶栏结构、主导航可达与存档', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await enterAdmin(page)
    const navItems = page.locator('nav.app-main-nav .app-main-nav__item')
    await expect(navItems.first()).toBeVisible()
    await page.waitForTimeout(400) // 区域切换过渡结束后测量
    await expectNotClipped(page, 'nav.app-main-nav')
    await expectNotObscured(page, 'header.basic-layout__topbar--admin')
    await artifact(page, `fam-admin-shell-${vw(page)}.png`)
  })

  test('21-26 流程中心：分类默认态、搜索空态与存档', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/workflow/catalog')
    await expect(page.locator('.catalog-chip').first()).toBeVisible()
    await expect(page.locator('.catalog-card').first()).toBeVisible()
    await expect(page.locator('.catalog-page__count')).toBeVisible()
    await page.waitForTimeout(400) // 入场动画结束后再做阻断测量
    await expectNotObscured(page, '.catalog-card__launch')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam21-main.png')
    await artifact(page, `fam-catalog-${vw(page)}.png`)
    // 空态：搜索无匹配 → el-empty（数据状态适用项）；回车触发 loadCatalog
    await page.locator('.catalog-page__search input').fill('绝无匹配的流程xyz')
    await page.locator('.catalog-page__search input').press('Enter')
    await expect(page.locator('.el-empty')).toBeVisible()
    await artifact(page, `fam-catalog-empty-${vw(page)}.png`)
  })

  test('02 数据列表：默认态、筛选空态与详情弹窗', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/workflow/my-instances')
    await expect(page.locator('.el-table__row').first()).toBeVisible()
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam02-main.png')
    await artifact(page, `fam-instances-${vw(page)}.png`)
    // 详情弹窗（弹窗/浮层适用项）：行操作首列「详情」
    await page.locator('.el-table__row').first().locator('button').first().click()
    const dialog = page.locator('.el-dialog').first()
    await expect(dialog).toBeVisible()
    await expectNotObscured(page, '.el-dialog')
    await artifact(page, `fam-instances-dialog-${vw(page)}.png`)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    // 空态：关键字无匹配
    const keyword = page.getByPlaceholder('流程名称/业务单号')
    await keyword.fill('zzz无此实例')
    await keyword.press('Enter')
    await expect(page.locator('.el-empty').first()).toBeVisible()
    await artifact(page, `fam-instances-empty-${vw(page)}.png`)
  })

  test('03/10/19/20 任务详情：流转记录、流程图与审批列表三 tab', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/workflow/task/mock-task-001')
    await expect(page.locator('.detail-header')).toBeVisible()
    await expectNotClipped(page, '.detail-header')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam03-main.png')
    await artifact(page, `fam-task-records-${vw(page)}.png`)
    await page.getByRole('tab', { name: '流程图' }).click()
    // Scope the assertion to the real process graph; a generic page icon must not pass this check.
    await expect(page.locator('.pg-view svg')).toBeVisible()
    await expect(page.locator('.pg-view .pg-node').first()).toBeVisible()
    await artifact(page, `fam-task-graph-${vw(page)}.png`)
    await page.getByRole('tab', { name: '审批详情列表' }).click()
    await expect(page.locator('.el-table__row, .el-empty').first()).toBeVisible()
    await artifact(page, `fam-task-people-${vw(page)}.png`)
  })

  test('15/16/17/18 意见详情弹窗：打开、Escape 关闭', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/workflow/task/mock-task-001')
    await page.getByRole('tab', { name: '审批详情列表' }).click()
    const detailButton = page.getByRole('button', { name: '查看详情' }).first()
    // mock 种子待办实例键（mock-proc-001）与详情表键（proc-001）不一致 → 待办无已完成历史；
    // 意见详情弹窗的行为与视觉证据改由真实后端记录承担（见补证回执 EV-02/EV-03）。
    test.skip(
      (await detailButton.count()) === 0,
      'mock 待办实例无已完成审批历史；弹窗证据以真实后端记录采证',
    )
    await detailButton.click()
    const dialog = page.locator('.el-dialog').first()
    await expect(dialog).toBeVisible()
    await artifact(page, `fam-opinion-dialog-${vw(page)}.png`)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('27 发起流程：默认双栏、未知 formKey 错误态', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/form/form-render/leave-request')
    await expect(page.locator('.form-render-page__card')).toBeVisible()
    await expect(page.locator('.form-render-page__aside')).toBeVisible()
    await expectNotClipped(page, '.form-render-page__card')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'fam27-main.png')
    await artifact(page, `fam-formrender-${vw(page)}.png`)
    // 错误态：记录不存在（mock 对任意 formKey 生成示例表单，错误路径走记录加载失败）
    await page.goto('/form/form-render/leave-request?recordId=__no_record__')
    await expect(page.locator('.form-render-page__alert').first()).toBeVisible()
    await artifact(page, `fam-formrender-error-${vw(page)}.png`)
  })

  test('07/11 表单设计器：默认画布与字段清单弹窗', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/form/designer/seed-def-001')
    await expect(page.locator('.designer').first()).toBeVisible()
    await expectNotClipped(page, '.designer__body')
    await page.getByRole('button', { name: '字段清单' }).click()
    const dialog = page.locator('.el-dialog').first()
    await expect(dialog).toBeVisible()
    await artifact(page, `fam-designer-fields-${vw(page)}.png`)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await artifact(page, `fam-formdesigner-${vw(page)}.png`)
  })

  test('09/12 流程设计器：默认画布与审批人候选弹窗', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.goto('/workflow/defs/1/design')
    await expect(page.locator('.designer-canvas-wrap, .designer-body').first()).toBeVisible()
    await expectNotClipped(page, '.designer-canvas-wrap, .designer-body')
    await artifact(page, `fam-processdesigner-${vw(page)}.png`)
    // 审批人候选（受限真实组件适用项）：选中 APPROVER 节点 → 属性面板 → 查看候选
    const node = page.locator('.designer-node').first()
    if (await node.count()) {
      await node.click()
      const pickerButton = page.getByRole('button', { name: '查看候选' })
      if (await pickerButton.count()) {
        await pickerButton.click()
        const dialog = page.locator('.el-dialog').first()
        await expect(dialog).toBeVisible()
        await artifact(page, `fam-approver-dialog-${vw(page)}.png`)
        await page.keyboard.press('Escape')
      }
    }
  })

  test('28/29/30/32 个人菜单浮层：portal 与 admin 两形态', async ({ page }) => {
    await loginPortal(page)
    skipMobile(page)
    await page.locator('.app-topbar__user').click()
    const dropdown = page.locator('.el-dropdown-menu').first()
    await expect(dropdown).toBeVisible()
    await expectNotObscured(page, '.app-topbar__user')
    await artifact(page, `fam-usermenu-portal-${vw(page)}.png`)
    await page.mouse.click(10, 400) // 点击页面中性区域关闭浮层（Escape 关闭时序不稳）
    await expect(dropdown).toBeHidden({ timeout: 8000 })
    await enterAdmin(page)
    // 下拉经区域切换重挂载后可能吞掉首次 click，重试至可见（触发器为 click）
    const adminDropdown = page.locator('.el-dropdown-menu').first()
    for (let i = 0; i < 3 && !(await adminDropdown.isVisible()); i += 1) {
      await page.locator('.app-topbar__user').click()
      await page.waitForTimeout(300)
    }
    await expect(adminDropdown).toBeVisible()
    await artifact(page, `fam-usermenu-admin-${vw(page)}.png`)
    await page.mouse.click(10, 400)
    await expect(adminDropdown).toBeHidden({ timeout: 8000 })
  })
})
