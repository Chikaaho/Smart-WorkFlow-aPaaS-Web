import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 回归测试：tokens.css 是设计系统的单一视觉数据源。
 * 断言关键 --sw-* 变量名存在，防止意外删除或改名。
 * 若有意重构/重命名 token，同步更新此测试即可。
 */

const css: string = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf-8')

// 移除注释，避免注释中的 token 名造成误匹配
const rootBlock = css.replace(/\/\*[\s\S]*?\*\//g, '')

// 8 类 token 各抽查代表性变量
const CATEGORIES: Record<string, string[]> = {
  品牌色: ['--sw-color-primary'],
  中性色: ['--sw-text-primary', '--sw-text-regular', '--sw-border-base'],
  语义色: ['--sw-success', '--sw-danger', '--sw-warning-bg'],
  字号: ['--sw-font-h1', '--sw-font-body', '--sw-font-caption'],
  圆角: ['--sw-radius-sm', '--sw-radius-base', '--sw-radius-lg'],
  间距: ['--sw-space-4', '--sw-space-16', '--sw-space-32'],
  阴影: ['--sw-shadow-card', '--sw-shadow-popper', '--sw-shadow-modal'],
  控件密度: ['--sw-control-height', '--sw-form-row-gap', '--sw-table-row-height'],
  布局: ['--sw-layout-aside-width', '--sw-layout-header-height', '--sw-layout-header-padding-x'],
}

describe('styles/tokens.css', () => {
  for (const [category, vars] of Object.entries(CATEGORIES)) {
    it(`${category} token 齐全`, () => {
      for (const v of vars) {
        expect(rootBlock).toContain(v)
      }
    })
  }
})
