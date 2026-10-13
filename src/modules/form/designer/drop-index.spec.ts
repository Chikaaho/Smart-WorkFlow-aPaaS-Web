import { describe, expect, it } from 'vitest'
import { resolveDropIndex, type DropRect } from './drop-index'

/** 两行布局：A(12 栏, 左) B(12 栏, 右) 同一行；C(24 栏) 第二行。 */
const A: DropRect = { left: 0, right: 300, top: 0, bottom: 100 }
const B: DropRect = { left: 300, right: 600, top: 0, bottom: 100 }
const C: DropRect = { left: 0, right: 600, top: 120, bottom: 220 }

describe('resolveDropIndex 画布落点（行聚合：垂直优先，其次左右）', () => {
  it('空画布恒为 0', () => {
    expect(resolveDropIndex([], { x: 100, y: 100 })).toBe(0)
  })

  it('行内：左右半区定插到行内哪一格前后', () => {
    // 一行 A(左) B(右)
    expect(resolveDropIndex([A, B], { x: 60, y: 50 })).toBe(0)
    expect(resolveDropIndex([A, B], { x: 240, y: 50 })).toBe(1)
    expect(resolveDropIndex([A, B], { x: 360, y: 50 })).toBe(1)
    expect(resolveDropIndex([A, B], { x: 560, y: 50 })).toBe(2)
  })

  it('BF20261013-004：半宽末行（只有左侧格）的下方 → 一律追加末尾，不管指针 x 在哪列延长线上', () => {
    // 行1=A+B、行2=C(整行)、行3=D(左半, 0-300)。指针在 D 下方、x 落在右侧空白列延长线上
    const D: DropRect = { left: 0, right: 300, top: 240, bottom: 340 }
    expect(resolveDropIndex([A, B, C, D], { x: 60, y: 380 })).toBe(4)
    expect(resolveDropIndex([A, B, C, D], { x: 500, y: 380 })).toBe(4)
    expect(resolveDropIndex([A, B, C, D], { x: 590, y: 360 })).toBe(4)
  })

  it('末行下方空白：追加到末尾', () => {
    expect(resolveDropIndex([A, B, C], { x: 300, y: 400 })).toBe(3)
    expect(resolveDropIndex([A, B, C], { x: 20, y: 400 })).toBe(3)
  })

  it('首行上方：插到最前；上方偏右也是最前（整行语义）', () => {
    expect(resolveDropIndex([A, B, C], { x: 20, y: -40 })).toBe(0)
    expect(resolveDropIndex([A, B, C], { x: 580, y: -40 })).toBe(0)
  })

  it('两行之间的缝隙：整行边界插入，两向是同一插入点', () => {
    // A/B 行（0-100）与 C 行（120-220）之间的缝隙：无论靠近哪一行、x 在哪，
    // 都是「上行后=下行前」这一同一插入点（A/B 之后、C 之前=index 2）
    expect(resolveDropIndex([A, B, C], { x: 300, y: 108 })).toBe(2)
    expect(resolveDropIndex([A, B, C], { x: 300, y: 116 })).toBe(2)
    expect(resolveDropIndex([A, B, C], { x: 20, y: 110 })).toBe(2)
    expect(resolveDropIndex([A, B, C], { x: 20, y: 119 })).toBe(2)
  })

  it('落点水平超出画布：行内仍按 x 半区、行下追加末尾', () => {
    expect(resolveDropIndex([A, B, C], { x: 900, y: 50 })).toBe(2)
    expect(resolveDropIndex([A, B, C], { x: 900, y: 300 })).toBe(3)
  })
})
