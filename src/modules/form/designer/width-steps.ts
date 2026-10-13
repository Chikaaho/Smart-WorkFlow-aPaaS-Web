/**
 * BF20261013-016：字段宽度档位（24 栅格列数）与右缘拖拽调宽的换算。
 *
 * 档位是属性面板「宽度」选择器与画布拖拽的**单一来源**：两处口径必须一致
 * （Owner：拖动的宽度变动和选择一样分 6 档）。6 档等距（相邻差 4 列）：
 * 100% / 83% / 67% / 50% / 33% / 17%。
 */
export const WIDTH_COL_STEPS: ReadonlyArray<number> = [24, 20, 16, 12, 8, 4]

/** 档位百分比展示（业务口径，四舍五入到整数）。 */
export function widthStepPercent(cols: number): number {
  return Math.round((cols / 24) * 100)
}

/** 最近档位下标（等距取更宽档，保证同一起点下判定稳定）。 */
function nearestStepIndex(cols: number): number {
  let bestIdx = 0
  let bestDist = Number.POSITIVE_INFINITY
  WIDTH_COL_STEPS.forEach((step, idx) => {
    const dist = Math.abs(step - cols)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = idx
    }
  })
  return bestIdx
}

/**
 * 选中字段右缘拖拽调宽：把水平位移换算成 24 栅格列数。
 *
 * - 位移先按画布单列步进（stepPx = 单列含列距的像素宽）换算成列数，再折算档位位移；
 *   超过半档才跳档，正负方向对称。
 * - 起点不在档位上（历史自定义宽度）时先归并到最近档，再按位移跳档。
 * - stepPx 非法（画布未渲染/宽度为 0）时返回原值，不产生跳动。
 */
export function resolveResizeColSpan(startCols: number, deltaPx: number, stepPx: number): number {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return startCols
  const stepGap = WIDTH_COL_STEPS[0] - WIDTH_COL_STEPS[1]
  const startIdx = nearestStepIndex(startCols)
  const halfSteps = Math.abs(deltaPx / stepPx) / stepGap
  const deltaSteps = Math.sign(deltaPx) * Math.round(halfSteps)
  // 档位数组按宽度降序：变宽 = 下标减小
  const nextIdx = Math.min(WIDTH_COL_STEPS.length - 1, Math.max(0, startIdx - deltaSteps))
  return WIDTH_COL_STEPS[nextIdx]
}
