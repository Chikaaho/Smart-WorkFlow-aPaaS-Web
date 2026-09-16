/**
 * P61 R1：Web 生产可达静态文案盘点与硬编码门禁（工具生成的权威清单）。
 *
 * 用法：
 *   node scripts/p61-copy-inventory.mjs              # 输出盘点（JSON + 摘要）
 *   node scripts/p61-copy-inventory.mjs --check      # 门禁：存在未治理硬编码时非零退出
 *
 * 分类口径（工具判定，非人工声明）：
 *   - 用户可见静态文案：源码中含中日韩字符的字符串字面量 / 模板文本节点
 *   - 动态数据：非字面量（变量、接口返回）不参与
 *   - 排除：*.spec.ts / *.test.ts、foundation/mock/**（mock 双门，不进生产）、locales/**（权威目录本身）
 *
 * 判定「已治理」的两种形态：
 *   1) 已键化——该行出现 i18n 调用（t(/te(/i18n.global.t）或本文件位于 locales/
 *   2) 已登记豁免 EXEMPTIONS（键=相对路径，值=理由）；豁免必须逐条可复核
 */
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CJK,
  multilineTextNodes,
  scanLiterals,
  stripComments,
  interpolatedTextNodes,
  templateTextNodes,
  walkDir,
} from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/**
 * 已登记的非展示文案：文件 → { 字面量: 理由 }。
 * 与「豁免整个文件」不同，这里逐字面量登记，且只在声明的文件内生效——
 * 同一中文在别处是展示文案时不会被连带豁免。
 */
const EXCLUDED_LITERALS = (() => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'scripts/p61-copy-exclusions.json'), 'utf8'))
  const map = new Map()
  for (const [file, entries] of Object.entries(raw)) {
    if (file.startsWith('_')) continue
    map.set(file, new Set(Object.keys(entries)))
  }
  return map
})()

function isExcludedLiteral(file, text) {
  return EXCLUDED_LITERALS.get(file)?.has(text) === true
}

/** 已登记豁免：路径 → 理由（必须逐条可复核；不允许按目录通配） */
const EXEMPTIONS = {
  // 语言目录本身是权威文案源，其字面量即 zh-CN 版本
  'src/locales/zh-CN.ts': 'zh-CN 权威文案目录本身',
  'src/locales/en-US.ts': 'en-US 权威文案目录本身',
  // 开发期 mock 不进入生产构建（double gate + DCE）
  'src/foundation/mock': 'mock 双门，生产构建被 tree-shake',
}

const I18N_CALL = /\b(t|te)\(\s*'|\b(t|te)\(\s*"|i18n\.global\.t\(|\$t\(/

const walk = walkDir

function isExcluded(rel) {
  const posix = rel.split(sep).join('/')
  if (/\.(spec|test)\.ts$/.test(posix)) return 'spec/test'
  for (const key of Object.keys(EXEMPTIONS)) {
    if (posix === key || posix.startsWith(key + '/')) return EXEMPTIONS[key]
  }
  return null
}

/** 提取一行里的生产可达文案：引号字面量 + Vue 模板文本节点（注释已在扫描前剥离） */
function literalsIn(line) {
  const found = []
  for (const lit of scanLiterals(line)) {
    if (lit.content && CJK.test(lit.content) && !lit.content.startsWith('@/'))
      found.push(lit.content)
  }
  for (const node of templateTextNodes(line)) {
    if (node.text && CJK.test(node.text)) found.push(node.text)
  }
  return found
}

/** 跨行文本节点无法按行发现（文字与标签分处不同行），必须整文件扫描。 */
function multilineLiterals(src) {
  const lineStarts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') lineStarts.push(i + 1)
  }
  const lineOf = (offset) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  return multilineTextNodes(src).map((node) => ({ line: lineOf(node.index), text: node.text }))
}

function scan() {
  const files = walk(SRC)
  const raw = []
  const keyed = []
  const excluded = []
  const excludedLiterals = []
  for (const file of files) {
    const rel = relative(ROOT, file)
    const reason = isExcluded(rel)
    if (reason) {
      excluded.push({ file: rel.split(sep).join('/'), reason })
      continue
    }
    const stripped = stripComments(readFileSync(file, 'utf8'))
    const lines = stripped.split(/\r?\n/)
    lines.forEach((line, idx) => {
      const lits = literalsIn(line)
      if (lits.length === 0) return
      const posix = rel.split(sep).join('/')
      const pending = lits.filter((t) => !isExcludedLiteral(posix, t))
      if (pending.length === 0) {
        excludedLiterals.push({ file: posix, line: idx + 1, literals: lits })
        return
      }
      const entry = {
        file: posix,
        line: idx + 1,
        literals: pending,
        registered: lits.filter((t) => !pending.includes(t)),
      }
      if (I18N_CALL.test(line)) {
        keyed.push(entry)
      } else {
        raw.push(entry)
      }
    })

    // 跨行文本节点：按行扫描的盲区（按钮文字换行书写），必须整文件补扫
    const posix = rel.split(sep).join('/')
    for (const node of multilineLiterals(stripped)) {
      if (isExcludedLiteral(posix, node.text)) continue
      const lineText = lines[node.line - 1] ?? ''
      if (I18N_CALL.test(lineText)) continue
      raw.push({ file: posix, line: node.line, literals: [node.text], multiline: true })
    }

    // 含插值的文本节点：两个扫描器都排除花括号，必须单独补扫
    const lineStarts2 = [0]
    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] === '\n') lineStarts2.push(i + 1)
    }
    const lineOf2 = (off) => {
      let lo = 0,
        hi = lineStarts2.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (lineStarts2[mid] <= off) lo = mid
        else hi = mid - 1
      }
      return lo + 1
    }
    for (const node of interpolatedTextNodes(stripped)) {
      if (I18N_CALL.test(node.inner)) continue
      const lineNo = lineOf2(node.index)
      const lineText = lines[lineNo - 1] ?? ''
      if (I18N_CALL.test(lineText)) continue
      raw.push({ file: posix, line: lineNo, literals: [node.text], interpolated: true })
    }
  }
  return { raw, keyed, excluded, excludedLiterals }
}

const { raw, keyed, excluded, excludedLiterals } = scan()
const byFile = new Map()
for (const e of raw) byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1)

const summary = {
  generatedAt: new Date().toISOString(),
  cwd: ROOT,
  rawLines: raw.length,
  rawFiles: byFile.size,
  keyedLines: keyed.length,
  excludedFiles: excluded.length,
  registeredNonCopyLines: excludedLiterals.length,
  registeredNonCopyLiterals: [...EXCLUDED_LITERALS.values()].reduce((s, x) => s + x.size, 0),
  topFiles: [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, raw, keyed }, null, 2))
} else if (process.argv.includes('--check')) {
  console.log(JSON.stringify(summary, null, 2))
  if (raw.length > 0) {
    console.error(
      `\nP61 硬编码门禁：发现 ${raw.length} 行未治理的生产可达中文文案（${byFile.size} 个文件）`,
    )
    for (const [file, count] of summary.topFiles.slice(0, 10)) {
      console.error(`  ${count}\t${file}`)
    }
    process.exit(1)
  }
  console.log('\nP61 硬编码门禁：通过（生产可达中文文案已全部治理）')
} else {
  console.log('P61 Web 文案盘点')
  console.log(`  未治理行: ${summary.rawLines}（${summary.rawFiles} 个文件）`)
  console.log(`  已键化行: ${summary.keyedLines}`)
  console.log(`  排除文件: ${summary.excludedFiles}`)
  console.log(
    `  已登记非展示字面量: ${summary.registeredNonCopyLiterals} 条（命中 ${summary.registeredNonCopyLines} 行）`,
  )
  console.log('  未治理最多的文件:')
  for (const [file, count] of summary.topFiles) console.log(`    ${count}\t${file}`)
}
