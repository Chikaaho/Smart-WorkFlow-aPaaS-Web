/** P61 R1 辅助：统计未治理行的语法形态，用于精确扩展 codemod 规则。 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const inv = JSON.parse(readFileSync(join(ROOT, '.p61-tmp/inv2.json'), 'utf8'))

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const cache = new Map()
const lineOf = (file, n) => {
  if (!cache.has(file)) cache.set(file, readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/))
  return cache.get(file)[n - 1] ?? ''
}

const shapes = new Map()
const other = []
for (const r of inv.raw) {
  const line = lineOf(r.file, r.line)
  for (const lit of r.literals) {
    const e = esc(lit)
    const prop = line.match(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*['"\`]${e}`))
    const call = line.match(new RegExp(`([\\w.$]+)\\(\\s*['"\`]${e}`))
    const textNode = new RegExp('>\\s*' + e).test(line)
    let kind
    if (textNode) kind = '>textNode<'
    else if (prop) kind = 'prop:' + prop[1]
    else if (call) kind = 'call:' + call[1]
    else kind = 'other'
    shapes.set(kind, (shapes.get(kind) ?? 0) + 1)
    if (kind === 'other') other.push(`${r.file}:${r.line} :: ${lit}`)
  }
}

console.log(
  '总字面量实例:',
  inv.raw.reduce((s, r) => s + r.literals.length, 0),
)
for (const [k, v] of [...shapes.entries()].sort((a, b) => b[1] - a[1]))
  console.log(String(v).padStart(5), k)
console.log('\n--- other 样例（前 40）---')
for (const o of other.slice(0, 40)) console.log('  ' + o)
