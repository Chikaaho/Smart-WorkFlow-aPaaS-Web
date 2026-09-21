import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_MIN_H,
  WORKSPACE_MIN_W,
  applyDragRect,
  collectCandidates,
  dragAxisOffsets,
  isLegacyGeometry,
  rescaleRects,
  snapDelta,
  toAbsoluteRect,
  toRelativeRect,
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

describe('workspace-canvas 相对几何（V011-BUG-003 分辨率自适应）', () => {
  it('toRelativeRect 把像素几何归一为宽度分数，y/h 保持像素', () => {
    expect(toRelativeRect({ x: 300, y: 12, w: 600, h: 320 }, 1200)).toEqual({
      x: 0.25,
      y: 12,
      w: 0.5,
      h: 320,
    })
    expect(toRelativeRect({ x: 0, y: 0, w: 1200, h: 360 }, 1200)).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 360,
    })
  })

  it('toRelativeRect 画布宽度非法时返回 null', () => {
    expect(toRelativeRect({ x: 0, y: 0, w: 100, h: 200 }, 0)).toBeNull()
  })

  it('toAbsoluteRect 把分数几何按当前画布宽度展开', () => {
    expect(toAbsoluteRect({ x: 0.25, y: 12, w: 0.5, h: 320 }, 800)).toEqual({
      x: 200,
      y: 12,
      w: 400,
      h: 320,
    })
  })

  it('toAbsoluteRect 按 BUG-002 旧像素几何承接并钳制进当前画布（w>1 判别）', () => {
    expect(toAbsoluteRect({ x: 24, y: 0, w: 640, h: 360 }, 800)).toEqual({
      x: 24,
      y: 0,
      w: 640,
      h: 360,
    })
    // 旧像素宽超出当前画布：钳制到右缘，不产生横向溢出
    expect(toAbsoluteRect({ x: 24, y: 0, w: 900, h: 360 }, 800)).toEqual({
      x: 24,
      y: 0,
      w: 776,
      h: 360,
    })
    // 起点已在画布右缘之外：几何不可用，回落自动布局
    expect(toAbsoluteRect({ x: 800, y: 0, w: 400, h: 360 }, 800)).toBeNull()
  })

  it('isLegacyGeometry 以 w>1/x>1 判别旧像素数据，分数数据不算旧', () => {
    expect(isLegacyGeometry({ x: 0, y: 0, w: 1200, h: 360 })).toBe(true)
    expect(isLegacyGeometry({ x: 300, y: 0, w: 0.5, h: 360 })).toBe(true)
    expect(isLegacyGeometry({ x: 0, y: 0, w: 0.5, h: 360 })).toBe(false)
    expect(isLegacyGeometry(undefined)).toBe(false)
    expect(isLegacyGeometry('bad')).toBe(false)
  })

  it('toAbsoluteRect 拒绝非法或过小几何', () => {
    expect(toAbsoluteRect(null, 800)).toBeNull()
    expect(toAbsoluteRect({ x: -1, y: 0, w: 0.5, h: 320 }, 800)).toBeNull()
    expect(toAbsoluteRect({ x: 0, y: 0, w: 0.5, h: 20 }, 800)).toBeNull()
    expect(toAbsoluteRect({ x: 0, y: 0, w: 0.5, h: 320 }, 0)).toBeNull()
  })

  it('rescaleRects 等比缩放 x/w 并保持 y/h', () => {
    const rescaled = rescaleRects(
      { a: { x: 100, y: 10, w: 400, h: 200 }, b: { x: 0, y: 0, w: 1200, h: 360 } },
      1200,
      600,
    )
    expect(rescaled.a).toEqual({ x: 50, y: 10, w: 200, h: 200 })
    expect(rescaled.b).toEqual({ x: 0, y: 0, w: 600, h: 360 })
  })

  it('rescaleRects 宽度非法或相等时原样返回', () => {
    const rects = { a: { x: 1, y: 2, w: 3, h: 4 } }
    expect(rescaleRects(rects, 0, 600)).toBe(rects)
    expect(rescaleRects(rects, 600, 600)).toBe(rects)
  })
})
