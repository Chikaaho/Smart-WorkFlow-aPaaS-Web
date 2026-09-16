/**
 * P61：旧目录 ↔ 新目录键集对账。
 *
 * 背景（这是一个真实踩过的坑）：新的目录是由「手工段 + 源码字面量字典」重建的，
 * 而某些键的中文**只存在于旧 locale 文件里**、源码中没有对应字面量（键化早已完成，
 * 只是当时没有把文案收进字典）。重建时会把这些键静默丢掉，页面上就渲染出键名。
 *
 * 本脚本把旧目录解析出来做键集对账：只报告、不改写；丢失项必须被补进单源后再生成。
 *
 * 用法：node scripts/p61-locale-reconcile.mjs <旧目录文件> [旧目录文件...]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocaleTree, flattenTree, loadConvergence } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** 旧目录是 `export default { ... }` 的纯对象字面量，按 JS 求值即可（无类型标注） */
function parseOldLocale(file) {
  const src = readFileSync(file, 'utf8')
  const body = src.slice(src.indexOf('export default') + 'export default'.length)

  return new Function(`return (${body})`)()
}

const current = new Map(flattenTree(buildLocaleTree(join(ROOT, 'scripts'), 'zh-CN')))
const currentEn = new Map(flattenTree(buildLocaleTree(join(ROOT, 'scripts'), 'en-US')))

const convergence = loadConvergence(join(ROOT, 'scripts'))

let unexplained = 0
let explained = 0
for (const file of process.argv.slice(2)) {
  const old = parseOldLocale(file)
  const locale = /en-US/.test(file) ? 'en-US' : 'zh-CN'
  const target = locale === 'en-US' ? currentEn : current
  const missing = flattenTree(old).filter(([k]) => !target.has(k))
  console.log(
    `\n${file}（${locale}）共 ${flattenTree(old).length} 键，当前缺失 ${missing.length} 键`,
  )
  for (const [k, v] of missing) {
    const winner = convergence[k]
    if (winner) {
      explained++
      console.log(`  [已收敛] ${k} → ${winner}（原值 ${JSON.stringify(v)}）`)
    } else {
      unexplained++
      console.log(`  [丢失!] ${k} = ${JSON.stringify(v)}`)
    }
  }
}
console.log(`\n已收敛 ${explained} 键；无解释的丢失 ${unexplained} 键`)
if (unexplained > 0) {
  console.error('\n存在未被收敛映射解释的键丢失：重建目录会把它们从产品里抹掉，必须补进单源。')
  process.exit(1)
}
console.log('对账通过：所有消失的键都由收敛映射解释')
