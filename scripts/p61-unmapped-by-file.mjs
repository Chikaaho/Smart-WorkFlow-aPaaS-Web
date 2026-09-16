/**
 * P61 R1 辅助：按文件输出未进入字典的生产可达中文字面量（JSON）。
 *
 * 用法：node scripts/p61-unmapped-by-file.mjs            # 全量
 *      node scripts/p61-unmapped-by-file.mjs --chunk 4 3   # 第 3/4 片（按文件均衡切分）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBatches } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const CJK = /[\u4e00-\u9fff]/

const dict = loadBatches(join(ROOT, 'scripts'), 'p61-copy-dictionary')

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const f = join(d, n)
    const s = statSync(f)
    if (s.isDirectory()) walk(f, out)
    else if (/\.(ts|vue)$/.test(n)) out.push(f)
  }
  return out
}

const LITERAL_RE =
  /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g

function excluded(rel) {
  return (
    /\.(spec|test)\.ts$/.test(rel) ||
    rel.startsWith('src/foundation/mock') ||
    rel.startsWith('src/locales/')
  )
}

const byFile = new Map()
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (excluded(rel)) continue
  const set = new Set()
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    LITERAL_RE.lastIndex = 0
    let m
    while ((m = LITERAL_RE.exec(line)) !== null) {
      const t = (m[1] ?? m[2] ?? m[3] ?? '').trim()
      if (t && CJK.test(t) && !dict[t]) set.add(t)
    }
    const tpl = line.match(/>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)</g)
    if (tpl) {
      for (const raw of tpl) {
        const t = raw.slice(1, -1).trim()
        if (t && CJK.test(t) && !dict[t]) set.add(t)
      }
    }
  }
  if (set.size) byFile.set(rel, [...set])
}

const files = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)
const ci = process.argv.indexOf('--chunk')
let selected = files
if (ci !== -1) {
  const total = Number(process.argv[ci + 1])
  const idx = Number(process.argv[ci + 2])
  // 贪心均衡切分：按文件字面量数量降序轮流放入当前最小片
  const buckets = Array.from({ length: total }, () => ({ n: 0, items: [] }))
  for (const [rel, lits] of files) {
    const min = buckets.reduce((a, b) => (a.n <= b.n ? a : b))
    min.items.push([rel, lits])
    min.n += lits.length
  }
  selected = buckets[idx - 1].items
}

console.log(JSON.stringify(Object.fromEntries(selected), null, 2))
