import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_MIN_H,
  WORKSPACE_MIN_W,
  applyDragRect,
  collectCandidates,
  dragAxisOffsets,
  snapDelta,
} from './workspace-canvas'

describe('workspace-canvas 几何工具', () => {
  it('collectCandidates 汇聚画布边界与卡片边/中点', () => {
    const candidates = collectCandidates([{ x: 100, y: 50, w: 200, h: 100 }], 800, 600)
    expect(candidates.xs).toContain(0)
    expect(candidates.xs).toContain(400)
    expect(candidates.xs).toContain(800)
    expect(candidates.xs).toContain(100)
    expect(candidates.xs).toContain(200)
    expect(candidates.xs).toContain(300)
    expect(candidates.ys).toContain(50)
    expect(candidates.ys).toContain(100)
    expect(candidates.ys).toContain(150)
  })

  it('snapDelta 在阈值内吸附最近边并返回对齐线位置', () => {
    const candidates = { xs: [0, 200, 800], ys: [0, 300, 600] }
    const result = snapDelta(
      { x: 204, y: 10, w: 100, h: 80 },
      candidates,
      [0, 50, 100],
      [0, 40, 80],
    )
    expect(result.dx).toBe(-4)
    expect(result.guideX).toBe(200)
    expect(result.dy).toBe(0)
    expect(result.guideY).toBeNull()
  })

  it('snapDelta 超过阈值时不吸附', () => {
    const candidates = { xs: [400], ys: [300] }
    const result = snapDelta({ x: 0, y: 0, w: 100, h: 80 }, candidates, [0, 50, 100], [0, 40, 80])
    expect(result.dx).toBe(0)
    expect(result.guideX).toBeNull()
    expect(result.dy).toBe(0)
    expect(result.guideY).toBeNull()
  })

  it('applyDragRect 保持最小尺寸并正确处理 west/north 反向缩放', () => {
    const orig = { x: 300, y: 200, w: 400, h: 300 }
    expect(applyDragRect(orig, 'e', -1000, 0).w).toBe(WORKSPACE_MIN_W)
    const west = applyDragRect(orig, 'w', 1000, 0)
    expect(west.w).toBe(WORKSPACE_MIN_W)
    expect(west.x).toBe(orig.x + orig.w - WORKSPACE_MIN_W)
    const north = applyDragRect(orig, 'n', 0, 1000)
    expect(north.h).toBe(WORKSPACE_MIN_H)
    expect(north.y).toBe(orig.y + orig.h - WORKSPACE_MIN_H)
  })

  it('dragAxisOffsets 按手柄给出参与吸附的边偏移', () => {
    const rect = { x: 0, y: 0, w: 200, h: 100 }
    expect(dragAxisOffsets('', rect)).toEqual({ xs: [0, 100, 200], ys: [0, 50, 100] })
    expect(dragAxisOffsets('e', rect).xs).toEqual([200])
    expect(dragAxisOffsets('ne', rect)).toEqual({ xs: [200], ys: [0] })
    expect(dragAxisOffsets('s', rect).xs).toEqual([])
  })
})
