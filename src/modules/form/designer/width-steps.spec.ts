import { describe, expect, it } from 'vitest'
import { WIDTH_COL_STEPS, resolveResizeColSpan, widthStepPercent } from './width-steps'

describe('width-steps（BF20261013-016 宽度档位）', () => {
  it('6 档等距：100/83/67/50/33/17', () => {
    expect(WIDTH_COL_STEPS).toEqual([24, 20, 16, 12, 8, 4])
    expect(WIDTH_COL_STEPS.map(widthStepPercent)).toEqual([100, 83, 67, 50, 33, 17])
  })
})

describe('resolveResizeColSpan（右缘拖拽调宽，吸附 6 档）', () => {
  const STEP = 30

  it('拖右缘：向右变宽、向左变窄（整档跳）', () => {
    expect(resolveResizeColSpan(12, 4 * STEP, STEP)).toBe(16)
    expect(resolveResizeColSpan(12, -4 * STEP, STEP)).toBe(8)
  })

  it('超过半档才跳档，正负对称', () => {
    expect(resolveResizeColSpan(12, 1.9 * STEP, STEP)).toBe(12)
    expect(resolveResizeColSpan(12, -1.9 * STEP, STEP)).toBe(12)
    expect(resolveResizeColSpan(12, 2.1 * STEP, STEP)).toBe(16)
    expect(resolveResizeColSpan(12, -2.1 * STEP, STEP)).toBe(8)
  })

  it('起点不在档位上（历史自定义宽度）先归并到最近档', () => {
    expect(resolveResizeColSpan(14, 0, STEP)).toBe(16)
    expect(resolveResizeColSpan(6, 0, STEP)).toBe(8)
  })

  it('钳制在 4—24 列（首末档）', () => {
    expect(resolveResizeColSpan(12, -100 * STEP, STEP)).toBe(4)
    expect(resolveResizeColSpan(12, 100 * STEP, STEP)).toBe(24)
    expect(resolveResizeColSpan(4, -100 * STEP, STEP)).toBe(4)
    expect(resolveResizeColSpan(24, 100 * STEP, STEP)).toBe(24)
  })

  it('不足半列位移不改变宽度；非法步长返回原值', () => {
    expect(resolveResizeColSpan(12, 10, STEP)).toBe(12)
    expect(resolveResizeColSpan(12, 100, 0)).toBe(12)
    expect(resolveResizeColSpan(12, 100, Number.NaN)).toBe(12)
  })
})
