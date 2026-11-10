/* 1.0.0 阶段3 隔离环境取证：登录页打开 + 验证码落盘 + 登录页截图 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.SW_BASE || 'http://localhost:5275'
const EV = 'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'
mkdirSync(EV, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('img[alt*="验证码"], img[src^="data:image"]', { timeout: 10000 })
await page.waitForTimeout(600)
await page.screenshot({ path: EV + '/f1_login_page.png' })

// 验证码图片：按快照事实（img 含“点击刷新验证码”可访问名）取 src
const img = page.getByRole('img', { name: /点击刷新验证码/ }).first()
let src = await img.evaluate((el) => el.src)
writeFileSync('/tmp/sw100-captcha-src.txt', src)
const b64 = src.startsWith('data:') ? src.split(',')[1] : Buffer.from(await (await fetch(src)).arrayBuffer()).toString('base64')
writeFileSync('/tmp/sw100-captcha.png', Buffer.from(b64, 'base64'))
console.log('captcha saved, src-len=' + (src ? src.length : 0))
await browser.close()
