import { test, expect } from '@playwright/test'

const STORAGE_KEY = 'sw.appearance.theme'

async function openMockWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => window.localStorage.setItem('sw.locale', 'zh-CN'))
  await page.goto('/')
  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--sw-color-primary').trim(),
      ),
    )
    .toBe('#2563eb')
}

test.describe('0.2.0 默认蓝色主题（mock 隔离）', () => {
  test('首次进入使用蓝色，预览取消保留原主题', async ({ page }) => {
    await openMockWorkspace(page)
    await page.getByRole('button', { name: '主题', exact: true }).click()
    const purple = page.locator('.theme-dialog__presets button').filter({ hasText: '紫色' })
    await purple.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
    await expect
      .poll(() =>
        page
          .locator('.theme-dialog__controls .el-button:not(.is-link)')
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(111, 45, 255)')
    await page.getByRole('button', { name: '关闭此对话框' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  })

  test('确认后刷新保持显式选择，恢复默认清除偏好', async ({ page }) => {
    await openMockWorkspace(page)
    await page.getByRole('button', { name: '主题', exact: true }).click()
    await page.locator('.theme-dialog__presets button').filter({ hasText: '紫色' }).click()
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'purple')
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('purple')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'purple')

    await page.getByRole('button', { name: '主题', exact: true }).click()
    await page.getByRole('button', { name: '恢复默认', exact: true }).click()
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  })

  test('低对比度自定义色被拒绝并可继续使用当前主题', async ({ page }) => {
    await openMockWorkspace(page)
    await page.getByRole('button', { name: '主题', exact: true }).click()
    await page.locator('.theme-dialog__presets button').filter({ hasText: '自定义' }).click()
    await page.locator('#theme-custom-color').fill('#ffffff')
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.getByText('主题色需要与白色文字和页面背景保持足够对比度')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  })
})
