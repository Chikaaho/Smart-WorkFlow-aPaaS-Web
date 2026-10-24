import { test, expect } from '@playwright/test'

test.describe('0.2.0 流程设计器会签选中态（mock 隔离）', () => {
  test('多分支画布可选择会签节点并显示审批人、结算与脚本状态', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript(() => {
      window.localStorage.setItem('sw.locale', 'zh-CN')
      window.sessionStorage.setItem('sw.design-fixture-id', 'node09')
    })
    await page.goto('/workflow/defs/1/design')

    const palette = page.locator('.designer-palette')
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('button', { name: '动态并行', exact: true })).toBeVisible()
    await expect
      .poll(() =>
        palette
          .locator("button[data-node-type='CONSENSUS'] .workbar-icon path")
          .first()
          .evaluate((element) => getComputedStyle(element).stroke),
      )
      .toBe('rgb(148, 95, 0)')
    await expect
      .poll(() =>
        palette
          .locator("button[data-node-type='DYNAMIC_PARALLEL'] .workbar-icon path")
          .first()
          .evaluate((element) => getComputedStyle(element).stroke),
      )
      .toBe('rgb(37, 99, 235)')
    await expect(page.locator('.pg-svg text', { hasText: '科技负责人会签' })).toBeVisible()
    await expect(page.locator('.pg-svg text')).toHaveCount(13)
    await page.locator('.designer-node').filter({ hasText: '科技负责人会签' }).click()

    const props = page.locator('.designer-props')
    await expect(props).toContainText('会签节点')
    await expect(props).toContainText('指定人员')
    await expect(props).toContainText('已选 2 人')
    await expect(props).toContainText('结算方式')
    await expect(props).toContainText('比例')
    await expect(props.getByRole('spinbutton', { name: '通过比例' })).toHaveValue('75')
    await expect(props).toContainText('节点触发器')
    await expect(props.getByRole('button', { name: '编辑脚本' }).first()).toBeVisible()
    await expect(props).toContainText('已配置')

    await page.screenshot({
      path: 'e2e/.artifacts/process-designer-consensus-selected-1920.png',
      fullPage: false,
    })
  })
})
