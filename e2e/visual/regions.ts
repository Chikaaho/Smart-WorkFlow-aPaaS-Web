import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * P53 视觉回归：区域阈值与独立阻断条件（方向 §4.7）。
 *
 * 无论整页差异比例是否合格，以下任一命中均失败：
 * 1. 关键元素越界（裁切）超过 1px；
 * 2. 关键交互遮挡面积 > 4px²；
 * 3. 关键容器位置偏差 > 2px；
 * 4. 断点行为错误；
 * 5. 加载/空态/错误/无权限/禁用状态缺失（由各页面族 spec 的选择器断言承担）；
 * 6. locale 键回退或硬编码绕过（由结构断言承担）。
 */

/** 方向 §4.7 初始区域阈值；首份合法基线后只允许一次有说明的校准。 */
export const REGION_THRESHOLDS = {
  topbar: 0.005,
  sidebar: 0.005,
  main: 0.02,
  longText: 0.03,
} as const

export interface RegionBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopRegions {
  topbar: RegionBox
  sidebar: RegionBox
  main: RegionBox
}

/** 桌面壳分区（P53 设计：64px 主导航 + 220px 深色侧栏）。 */
export function desktopRegions(viewport = { width: 1440, height: 1024 }): DesktopRegions {
  const { width, height } = viewport
  return {
    topbar: { x: 0, y: 0, width, height: 64 },
    sidebar: { x: 0, y: 64, width: 220, height: height - 64 },
    main: { x: 220, y: 64, width: width - 220, height: height - 64 },
  }
}

/** 区域像素 diff：超过区域阈值即失败（不允许以整页百分比替代）。
 * 截图前回到页顶：区域 clip 是视口绝对坐标，交互引发的页面滚动会使内容错位。 */
export async function expectRegionMatches(
  page: Page,
  region: RegionBox,
  threshold: number,
  snapshotName: string,
): Promise<void> {
  // headed 会话中前序动作可能把指针留在卡片上，hover 描边过渡会让稳定帧生成超时：
  // 截图前把指针移出页面并等过渡结束（V011-BUG-003 视觉回归在本机复跑时发现）。
  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(page).toHaveScreenshot(snapshotName, {
    clip: region,
    maxDiffPixelRatio: threshold,
    animations: 'disabled',
    caret: 'hide',
  })
}

/** 阻断条件 1：关键元素越界（被视口或滚动容器裁切）超过 1px 即失败。多元素选择器取首个；测量前回到页顶（避免自动滚动污染坐标系）。 */
export async function expectNotClipped(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first()
  const box = await el.boundingBox()
  expect(box, `关键元素未渲染：${selector}`).not.toBeNull()
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }
  const overflow = await el.evaluate((node) => {
    window.scrollTo(0, 0)
    const r = node.getBoundingClientRect()
    const overflowX = Math.max(0, r.right - document.documentElement.clientWidth, -r.left)
    const overflowY = Math.max(0, r.bottom - document.documentElement.clientHeight, -r.top)
    return { overflowX, overflowY }
  })
  expect(overflow, `关键元素不可测量：${selector}`).not.toBeNull()
  expect(
    overflow!.overflowX,
    `${selector} 横向被裁切 ${overflow!.overflowX}px（允许 ≤1px，视口 ${viewport.width}）`,
  ).toBeLessThanOrEqual(1)
  expect(
    overflow!.overflowY,
    `${selector} 纵向被裁切 ${overflow!.overflowY}px（允许 ≤1px，视口 ${viewport.height}）`,
  ).toBeLessThanOrEqual(1)
}

/** 阻断条件 2：关键交互元素被遮挡面积 > 4px² 即失败（elementFromPoint 命中自身或后代才算可达）。
 * 并行负载下的瞬态布局允许在 1s 内重测至稳定；稳定后仍遮挡才判失败。多元素选择器取首个。 */
export async function expectNotObscured(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first()
  const box = await el.boundingBox()
  expect(box, `关键元素未渲染：${selector}`).not.toBeNull()
  let occluded = true
  for (let attempt = 0; attempt < 6; attempt += 1) {
    occluded = await el.evaluate((node) => {
      const r = node.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = document.elementFromPoint(cx, cy)
      if (!hit) return true
      return !(node === hit || node.contains(hit) || hit.contains(node))
    })
    if (!occluded) break
    await page.waitForTimeout(150)
  }
  expect(occluded, `${selector} 中心点被其它元素遮挡（>4px² 等效不可达）`).toBe(false)
}

/** 阻断条件 3：关键容器位置与期望基准偏差 > 2px 即失败。多元素选择器取首个。 */
export async function expectPositionWithin(
  page: Page,
  selector: string,
  expected: { x: number; y: number },
): Promise<void> {
  const el = page.locator(selector).first()
  const box = await el.boundingBox()
  expect(box, `关键元素未渲染：${selector}`).not.toBeNull()
  expect(
    Math.abs(box!.x - expected.x),
    `${selector} x 偏差 ${Math.abs(box!.x - expected.x)}px > 2px`,
  ).toBeLessThanOrEqual(2)
  expect(
    Math.abs(box!.y - expected.y),
    `${selector} y 偏差 ${Math.abs(box!.y - expected.y)}px > 2px`,
  ).toBeLessThanOrEqual(2)
}
