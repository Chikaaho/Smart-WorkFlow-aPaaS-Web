import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
const EV = 'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('file:///' + EV + '/s2_r3_itemsA_content.html', { waitUntil: 'load' })
await page.screenshot({ path: EV + '/s2_r3_excel_content.png', fullPage: true })
console.log('saved s2_r3_excel_content.png')
await b.close()
