import { describe, expect, it } from 'vitest'
import { resolveDropIndex, type DropRect } from './drop-index'

/** 两行布局：A(12 栏, 左) B(12 栏, 右) 同一行；C(24 栏) 第二行。 */
const A: DropRect = { left: 0, right: 300, top: 0, bottom: 100 }
const B: DropRect = { left: 300, right: 600, top: 0, bottom: 100 }
const C: DropRect = { left: 0, right: 600, top: 120, bottom: 220 }

describe('resolveDropIndex 画布落点', () => {
  it('空画布恒为 0', () => {
    expect(resolveDropIndex([], { x: 100, y: 100 })).toBe(0)
  })

  it('同一行：左半区插前、右半区插后', () => {
    expect(resolveDropIndex([A, B], { x: 60, y: 50 })).toBe(0)
    expect(resolveDropIndex([A, B], { x: 240, y: 50 })).toBe(1)
    expect(resolveDropIndex([A, B], { x: 360, y: 50 })).toBe(1)
    expect(resolveDropIndex([A, B], { x: 560, y: 50 })).toBe(2)
  })

  it('末行下方空白：追加到末尾', () => {
    expect(resolveDropIndex([A, B, C], { x: 300, y: 400 })).toBe(3)
    expect(resolveDropIndex([A, B, C], { x: 20, y: 400 })).toBe(3)
  })

  it('首行上方：插到最前', () => {
    expect(resolveDropIndex([A, B, C], { x: 20, y: -40 })).toBe(0)
    // 指针在最右列的列上方 → 落到该列字段之前（流式：A 之后 / B 之前）
    expect(resolveDropIndex([A, B, C], { x: 580, y: -40 })).toBe(1)
  })

  it('两行之间的缝隙：靠近上一行插其后，靠近下一行插其前', () => {
    expect(resolveDropIndex([A, B, C], { x: 300, y: 108 })).toBe(1)
    expect(resolveDropIndex([A, B, C], { x: 300, y: 116 })).toBe(2)
    expect(resolveDropIndex([A, B, C], { x: 20, y: 130 })).toBe(2)
  })

  it('落点水平超出画布仍按最近字段判定', () => {
    // 指针在最右字段右侧远处：仍在同一行垂直范围内 → 按右半区判为插后
    expect(resolveDropIndex([A, B, C], { x: 900, y: 50 })).toBe(2)
    // 指针在最右下字段右侧且低于其下缘 → 追加末尾
    expect(resolveDropIndex([A, B, C], { x: 900, y: 300 })).toBe(3)
  })
})
