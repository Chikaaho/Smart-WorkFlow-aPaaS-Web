/**
 * 工作台自由画布的纯几何工具：吸附、对齐线与缩放钳制。
 *
 * 交互层（WorkspaceHome）负责指针事件与状态，这里只做无副作用计算，
 * 便于对 ProcessOn 式「边对齐出虚线」行为做单元回归。
 */

export interface CardRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapCandidates {
  xs: number[]
  ys: number[]
}

export interface SnapResult {
  dx: number
  dy: number
  guideX: number | null
  guideY: number | null
}

/** 对齐吸附阈值（px）：ProcessOn 风格的近距吸附。 */
export const WORKSPACE_SNAP = 6
export const WORKSPACE_MIN_W = 240
export const WORKSPACE_MIN_H = 150

/** 汇聚可吸附候选线：画布边界/中线 + 每张卡片的左中右、上中下。 */
export function collectCandidates(
  rects: CardRect[],
  canvasW: number,
  canvasH: number,
): SnapCandidates {
  const xs = [0, canvasW / 2, canvasW]
  const ys = [0, canvasH / 2, canvasH]
  for (const r of rects) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w)
    ys.push(r.y, r.y + r.h / 2, r.y + r.h)
  }
  return { xs, ys }
}

/**
 * 计算吸附位移：对参与比较的边（相对 rect 的偏移）逐一匹配候选线，
 * 取距离最小且不超过阈值的一条；返回应用于当前拖拽 delta 的修正量。
 */
export function snapDelta(
  rect: CardRect,
  candidates: SnapCandidates,
  xOffsets: number[],
  yOffsets: number[],
  threshold: number = WORKSPACE_SNAP,
): SnapResult {
  let dx = 0
  let dy = 0
  let guideX: number | null = null
  let guideY: number | null = null

  if (xOffsets.length) {
    let best: { shift: number; dist: number; at: number } | null = null
    for (const off of xOffsets) {
      const edge = rect.x + off
      for (const c of candidates.xs) {
        const dist = Math.abs(c - edge)
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { shift: c - edge, dist, at: c }
        }
      }
    }
    if (best) {
      dx = best.shift
      guideX = best.at
    }
  }

  if (yOffsets.length) {
    let best: { shift: number; dist: number; at: number } | null = null
    for (const off of yOffsets) {
      const edge = rect.y + off
      for (const c of candidates.ys) {
        const dist = Math.abs(c - edge)
        if (dist <= threshold && (!best || dist < best.dist)) {
          best = { shift: c - edge, dist, at: c }
        }
      }
    }
    if (best) {
      dy = best.shift
      guideY = best.at
    }
  }

  return { dx, dy, guideX, guideY }
}

/**
 * 按拖拽 delta 与手柄推导新矩形：无手柄=整体移动；
 * e/s 只改宽高，w/n 反向改动 x/y；统一钳制最小尺寸并取整。
 */
export function applyDragRect(orig: CardRect, handle: string, dx: number, dy: number): CardRect {
  if (!handle) {
    return {
      x: Math.round(Math.max(0, orig.x + dx)),
      y: Math.round(Math.max(0, orig.y + dy)),
      w: orig.w,
      h: orig.h,
    }
  }
  let { x, y, w, h } = orig
  if (handle.includes('e')) w = orig.w + dx
  if (handle.includes('s')) h = orig.h + dy
  if (handle.includes('w')) {
    x = orig.x + dx
    w = orig.w - dx
  }
  if (handle.includes('n')) {
    y = orig.y + dy
    h = orig.h - dy
  }
  if (w < WORKSPACE_MIN_W) {
    if (handle.includes('w') && !handle.includes('e')) x -= WORKSPACE_MIN_W - w
    w = WORKSPACE_MIN_W
  }
  if (h < WORKSPACE_MIN_H) {
    if (handle.includes('n') && !handle.includes('s')) y -= WORKSPACE_MIN_H - h
    h = WORKSPACE_MIN_H
  }
  return {
    x: Math.round(Math.max(0, x)),
    y: Math.round(Math.max(0, y)),
    w: Math.round(w),
    h: Math.round(h),
  }
}

/** 给出当前手柄需要参与吸附的边偏移：移动=全边+中点，缩放=被拖拽边。 */
export function dragAxisOffsets(handle: string, rect: CardRect): { xs: number[]; ys: number[] } {
  if (!handle) {
    return { xs: [0, rect.w / 2, rect.w], ys: [0, rect.h / 2, rect.h] }
  }
  const xs = handle.includes('e') ? [rect.w] : handle.includes('w') ? [0] : []
  const ys = handle.includes('s') ? [rect.h] : handle.includes('n') ? [0] : []
  return { xs, ys }
}
