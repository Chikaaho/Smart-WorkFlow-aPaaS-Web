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
/** 无布局环境（单测/jsdom）取不到画布宽度时的名义参考宽度。 */
export const WORKSPACE_NOMINAL_W = 1200

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

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * 像素矩形 → 持久化矩形（BUG-003 响应式契约）：x/w 归一为画布宽度分数
 * （0..1，4 位小数），y/h 保持像素。画布宽度非法时返回 null，调用方保留原几何。
 */
export function toRelativeRect(rect: CardRect, canvasW: number): CardRect | null {
  if (!Number.isFinite(canvasW) || canvasW <= 0) return null
  return {
    x: round4(clamp01(rect.x / canvasW)),
    y: Math.round(rect.y),
    w: round4(clamp01(rect.w / canvasW)),
    h: Math.round(rect.h),
  }
}

/**
 * 旧像素几何判别：像素宽必 ≥ WORKSPACE_MIN_W 而分数宽 ≤1，故 w>1（或 x>1）
 * 即 BUG-002 时代的旧数据。toAbsoluteRect 与水合缩放共用同一判别。
 */
export function isLegacyGeometry(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const g = raw as Partial<CardRect>
  const x = Number(g.x)
  const w = Number(g.w)
  return (Number.isFinite(x) && x > 1) || (Number.isFinite(w) && w > 1)
}

/**
 * 持久化矩形 → 当前画布像素矩形；非法输入返回 null。
 * 契约：x/w 为分数（≤1）、y/h 像素；h 在两种表示下都须 ≥ WORKSPACE_MIN_H。
 * 旧像素几何按当前画布宽度钳制（超出部分收进画布），保证小分辨率打开不产生
 * 横向溢出；整体比例恢复由水合层按设计宽度等比缩放完成。
 */
export function toAbsoluteRect(raw: unknown, canvasW: number): CardRect | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Partial<CardRect>
  const x = Number(g.x)
  const y = Number(g.y)
  const w = Number(g.w)
  const h = Number(g.h)
  if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0)) return null
  if (h < WORKSPACE_MIN_H) return null
  if (isLegacyGeometry(raw)) {
    if (w < WORKSPACE_MIN_W) return null
    if (!Number.isFinite(canvasW) || canvasW <= 0) {
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
    }
    const cx = Math.min(Math.round(x), Math.round(canvasW))
    const cw = Math.min(Math.round(w), Math.round(canvasW) - cx)
    if (cw <= 0) return null
    return { x: cx, y: Math.round(y), w: cw, h: Math.round(h) }
  }
  if (!Number.isFinite(canvasW) || canvasW <= 0) return null
  return {
    x: Math.round(x * canvasW),
    y: Math.round(y),
    w: Math.round(w * canvasW),
    h: Math.round(h),
  }
}

/**
 * 画布宽度变化（窗口分辨率、编辑态组件栏开合）时，把全部卡片 x/w 按新旧
 * 宽度比例等比缩放（y/h 保持），整体构图在任何分辨率下保持相对稳定。
 * 任一宽度非法或相等时原样返回。
 */
export function rescaleRects(
  rects: Record<string, CardRect>,
  prevW: number,
  nextW: number,
): Record<string, CardRect> {
  if (
    !Number.isFinite(prevW) ||
    !Number.isFinite(nextW) ||
    prevW <= 0 ||
    nextW <= 0 ||
    prevW === nextW
  ) {
    return rects
  }
  const ratio = nextW / prevW
  const out: Record<string, CardRect> = {}
  for (const [key, rect] of Object.entries(rects)) {
    out[key] = {
      x: Math.round(rect.x * ratio),
      y: rect.y,
      w: Math.round(rect.w * ratio),
      h: rect.h,
    }
  }
  return out
}
