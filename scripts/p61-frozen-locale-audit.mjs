/**
 * P61：模块加载期求值审计（切语言失效缺陷）。
 *
 * 缺陷形态：`const X = t('k')` / `const M = { a: t('k') }` 出现在**模块顶层**或
 * 非响应式初始化中，导入时按当时语言求值一次，之后切换语言不再生效——
 * 页面会出现「同一屏里一半中文一半英文」（R7 真实浏览器已抓到实例）。
 *
 * 判定口径（只有**导入即求值**才算缺陷）：
 *   - 缺陷：模块顶层直接调用 t()/i18n.global.t()，且不在惰性容器内
 *   - 安全：`computed(() => …)`、箭头函数、函数体、`get x() { return t(…) }`（访问时求值）
 *   - 已复核可接受：`ref(t('k'))` —— 组件 setup 时的初值，用户随后可编辑，切语言不应覆盖用户输入
 *
 * 用法：node scripts/p61-frozen-locale-audit.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const CALL = /\bt\(|i18n\.global\.t\(/
/** 惰性/初值容器：这些写法不会在导入时固化语言 */
const LAZY = /computed\(|=>|function|ref\(|\bget\s+[\w"']+\s*\(\)/

function excluded(rel) {
  return (
    /\.(spec|test)\.ts$/.test(rel) ||
    rel.startsWith('src/locales/') ||
    rel.startsWith('src/foundation/mock')
  )
}

const hits = []
for (const file of walkDir(join(ROOT, 'src'))) {
  const rel = file
    .slice(ROOT.length + 1)
    .split('\\')
    .join('/')
  if (excluded(rel)) continue
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  let inBlockComment = false
  lines.forEach((line, i) => {
    const t = line.trim()
    if (inBlockComment) {
      if (t.includes('*/')) inBlockComment = false
      return
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlockComment = true
      return
    }
    if (t.startsWith('//') || t.startsWith('*')) return

    // 惰性/初值容器（computed / 箭头函数 / ref 初值 / getter）不构成导入期固化
    if (LAZY.test(line)) return

    // 顶层声明行直接调用 t(
    if (/^(export\s+)?(const|let|var)\s/.test(t) && CALL.test(t)) {
      hits.push({ file: rel, line: i + 1, kind: '顶层声明', text: t.slice(0, 110) })
      return
    }
    // 模块级对象字面量成员（缩进 2 且上一行以 { 结尾的 const 块内）
    if (/^\s{2,4}[\w"'[\]$]+\s*:.*\bt\(|^\s{2,4}[\w"'[\]$]+\s*:.*i18n\.global\.t\(/.test(line)) {
      // 向上找最近的 const 声明且其间没有函数体起始
      for (let j = i - 1; j >= Math.max(0, i - 25); j--) {
        const up = lines[j].trim()
        if (/^(export\s+)?(const|let|var)\s/.test(up)) {
          if (/=\s*\{$/.test(up) || /=\s*$/.test(up)) {
            hits.push({
              file: rel,
              line: i + 1,
              kind: `模块级对象成员（${up.slice(0, 40)}…）`,
              text: t.slice(0, 110),
            })
          }
          break
        }
        if (/=>|function\s|computed\(|ref\(/.test(up)) break
      }
    }
  })
}

console.log(`模块加载期求值命中: ${hits.length}`)
for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.kind}]  ${h.text}`)
process.exit(hits.length > 0 ? 1 : 0)
