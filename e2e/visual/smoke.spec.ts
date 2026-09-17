import { test, expect } from '@playwright/test'

/**
 * P53 阶段 A/B 连通性冒烟：验证 Playwright 底座可启动 dev:mock 并到达真实路由。
 * 不落截图基线——视觉基线在阶段 B 全部入口页改造完成后统一建立，
 * 避免对中间视觉消耗方向 §4.7 允许的唯一一次基线校准。
 */

test.describe('P53 视觉回归底座连通性', () => {
  test('登录页可达且品牌分栏与表单结构在（节点 06）', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/CH-aPaaS/)
    await expect(page.locator('section.login-page__brand strong')).toHaveText('CH-aPaaS')
    await expect(page.locator('form.login-page__form')).toBeVisible()
    await expect(page.locator('form.login-page__form button[type="submit"]')).toBeVisible()
  })

  test('375 视口登录页隐藏品牌区、表单可用（方向 §4.5）', async ({ page: mobile }) => {
    await mobile.setViewportSize({ width: 375, height: 812 })
    await mobile.goto('/login')
    await expect(mobile.locator('section.login-page__brand')).toBeHidden()
    await expect(mobile.locator('form.login-page__form button[type="submit"]')).toBeVisible()
  })

  test('未登录访问未知路由被守卫收敛（未认证→登录页；mock refresh 成功→动态 404）', async ({
    page,
  }) => {
    await page.goto('/definitely-not-a-route')
    // 两种合法守卫落点：refresh 失败→/login；mock refresh 成功→catchall 404。
    await expect(page).toHaveURL(/\/(login|404)/)
  })

  test('en-US 语言下登录页渲染英文（双语跟随，方向 §4.6）', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sw.locale', 'en-US'))
    await page.goto('/login')
    await expect(page.locator('.login-page__welcome')).toHaveText('Welcome back')
    await expect(page.locator('button[type="submit"]')).toHaveText(/Sign in/)
  })

  test('键盘 Tab 可达登录表单首个输入框（键盘路径，方向 §4.6）', async ({ page }) => {
    await page.goto('/login')
    const usernameInput = page.locator('input[autocomplete="username"]')
    // Responsive controls can change the number of stops before the form. Verify
    // keyboard reachability without assuming one fixed count across viewports.
    for (let stop = 0; stop < 8; stop += 1) {
      if (await usernameInput.evaluate((element) => element === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(usernameInput).toBeFocused()
  })
})
