/**
 * 设计器原生拖拽的最小类型（组件库 → 画布共用）。
 *
 * 仓库 ESLint 对 `.vue` 内直接命名 DOM 全局（DragEvent / HTMLElement / Node）报 no-undef，
 * 故这里一律不写这些名字：元素类型经 globalThis 取，事件用结构类型——真实 DragEvent
 * 结构化匹配即可传入，运行期零差异。
 */
export type CanvasElement = InstanceType<typeof globalThis.HTMLElement>

/** 画布侧需要的最小 dragover/drop/dragleave 结构。 */
export interface DragLikeEvent {
  clientX: number
  clientY: number
  relatedTarget: unknown
  dataTransfer: { dropEffect: string } | null
  preventDefault: () => void
}

/** 组件库侧需要的最小 dragstart 结构（含 setData / effectAllowed）。 */
export interface PaletteDragEvent {
  dataTransfer: {
    effectAllowed: string
    setData: (format: string, data: string) => void
  } | null
  preventDefault: () => void
}
