/**
 * 画布落点解析（纯函数）——把指针位置映射成插入下标。
 *
 * BF20261013-004 判定规则（Owner 2026-10-13 定）：**优先以上下区分，其次左右**，
 * 且上下按「一整行」计，不按单列格：
 *  1. 把格按 top 聚合成行（一行可含多个并排格）；
 *  2. 指针在某行下方 → 插到该行之后（不管该行有几列、指针 x 落在哪列的延长线上）；
 *     在所有行之下 → 追加末尾；在所有行之上 → 插到最前；
 *  3. 指针在某行内 → 行内按左右半区定插到该行内哪一格前后；
 *  4. 两行之间 → 就近行定界（靠近上行=其后，靠近下行=其前，两向插入点一致）。
 *
 * 调用方必须只传**真实字段**的矩形（排除拖拽预览格）；DesignerCanvas 对拖拽期间
 * 的矩形做几何快照（预览渲染推移布局不再影响判定），见该组件 dragGeometry。
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

interface RowGroup {
  top: number
  bottom: number
  cells: { index: number; r: DropRect }[]
}

export function resolveDropIndex(rects: readonly DropRect[], point: DropPoint): number {
  if (rects.length === 0) return 0

  // ── 行聚合：按 top 排序，top 落在当前行上半区（< 行高中点）归入当前行，否则开新行 ──
  const ordered = rects.map((r, index) => ({ r, index })).sort((a, b) => a.r.top - b.r.top)
  const rows: RowGroup[] = []
  for (const { r, index } of ordered) {
    const row = rows[rows.length - 1]
    // 行高为 0（无布局环境）时不拆行，避免退化成逐格一行
    const rowHeight = row ? row.bottom - row.top : 0
    if (!row || (rowHeight > 0 && r.top - row.top >= rowHeight / 2)) {
      rows.push({ top: r.top, bottom: r.bottom, cells: [{ index, r }] })
    } else {
      row.bottom = Math.max(row.bottom, r.bottom)
      row.cells.push({ index, r })
    }
  }

  // ── 垂直优先：所有行之下=末尾；所有行之上=最前 ──
  if (point.y > rows[rows.length - 1].bottom) return rects.length
  if (point.y < rows[0].top) return 0

  // ── 目标行：所在行做行内左右；行间只按整行边界（不再做行内 x 判定） ──
  const rowIdx = rows.findIndex((row) => point.y >= row.top && point.y <= row.bottom)
  if (rowIdx !== -1) {
    // 行内左右：x 与行内各格中线比较（格按 left 排序），x 超过末格中线=该行之后
    const cells = [...rows[rowIdx].cells].sort((a, b) => a.r.left - b.r.left)
    for (const cell of cells) {
      if (point.x <= (cell.r.left + cell.r.right) / 2) return cell.index
    }
    return cells[cells.length - 1].index + 1
  }

  // 行间：就近行的整行边界。「靠近上行=其后」「靠近下行=其前」是同一插入点
  // （上行末格与下行首格 index 连续）；行内 x 半区在此不参与——按整行算。
  for (let i = 0; i < rows.length - 1; i++) {
    if (point.y > rows[i].bottom && point.y < rows[i + 1].top) {
      // 靠近上行=上行末格之后；靠近下行=下行首格之前——两者是同一插入点
      return rows[i + 1].cells[0].index
    }
  }
  return rows[rows.length - 1].cells[rows[rows.length - 1].cells.length - 1].index + 1
}
