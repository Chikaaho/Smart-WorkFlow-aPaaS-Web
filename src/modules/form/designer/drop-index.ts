/**
 * 画布落点解析（纯函数）——把指针位置映射成插入下标。
 *
 * 画布是 24 栅格：字段可并排，所以不能只按 y 排序。规则：
 *  1. 取与指针最近的字段格（矩形距离，格内为 0）；
 *  2. 指针在该格垂直范围内 → 看左右半区（左半插前、右半插后）；
 *     在格子上方 → 插前；在格子下方 → 插后。
 * 空画布恒为 0。
 *
 * 调用方必须只传**真实字段**的矩形（排除拖拽预览格）：预览格本身占位会把后续字段推下去，
 * 若把它算进几何，指针落在预览位置上会不断改判插入位置（抖动）。
 */
export interface DropRect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DropPoint {
  x: number
  y: number
}

export function resolveDropIndex(rects: readonly DropRect[], point: DropPoint): number {
  if (rects.length === 0) return 0

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let insertAfter = true

  rects.forEach((rect, index) => {
    const dx =
      point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
    const dy =
      point.y < rect.top ? point.y - rect.top : point.y > rect.bottom ? point.y - rect.bottom : 0
    const distance = Math.hypot(dx, dy)
    if (distance >= bestDistance) return

    bestDistance = distance
    bestIndex = index
    // BF20261013-004：按格垂直中线判定——下半区一律「插到该格之后」，上半区才分左右。
    // 旧实现行内纯按左右半区：指针贴在组件下半左侧时会被判「插到它前面」，
    // 与「拖到组件下方=放到它后面」的手势意图相反（多组件场景预览跳位的体感来源）。
    const centerY = (rect.top + rect.bottom) / 2
    if (point.y > centerY) {
      // 格内下半：手势意图=放到该格之后
      insertAfter = true
    } else if (point.y >= rect.top) {
      // 格内上半：左半插前、右半插后（并排语义）
      insertAfter = point.x > (rect.left + rect.right) / 2
    } else {
      // 格上方：插到该格之前
      insertAfter = false
    }
  })

  return insertAfter ? bestIndex + 1 : bestIndex
}
