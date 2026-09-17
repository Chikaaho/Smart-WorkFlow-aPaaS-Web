import { expect, type Page } from '@playwright/test'

/**
 * dev:mock 受控会话辅助。
 *
 * `pnpm dev:mock` 通过 .env.mock 的 VITE_DEBUG_AUTH_ENABLED/VITE_DEBUG_AUTH_USER_ID
 * 在应用启动时注入 superadmin 内存会话（main.ts → foundation/auth/dev-debug），
 * 打开受保护路由即为已登录状态，无需验证码表单。
 * username/password 参数保留签名以显式表达受测身份意图（当前 mock 注入固定 superadmin）。
 * 仅用于视觉/布局验证与受控 fixture，不承担真实后端业务证据（方向 §4.7）。
 */
export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  void username
  void password
  // 固定 zh-CN：Playwright 浏览器默认 en-US，i18n 会正确跟随；视觉断言按中文基线。
  await page.addInitScript(() => {
    window.localStorage.setItem('sw.locale', 'zh-CN')
  })
  // 冻结 Date（定时器照常运行）：问候语等时段文案随真实时间变化会造成基线时间脆弱
  // （P53 补证 EV-03 校准说明）。固定为上午 10 点，全部视觉测试时间确定。
  await page.clock.install()
  await page.clock.setFixedTime(new Date('2026-09-17T10:00:00'))
  // 全局禁用入场动画/过渡（与截图 animations:'disabled' 同语义）：
  // 并行负载下动画未结束会导致遮挡/越界测量游走性 flake，DOM 测量也要求确定性。
  await page.addInitScript(() => {
    const styleId = 'p53-visual-motion-reset'
    const installStyle = () => {
      if (!document.documentElement || document.getElementById(styleId)) return
      const style = document.createElement('style')
      style.id = styleId
      style.textContent =
        '*, *::before, *::after { animation-duration: 0.01ms !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; transition-delay: 0ms !important; }'
      document.documentElement.appendChild(style)
    }

    installStyle()
    if (!document.documentElement) {
      const observer = new MutationObserver(() => {
        installStyle()
        if (document.getElementById(styleId)) observer.disconnect()
      })
      observer.observe(document, { childList: true })
    }
  })
  await page.goto('/')
  // guard 将 '/' 重定向到 /workspace（登录默认落地页）
  await expect(page).toHaveURL(/\/workspace/)
  // 等待设计令牌与 EP 组件样式实际生效（并行负载下按需样式可能晚到，
  // 首绘 FOUC 会让顶栏几何/配色漂移，污染像素基线）：
  // ① 门户顶栏背景 = Figma 页面色（tokens.css 已应用）；② 顶栏高度 = 64px（EP 菜单样式已应用）。
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.querySelector('header') ?? document.body).backgroundColor,
      ),
    )
    .toBe('rgb(64, 54, 154)')
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().height ?? 0),
    )
    .toBe(64)
}
