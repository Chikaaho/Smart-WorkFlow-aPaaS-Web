import { test, expect } from '@playwright/test'
import { loginAs } from './auth.js'
import { desktopRegions, expectRegionMatches, REGION_THRESHOLDS } from './regions.js'

/**
 * P53 视觉基线（阶段 E 建立，方向 §4.7）。
 *
 * 基线覆盖：登录页整页 + 已登录壳三区（顶栏/侧栏/主区，区域阈值独立判定）。
 * 建立后只允许一次有说明的校准；日常运行 maxDiffPixels:0 + 区域阈值阻断。
 * 375 视口按方向 §4.5 只覆盖登录页（H5 专用页另建）。
 */

test.describe('P53 视觉基线', () => {
  test('节点 06 登录页整页基线', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sw.locale', 'zh-CN'))
    await page.goto('/login')
    await expect(page.locator('form.login-page__form button[type="submit"]')).toBeVisible()
    // 图形验证码内容为随机动态位图，基线中受控隐藏（布局由占位框承载，与实际渲染一致）
    await page.addStyleTag({
      content: 'img.login-page__captcha { visibility: hidden; }',
    })
    await expect(page).toHaveScreenshot('login-06-full.png', {
      fullPage: false,
      maxDiffPixelRatio: REGION_THRESHOLDS.main,
      animations: 'disabled',
    })
  })

  test('已登录壳三区基线（工作台）', async ({ page }) => {
    await loginAs(page, 'superadmin', 'admin123')
    const viewport = page.viewportSize()?.width ?? 1440
    test.skip(viewport < 768, '375 侧栏隐藏，区域分区不适用（移动承诺范围见方向 §4.5）')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await expect(page.locator('.workspace__greeting')).toBeVisible()
    await expectRegionMatches(page, regions.topbar, REGION_THRESHOLDS.topbar, 'shell-topbar.png')
    await expectRegionMatches(page, regions.sidebar, REGION_THRESHOLDS.sidebar, 'shell-sidebar.png')
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'workspace-main.png')
  })

  // 管理端壳三区基线（P53 补证 EV-03）：下拉关闭过渡不再构成 flake——
  // 采集时点固定为「下拉菜单 hidden + 管理端顶栏可见」之后，且 expectRegionMatches
  // 全局 animations:'disabled'（playwright.config expect.toHaveScreenshot）。
  test('管理端壳三区基线（进入后台，节点 04）', async ({ page }) => {
    await loginAs(page, 'superadmin', 'admin123')
    const viewport = page.viewportSize()?.width ?? 1440
    test.skip(viewport < 768, '375 不承担管理端完整导航（方向 §4.5），区域分区不适用')
    const regions = desktopRegions(page.viewportSize() ?? undefined)
    await page.locator('.app-topbar__user').click()
    const dropdown = page.locator('.el-dropdown-menu').first()
    await dropdown.getByText('进入后台').click()
    await expect(dropdown).toBeHidden()
    await expect(page.locator('header.basic-layout__topbar--admin')).toBeVisible()
    // 区域切换重排与 EP 按需样式就绪后再取像素基线（几何=64px，背景=管理端 Figma 色）
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().height ?? 0),
      )
      .toBe(64)
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.querySelector('header') ?? document.body).backgroundColor,
        ),
      )
      .toBe('rgb(17, 27, 59)')
    await page.waitForTimeout(400)
    await expectRegionMatches(page, regions.topbar, REGION_THRESHOLDS.topbar, 'admin-topbar.png')
    await expectRegionMatches(page, regions.sidebar, REGION_THRESHOLDS.sidebar, 'admin-sidebar.png')
    await expectRegionMatches(page, regions.main, REGION_THRESHOLDS.main, 'admin-main.png')
  })
})
