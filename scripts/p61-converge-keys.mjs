/**
 * P61 R2a：同文异译收敛。
 *
 * 同一句中文被多个键持有、且在英文侧分叉时，页面上会出现「同一状态两种说法」。
 * 收敛做法：
 *   1. 选定唯一权威键（p61-key-convergence.json 显式声明，可逐条复核）
 *   2. 把源码里 t('被收敛键') 全部改写成 t('权威键')
 *   3. 在被收敛条目上标 alias，使其只参与 zh→键 映射、不再单独写值
 *
 * 用法：
 *   node scripts/p61-converge-keys.mjs --report   # 只统计调用点，不改写
 *   node scripts/p61-converge-keys.mjs            # 应用映射并改写源码
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocaleTree, flattenTree, stripComments, walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const SCRIPTS = join(ROOT, 'scripts')
const reportOnly = process.argv.includes('--report')

const zhTree = buildLocaleTree(SCRIPTS, 'zh-CN')
const enTree = buildLocaleTree(SCRIPTS, 'en-US')
const enById = new Map(flattenTree(enTree))

const byText = new Map()
for (const [key, value] of flattenTree(zhTree)) {
  if (typeof value !== 'string' || !/[\u4e00-\u9fff]/.test(value)) continue
  const norm = value.replace(/[\s·]/g, '')
  if (!byText.has(norm)) byText.set(norm, [])
  byText.get(norm).push(key)
}

/**
 * 统计源码里每个键的引用点。
 * 只数 t('key') 会漏掉「键以字符串形式存在映射表里」的引用（如 error-code-map 的 code→键表），
 * 因此统计所有引号包裹的键字面量。
 */
const usage = new Map()
const CALL = /(?:i18n\.global\.t|\bt|\$t)\(\s*'([\w.$]+)'/g
const QUOTED = /'([a-z][\w$]*(?:\.[\w$]+)+)'/g
for (const file of walkDir(SRC)) {
  const src = stripComments(readFileSync(file, 'utf8'))
  const seen = new Set()
  for (const m of src.matchAll(QUOTED)) seen.add(m[1])
  for (const key of seen) usage.set(key, (usage.get(key) ?? 0) + 1)
}

const conflicting = [...byText.entries()]
  .map(([text, keys]) => {
    const byEn = new Map()
    for (const key of keys) {
      const en = enById.get(key) ?? ''
      if (!byEn.has(en)) byEn.set(en, [])
      byEn.get(en).push(key)
    }
    return { text, keys, variants: [...byEn.entries()] }
  })
  .filter((x) => x.variants.length > 1)

const convergence = JSON.parse(readFileSync(join(SCRIPTS, 'p61-key-convergence.json'), 'utf8'))

if (reportOnly) {
  console.log(`同文异译组: ${conflicting.length}`)
  for (const c of conflicting) {
    console.log(`\n「${c.text}」`)
    for (const [en, keys] of c.variants) {
      for (const key of keys) {
        const mapped = Object.entries(convergence).find(([from]) => from === key)
        const tag = mapped ? `→ 收敛到 ${mapped[1]}` : '（保留）'
        console.log(
          `  ${String(usage.get(key) ?? 0).padStart(3)} 处  ${key.padEnd(42)} ${JSON.stringify(en).slice(0, 70)} ${tag}`,
        )
      }
    }
  }
  process.exit(0)
}

// --- 应用：源码改写 ---
const keyMap = new Map(Object.entries(convergence).filter(([k]) => !k.startsWith('_')))

function rewriteFile(file) {
  let src = readFileSync(file, 'utf8')
  const before = src
  let count = 0
  src = src.replace(/((?:i18n\.global\.t|\bt|\$t)\(\s*')([\w.$]+)(')/g, (full, head, key, tail) => {
    const target = keyMap.get(key)
    if (!target) return full
    count++
    return `${head}${target}${tail}`
  })
  if (src !== before) {
    writeFileSync(file, src)
    return count
  }
  return 0
}

let files = 0
let total = 0
for (const file of walkDir(SRC)) {
  const n = rewriteFile(file)
  if (n > 0) {
    files++
    total += n
    console.log(
      `${n}\t${file
        .slice(ROOT.length + 1)
        .split('\\')
        .join('/')}`,
    )
  }
}
console.log(`\n收敛改写：${files} 个文件，${total} 处`)

// 校验：被收敛键不应再被源码引用
const stillUsed = []
for (const file of walkDir(SRC)) {
  const src = stripComments(readFileSync(file, 'utf8'))
  for (const m of src.matchAll(CALL)) {
    if (keyMap.has(m[1])) stillUsed.push(`${file.slice(ROOT.length + 1)} :: ${m[1]}`)
  }
}
if (stillUsed.length) {
  console.error(`\n仍有未改写的被收敛键 ${stillUsed.length} 处：`)
  for (const s of stillUsed) console.error('  ' + s)
  process.exit(1)
}
console.log('被收敛键在源码中已零引用')
