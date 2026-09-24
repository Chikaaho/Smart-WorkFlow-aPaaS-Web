import { test, expect } from '@playwright/test'
import { loginAs } from './auth.js'

/**
 * P53 阶段 B 壳行为冒烟（mock 会话，真实路由/菜单/区域链路）：
 * 顶栏主导航、深色侧栏、区域切换、个人菜单与门户可达。
 * 断言按视口分化：≥768px 侧栏可见；375px 侧栏隐藏（R5/方向 §4.5）。
 * 截图仅存档供人工复核（e2e/.artifacts/），不作为截图基线断言。
 */

test.describe('P53 全局壳（登录后）', () => {
  test('工作台：主导航与深色侧栏渲染，个人菜单含真实动作', async ({ page }) => {
    await loginAs(page, 'superadmin', 'admin123')
    await expect(page).toHaveURL(/\/workspace/)
    const header = page.locator('header.basic-layout__topbar--portal')
    await expect(header).toBeVisible()
    await expect(header).toHaveCSS('height', '64px')
    await expect(header).toHaveCSS('background-color', 'rgb(64, 54, 154)')
    const logoFrame = page.locator('.app-logo__mark-frame')
    await expect(logoFrame).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(logoFrame).toHaveCSS('border-radius', '8px')
    const viewport = page.viewportSize()?.width ?? 1440
    if (viewport >= 768) {
      // 设计门容差 ≤2px（方向 §4.7）：品牌框左缘≈24、主导航左缘≈240
      const logoX = (await logoFrame.boundingBox())?.x ?? -1
      expect(Math.abs(logoX - 24)).toBeLessThanOrEqual(2)
      const navX = (await page.locator('.app-main-nav').boundingBox())?.x ?? -1
      expect(Math.abs(navX - 240)).toBeLessThanOrEqual(2)
    }
    await expect(page.locator('nav.app-main-nav .app-main-nav__item')).toHaveCount(4)

    const aside = page.locator('aside.basic-layout__aside')
    if (viewport >= 768) {
      await expect(aside).toBeVisible()
    } else {
      await expect(aside).toBeHidden()
    }

    // 问候与真实统计头（节点 01；review-04..07 设计还原后类名）
    await expect(page.locator('.wsd-hero__greeting')).toBeVisible()
    await expect(page.locator('.wsd-stat')).toHaveCount(4)

    if (viewport >= 768) {
      // 个人菜单（节点 28/30）：账号绑定 / 进入后台 / 退出登录（无修改密码/忘记密码）
      await page.locator('.app-topbar__user').click()
      const dropdown = page.locator('.app-topbar__dropdown')
      await expect(dropdown).toBeVisible()
      await expect(dropdown).not.toContainText(/修改密码|忘记密码|remember/i)
      await expect(dropdown).toContainText('进入后台')
    }

    await page.screenshot({ path: 'e2e/.artifacts/shell-portal-workspace.png', fullPage: false })
  })

  test('企业门户可达：hero 与常用服务按权限渲染（节点 05）', async ({ page }) => {
    await loginAs(page, 'superadmin', 'admin123')
    const viewport = page.viewportSize()?.width ?? 1440
    if (viewport >= 768) {
      await page.locator('nav.app-main-nav').getByText('我的门户').click()
    } else {
      // 方向 §4.5：375 只要求登录页与三个 H5 页可操作；门户在窄屏仅验证路由可达与渲染。
      await page.goto('/portal')
    }
    await expect(page).toHaveURL(/\/portal/)
    await expect(page.locator('.portal__hero')).toBeVisible()
    const services = page.locator('.portal-service')
    // 服务卡按服务端菜单可见集过滤（菜单单源）：agent 会话为静态深链不在菜单树，
    // superadmin 种子下可见卡 = 流程中心/表单管理/物联网/收件箱。
    await expect(services.first()).toBeVisible()
    await page.screenshot({ path: 'e2e/.artifacts/shell-portal-home.png', fullPage: false })
  })

  test('进入后台：顶栏切换管理端深色形态（节点 04）', async ({ page }) => {
    await loginAs(page, 'superadmin', 'admin123')
    const viewport = page.viewportSize()?.width ?? 1440
    test.skip(viewport < 768, '复杂管理页在小屏不承担完整导航（方向 §4.5），区域切换冒烟仅桌面')
    await page.locator('.app-topbar__user').click()
    await page.locator('.app-topbar__dropdown').getByText('进入后台').click()
    const header = page.locator('header.basic-layout__topbar--admin')
    await expect(header).toBeVisible()
    await expect(header).toHaveCSS('height', '64px')
    await expect(header).toHaveCSS('background-color', 'rgb(17, 27, 59)')
    {
      const navX = (await page.locator('.app-main-nav').boundingBox())?.x ?? -1
      expect(Math.abs(navX - 240)).toBeLessThanOrEqual(2)
    }
    // 管理端主导航来自服务端菜单顶层分组
    const navItems = page.locator('nav.app-main-nav .app-main-nav__item')
    await expect(navItems.first()).toBeVisible()
    await page.screenshot({ path: 'e2e/.artifacts/shell-admin.png', fullPage: false })
  })
})
