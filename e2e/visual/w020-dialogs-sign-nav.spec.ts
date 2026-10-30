import { test, expect } from '@playwright/test'

/**
 * 0.2.0 统一整改批次视觉留档（mock 隔离，ISOLATED_REGRESSION 层级）：
 * 会签聚合/会签记录弹窗（设计 60:190）、驳回申请弹窗（272:1746）、
 * 退回申请弹窗（273:2001）、催办弹窗（273:2025）、应用内页目录整栏收起（272:1296）。
 * 固定紫主题与设计原稿（默认紫模式）同态可比；截图供与离线设计图对照。
 */

async function pinDesignContext(page: import('@playwright/test').Page, fixtureId?: string) {
  await page.addInitScript((fixture) => {
    window.localStorage.setItem('sw.locale', 'zh-CN')
    window.localStorage.setItem(
      'sw.appearance.theme',
      JSON.stringify({ name: 'purple', customColor: '#b45309' }),
    )
    if (fixture) window.sessionStorage.setItem('sw.design-fixture-id', fixture)
  }, fixtureId)
}

test.describe('0.2.0 会签聚合与审批弹窗（mock 隔离视觉）', () => {
  test('会签聚合入口与记录弹窗（设计 60:190）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await pinDesignContext(page, 'node16')
    await page.goto('/workflow/task/mock-task-001')

    await page.getByRole('tab', { name: '审批详情', exact: true }).click()
    const group = page.locator('[data-testid="sign-group"]')
    await expect(group).toBeVisible()
    await expect(group).toContainText('会签记录 · 会签审批')
    await expect(group).toContainText('3人已同意')
    await expect(group).toContainText('1人驳回')
    await page.screenshot({ path: 'e2e/.artifacts/sign-groups-entry-1920.png' })

    await group.click()
    const dialog = page.locator('[data-testid="sign-records-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(page.locator('[data-testid="sign-records-stats"]')).toContainText('3人已同意')
    await expect(dialog.locator('.el-table__row')).toHaveCount(4)
    await page.screenshot({ path: 'e2e/.artifacts/sign-records-dialog-1920.png' })
    console.log('sign-dialog box', JSON.stringify(await dialog.boundingBox()))
    await dialog.screenshot({ path: 'e2e/.artifacts/sign-records-dialog-element.png' })

    await page.getByRole('tab', { name: '已同意', exact: true }).click()
    await expect(dialog.locator('.el-table__row')).toHaveCount(3)
    await page.getByRole('tab', { name: '已驳回', exact: true }).click()
    await expect(dialog.locator('.el-table__row')).toHaveCount(1)
  })

  test('驳回申请弹窗（设计 272:1746）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await pinDesignContext(page, 'node16')
    await page.goto('/workflow/task/mock-task-001')

    await page.getByRole('button', { name: '驳回', exact: true }).click()
    const dialog = page.locator('[data-testid="reject-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('驳回原因')
    await page.getByPlaceholder('请输入原因').fill('材料不齐，退回补充')
    await page.screenshot({ path: 'e2e/.artifacts/reject-dialog-1920.png' })
    console.log('reject-dialog box', JSON.stringify(await dialog.boundingBox()))
    await dialog.screenshot({ path: 'e2e/.artifacts/reject-dialog-element.png' })
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('退回申请弹窗（设计 273:2001）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await pinDesignContext(page, 'node16')
    await page.goto('/workflow/task/mock-task-001')

    await page.locator('[data-testid="return-open-dialog"]').click()
    const dialog = page.locator('[data-testid="return-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('退回目标')
    await expect(dialog).toContainText('将退回到所选人工节点的最新已办轮次')
    await page.screenshot({ path: 'e2e/.artifacts/return-dialog-1920.png' })
    console.log('return-dialog box', JSON.stringify(await dialog.boundingBox()))
    await dialog.screenshot({ path: 'e2e/.artifacts/return-dialog-element.png' })
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('催办弹窗（设计 273:2025）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await pinDesignContext(page, 'node16')
    await page.goto('/workflow/task/mock-task-001')

    await page.locator('[data-testid="approval-more-trigger"]').click()
    await page.locator('[data-testid="approval-more-urge"]').click()
    const dialog = page.locator('[data-testid="urge-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('将向当前待办人发送催办提醒')
    await page.getByPlaceholder('请输入催办留言（可空）').fill('请尽快处理')
    await page.screenshot({ path: 'e2e/.artifacts/urge-dialog-1920.png' })
    console.log('urge-dialog box', JSON.stringify(await dialog.boundingBox()))
    await dialog.screenshot({ path: 'e2e/.artifacts/urge-dialog-element.png' })
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('应用内页目录整栏收起（设计 272:1296）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await pinDesignContext(page)
    await page.goto('/form/app-center/mock-app-001')

    const collapse = page.locator('[data-testid="app-tree-nav-collapse"]')
    await expect(collapse).toBeVisible()
    await expect(page.locator('.app-tree-nav__tree')).toBeVisible()
    await page.screenshot({ path: 'e2e/.artifacts/app-nav-expanded-1920.png' })

    await collapse.click()
    await expect(page.locator('aside.app-tree-nav')).toHaveClass(/is-collapsed/)
    const expander = page.locator('[data-testid="app-tree-nav-expand"]')
    await expect(expander).toBeVisible()
    await expect(page.locator('.app-tree-nav__tree')).not.toBeVisible()
    await page.screenshot({ path: 'e2e/.artifacts/app-nav-collapsed-1920.png' })

    await expander.click()
    await expect(page.locator('.app-tree-nav__tree')).toBeVisible()
  })
})
