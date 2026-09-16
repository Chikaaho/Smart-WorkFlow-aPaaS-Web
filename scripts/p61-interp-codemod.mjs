/**
 * P61 R1：含插值的模板文本节点键化。
 *
 * 缺陷：`<span>共 {{ total }} 条记录</span>` 这类文本节点同时含中文与插值，
 * 此前的行扫描与跨行扫描都因排除花括号而漏检——真实浏览器上直接以中文呈现。
 *
 * 做法：把文本节点按 `{{ expr }}` 切分，用 templates 批次的 zh 模板（含 {占位符}）匹配，
 * 命中的整段替换为 `{{ t('key', { name: expr }) }}`；插值表达式原样保留在参数里。
 *
 * 用法：node scripts/p61-interp-codemod.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBatches, stripComments, walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const dry = process.argv.includes('--dry')

const templates = loadBatches(join(ROOT, 'scripts'), 'p61-copy-templates')

function excluded(rel) {
  return (
    /\.(spec|test)\.ts$/.test(rel) ||
    rel.startsWith('src/locales/') ||
    rel.startsWith('src/foundation/mock')
  )
}

let files = 0
let hits = 0
const skipped = []

for (const file of walkDir(SRC)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (excluded(rel)) continue
  const original = readFileSync(file, 'utf8')
  const stripped = stripComments(original)
  if (!/[\u4e00-\u9fff]/.test(stripped)) continue

  // 在剥离注释的文本上定位文本节点，偏移与原文一致（剥注释保持长度）
  const edits = []
  for (const m of stripped.matchAll(/>\s*([^<>]*?[\u4e00-\u9fff][^<>]*?)\s*</g)) {
    const inner = m[1]
    if (!inner.includes('{{')) continue
    const parts = inner.split(/\{\{([^}]*)\}\}/)
    const exprs = parts.filter((_, i) => i % 2 === 1).map((s) => s.trim())
    const texts = parts.filter((_, i) => i % 2 === 0)
    if (exprs.length === 0) continue
    const simple = exprs.every(
      (e) => /^[A-Za-z_$][\w$]*$/.test(e) || /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(e),
    )
    const names = exprs.map((e) => (e.includes('.') ? e.slice(e.lastIndexOf('.') + 1) : e))
    let tpl = ''
    for (let i = 0; i < texts.length; i++) {
      tpl += texts[i].replace(/\s+/g, ' ')
      if (i < names.length) tpl += `{${names[i]}}`
    }
    tpl = tpl.replace(/^ /, '').replace(/ $/, '')
    const entry = templates[tpl]
    if (!entry) {
      if (!simple)
        skipped.push(`${rel}: 复杂插值 ${JSON.stringify(inner.replace(/\s+/g, ' ').trim())}`)
      continue
    }
    if (!simple) {
      skipped.push(`${rel}: 模板命中但插值复杂 ${JSON.stringify(tpl)}`)
      continue
    }
    const bindings = names.map((n, i) => (n === exprs[i] ? n : `${n}: ${exprs[i]}`)).join(', ')
    const start = m.index + 1 // '>' 之后
    const end = m.index + m[0].length - 1 // '<' 之前
    edits.push({ start, end, rep: `{{ t('${entry.key}', { ${bindings} }) }}` })
  }

  if (edits.length === 0) continue
  let out = original
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + e.rep + out.slice(e.end)
    hits++
  }
  // 确保 useI18n 可用
  {
    if (!/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(out)) {
      out = out.replace(
        /<script setup lang="ts">\n/,
        `<script setup lang="ts">\nimport { useI18n } from '@/locales'\n\nconst { t } = useI18n()\n`,
      )
    }
  }
  if (!dry) writeFileSync(file, out)
  files++
  console.log(`${edits.length}\t${rel}`)
}

console.log(`\n含插值文本节点键化：${files} 个文件，${hits} 处（${dry ? 'dry-run' : '已写入'}）`)
if (skipped.length) {
  console.log(`\n未处理 ${skipped.length} 处（需人工）：`)
  for (const s of skipped) console.log('  ' + s)
}
