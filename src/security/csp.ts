/**
 * CSP 策略。由 vite.config.ts 注入到 index.html 的 meta 标签以及 dev/preview server 的响应头。
 *
 * script-src 维持严格（禁 unsafe-inline / unsafe-eval）——这是高价值防线，不动。
 * style-src 放开 'unsafe-inline'：Element Plus 的弹层（下拉/select/tooltip/dialog/popover）
 * 运行时用内联 style 定位，与禁 inline 直接冲突会导致弹层错位、对话框样式破。
 * 取舍：CSS 注入危害远小于 JS 注入，放开 style 的残余风险低，是使用组件库的标准代价
 * （决策文档 · 外壳刀 §6）。将来若要极致硬化可走 nonce 化样式，但与 EP 实际不兼容，不在本刀范围。
 */
export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')
