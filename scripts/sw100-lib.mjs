/* 1.0.0 阶段3 共享库：Playwright 登录（dev 固定验证码）+ 常量 */
export const BASE = process.env.SW_BASE || 'http://localhost:5275'
export const EV = 'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'
export const PW =
  'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'

export async function login(
  browser,
  { user = 'admin', pass = process.env.SW_ADMIN_PASS, captcha = '1234', shot = null } = {},
) {
  if (!pass) throw new Error('SW_ADMIN_PASS required')
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('img[src^="data:image"]', { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.getByPlaceholder('请输入账号').fill(user)
  await page.getByPlaceholder('请输入密码').fill(pass)
  await page.getByPlaceholder('请输入验证码').fill(captcha)
  if (shot) await page.screenshot({ path: EV + '/' + shot })
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(600)
  return { ctx, page }
}
