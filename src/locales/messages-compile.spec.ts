import { describe, it, expect } from 'vitest'
import { i18n } from './index'
import zhCN from './zh-CN'
import enUS from './en-US'

/**
 * 权威目录的**可编译性**契约（P61 R1）。
 *
 * vue-i18n 会把文案里的花括号当作占位符解析，字面花括号必须转义成 {'{'} / {'}'}：
 *   - `{"userName": "张三"}` → 「Invalid token in placeholder」直接编译失败
 *   - `{{input}}`           → 「Not allowed nest placeholder」
 *   - `${userName}`         → 静默吞成 `$`（更危险：不报错但展示错误）
 * 这类问题只在运行期渲染该键时才暴露，因此在这里对**全部键**逐一编译，
 * 把「渲染到某个冷门页面才发现」提前成目录生成后立刻失败。
 *
 * 同时校验：每个键在两种语言下都能解析出非空文案且不等于键名本身。
 */

type Tree = Record<string, unknown>

function leafKeys(tree: Tree, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leafKeys(v as Tree, path))
    else out.push(path)
  }
  return out
}

const zhKeys = leafKeys(zhCN as Tree)
const enKeys = leafKeys(enUS as Tree)

/** 文案里的占位符名（用于给出可复现的参数，避免解析告警掩盖编译错误） */
function placeholdersOf(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z_$][\w$]*)\}/g)].map((m) => m[1])
}

function valueAt(tree: Tree, key: string): string {
  let node: unknown = tree
  for (const part of key.split('.')) {
    node = (node as Tree)[part]
  }
  return typeof node === 'string' ? node : ''
}

function messagesFor(tree: Tree): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of leafKeys(tree)) out[key] = valueAt(tree, key)
  return out
}

describe('locales/权威目录可编译性', () => {
  it('zh-CN 与 en-US 键集完全一致（零差异）', () => {
    const zh = new Set(zhKeys)
    const en = new Set(enKeys)
    const onlyZh = [...zh].filter((k) => !en.has(k))
    const onlyEn = [...en].filter((k) => !zh.has(k))
    expect(onlyZh).toEqual([])
    expect(onlyEn).toEqual([])
    expect(zhKeys.length).toBeGreaterThan(0)
  })

  for (const locale of ['zh-CN', 'en-US'] as const) {
    const tree = (locale === 'zh-CN' ? zhCN : enUS) as Tree

    it(`${locale} 全部文案可被 vue-i18n 编译且解析为非空文本`, () => {
      const failures: string[] = []
      for (const key of leafKeys(tree)) {
        const raw = valueAt(tree, key)
        const args: Record<string, string> = {}
        for (const name of placeholdersOf(raw)) args[name] = `«${name}»`
        try {
          const rendered = i18n.global.t(key, args, { locale })
          if (typeof rendered !== 'string' || rendered.length === 0) {
            failures.push(`${key}: 解析结果为空`)
          } else if (rendered === key) {
            failures.push(`${key}: 回落为键名（目录里缺这条文案）`)
          }
        } catch (e) {
          failures.push(`${key}: ${(e as Error).message.split('\n')[0]}`)
        }
      }
      expect(failures).toEqual([])
    })
  }

  it('字面花括号在渲染时原样呈现（不被 vue-i18n 吞掉或误解析）', () => {
    const zh = messagesFor(zhCN as Tree)
    const literalCases = Object.entries(zh).filter(([, v]) => /\{'\{'\}|\{'\}'\}/.test(v))
    expect(literalCases.length).toBeGreaterThan(0)
    for (const [key, raw] of literalCases) {
      const expected = raw.replace(/\{'\{'\}/g, '{').replace(/\{'}'\}/g, '}')
      expect(i18n.global.t(key, {}, { locale: 'zh-CN' })).toBe(expected)
    }
  })

  it('已声明占位符在传入参数时被正确替换', () => {
    const zh = messagesFor(zhCN as Tree)
    const parameterized = Object.entries(zh).filter(
      ([, v]) => !/\{'\s*[{]\s*'\}/.test(v) && placeholdersOf(v).length > 0,
    )
    expect(parameterized.length).toBeGreaterThan(0)
    for (const [key, raw] of parameterized) {
      const names = placeholdersOf(raw)
      const args = Object.fromEntries(names.map((n) => [n, `«${n}»`]))
      const rendered = i18n.global.t(key, args, { locale: 'zh-CN' })
      for (const n of names) expect(rendered).toContain(`«${n}»`)
    }
  })
})
