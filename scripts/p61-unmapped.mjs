/** P61 R1 辅助：列出未进入字典的字面量（按频次），用于下一批翻译。 */
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
const freq = new Map()
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (/\.(spec|test)\.ts$/.test(rel)) continue
  if (rel.startsWith('src/foundation/mock')) continue
  if (rel.startsWith('src/locales/')) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    LITERAL_RE.lastIndex = 0
    let m
    while ((m = LITERAL_RE.exec(line)) !== null) {
      const t = (m[1] ?? m[2] ?? m[3] ?? '').trim()
      if (t && CJK.test(t) && !dict[t]) freq.set(t, (freq.get(t) ?? 0) + 1)
    }
    const tpl = line.match(/>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)</g)
    if (tpl) {
      for (const raw of tpl) {
        const t = raw.slice(1, -1).trim()
        if (t && CJK.test(t) && !dict[t]) freq.set(t, (freq.get(t) ?? 0) + 1)
      }
    }
  }
}

const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])
const limit = Number(process.argv[2] ?? 5000)
console.log(
  `未覆盖唯一字面量: ${sorted.length}；未覆盖出现次数: ${sorted.reduce((s, x) => s + x[1], 0)}`,
)
for (const [k, v] of sorted.slice(0, limit)) console.log(`${v}\t${k}`)
