/**
 * BF20261013-017：弹窗 ESC 关闭的输入法保护（全局，main.ts 安装一次）。
 *
 * Element Plus 的「ESC 关闭弹窗」统一挂在 document 上（useEscapeKeydown），
 * 且不看输入法组合态：中文输入法候选未确认时按 ESC 只是取消候选（输入法自身行为），
 * 该 keydown 仍带 code='Escape'（isComposing=true，部分浏览器 keyCode=229），
 * 会把弹窗一起关掉——用户只是想取消候选，却丢了整个弹窗。
 *
 * 处理：document 捕获阶段拦下「组合态 ESC」并 stopImmediatePropagation——
 * EP 的 document 监听（冒泡/目标阶段）收不到该事件，输入法候选取消不受影响；
 * 非组合态 ESC 原样放行，弹窗照常关闭（第二下 ESC 即关窗，符合直觉）。
 */

/** 事件最小结构（跨 jsdom/浏览器一致，便于纯函数测试）。 */
export interface EscapeKeyLike {
  code?: string
  key?: string
  isComposing?: boolean
  keyCode?: number
}

/** 是否为「取消输入法候选」的 ESC（组合态）：是则不应触发弹窗关闭。 */
export function isCompositionEscape(event: EscapeKeyLike): boolean {
  const isEscape = event.code === 'Escape' || event.key === 'Escape'
  return isEscape && (event.isComposing === true || event.keyCode === 229)
}

/** 安装全局守卫；返回卸载函数（测试用）。 */
export function installCompositionEscapeGuard(target: Document = globalThis.document): () => void {
  const handler = (event: EscapeKeyLike & { stopImmediatePropagation: () => void }) => {
    if (!isCompositionEscape(event)) return
    event.stopImmediatePropagation()
  }
  target.addEventListener('keydown', handler, true)
  return () => target.removeEventListener('keydown', handler, true)
}
