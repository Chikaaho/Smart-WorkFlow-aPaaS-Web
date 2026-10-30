import { test, expect } from '@playwright/test'

test.describe('0.2.0 表单配置与流程入口（mock 隔离）', () => {
  test('数据源授权与查询契约均可操作并回读', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript(() => {
      window.localStorage.setItem('sw.locale', 'zh-CN')
      window.sessionStorage.setItem('sw.design-fixture-id', 'node07')
    })
    await page.goto('/form/designer/seed-def-001?tab=permissions')
    await page.getByRole('button', { name: '受控数据源', exact: true }).click()

    const dialog = page.locator('.datasource-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('资产主数据')
    await page.getByRole('tab', { name: '查询契约', exact: true }).click()
    await expect(dialog.locator('#pane-contracts .el-table__row')).toHaveCount(3)
    await expect(dialog).toContainText('asset_list')
    await expect(dialog.locator('#pane-contracts .el-switch').nth(2)).not.toHaveClass(/is-checked/)

    await page.getByRole('tab', { name: '受控数据源', exact: true }).click()
    await page
      .locator('.el-table__row')
      .filter({ hasText: '资产主数据' })
      .getByRole('button', { name: '授权', exact: true })
      .click()
    await expect(page.getByText('授权主体 · 资产主数据')).toBeVisible()
    await page.locator('.grant-add__key input').fill('asset_manager')
    await page.locator('.grant-add').getByRole('button', { name: '添加', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).last().click()
    await expect(page.getByText('保存成功').first()).toBeVisible()
    await expect(page.locator('.el-dialog').filter({ hasText: '授权主体' })).toContainText(
      'asset_manager',
    )
  })

  test('授权代理规则创建后立即出现在列表并可撤销', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript(() => window.localStorage.setItem('sw.locale', 'zh-CN'))
    await page.goto('/workflow/authorize-rules')
    const tableRows = page.locator('.authorize-card .el-table__row')
    await expect(tableRows).toHaveCount(1)

    await page.getByPlaceholder('选择受托人').click()
    await page.getByPlaceholder('请输入关键词搜索').fill('陈')
    await page.getByRole('button', { name: '查询', exact: true }).last().click()
    await page.locator('.el-dialog__body .el-table__row').filter({ hasText: 'chenxi' }).click()
    await page
      .locator('.el-dialog__footer')
      .getByRole('button', { name: '确定', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: '选择人员', exact: true })).toBeHidden()

    await page.getByRole('combobox', { name: /流程/ }).click()
    await page.getByRole('option', { name: /请假审批/ }).click()
    await page.getByRole('button', { name: '新增授权', exact: true }).click()
    await expect(tableRows).toHaveCount(2)

    await page.getByRole('button', { name: '撤销', exact: true }).last().click()
    await page.locator('.el-message-box .el-button--primary').click()
    await expect(tableRows).toHaveCount(1)
  })

  test('子表字段可在居中弹窗中新增、排序并确认回写', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript(() => {
      window.localStorage.setItem('sw.locale', 'zh-CN')
      window.sessionStorage.setItem('sw.design-fixture-id', 'node07')
    })
    await page.goto('/form/designer/seed-def-001')
    await page.getByRole('button', { name: '编辑子表', exact: true }).click()
    const dialog = page.locator('.subfield-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.el-table__row')).toHaveCount(3)

    await dialog.getByRole('button', { name: '添加字段', exact: true }).click()
    const config = page.locator('.subfield-config-dialog')
    await expect(config).toBeVisible()
    await config.locator('input').first().fill('资源规格')
    await config
      .locator('.el-dialog__footer')
      .getByRole('button', { name: '确定', exact: true })
      .click()
    await expect(dialog.locator('.el-table__row')).toHaveCount(4)

    await dialog.locator('.el-table__row').nth(3).getByRole('button', { name: '上移' }).click()
    await expect(dialog.locator('.el-table__row').nth(2)).toContainText('资源规格')
    await dialog
      .locator('.el-dialog__footer')
      .getByRole('button', { name: '确定', exact: true })
      .click()
    await expect(page.locator('.field-shell__table-count')).toContainText('4 个子字段')
  })
})
