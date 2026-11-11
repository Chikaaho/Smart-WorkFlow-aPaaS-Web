import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
const EV='E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'
const browser=await chromium.launch()
const page=await browser.newPage({viewport:{width:1200,height:900}})
for (const key of ['form_detail','task_detail','my_instance']) {
  await page.goto('file:///'+EV+'/b7_'+key+'_content.html')
  await page.waitForTimeout(300)
  await page.screenshot({path:EV+'/b7_'+key+'_content.png',fullPage:true})
  console.log('shot '+key)
}
await browser.close()
