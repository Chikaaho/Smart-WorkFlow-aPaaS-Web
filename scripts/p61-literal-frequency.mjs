/** P61 R1 辅助：统计生产可达短字面量词频，用于构建术语字典。 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

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
      if (t && CJK.test(t)) freq.set(t, (freq.get(t) ?? 0) + 1)
    }
    const tpl = line.match(/>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)</g)
    if (tpl) {
      for (const raw of tpl) {
        const t = raw.slice(1, -1).trim()
        if (t && CJK.test(t)) freq.set(t, (freq.get(t) ?? 0) + 1)
      }
    }
  }
}

const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])
console.log(`唯一字面量: ${sorted.length}；累计出现: ${sorted.reduce((s, x) => s + x[1], 0)}`)
for (const [k, v] of sorted) console.log(`${v}\t${k}`)
