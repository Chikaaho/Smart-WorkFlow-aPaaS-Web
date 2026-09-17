/**
 * P53 DESIGN_FIDELITY 专用 fixture 激活标志（极轻量客户端读取）。
 * 仅 dev:mock + capture 脚本会写入 sessionStorage；生产运行恒为 null，
 * 相关展示分支不生效。独立小模块：布局组件不得静态引入 mock handlers（打包边界）。
 */
const KEY = 'sw.design-fixture-id'

export function activeDesignFixtureFlag(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const id = sessionStorage.getItem(KEY)
    return id && id.trim() ? id.trim() : null
  } catch {
    return null
  }
}
