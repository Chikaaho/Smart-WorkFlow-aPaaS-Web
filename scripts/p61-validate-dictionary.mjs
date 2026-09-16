/**
 * P61 R1：字典与目录的一致性校验（一次列出全部问题，不因第一个冲突中断）。
 *
 * 校验项：
 *   1. 同一键被不同文案占用（zh 或 en 值不同）——会让生成器抛错，必须为 0
 *   2. 同一条目在不同批次被不同键覆盖（静默改名）
 *   3. 别名指向的键是否存在
 *   4. 缺 en / 空 en / en 里残留中文
 *   5. zh-CN 与 en-US 键集差异（必须为 0）
 *
 * 用法：node scripts/p61-validate-dictionary.mjs   # 有问题时非零退出
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { batchOverrides, loadBatches } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCRIPTS = join(ROOT, 'scripts')
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

const manual = JSON.parse(readFileSync(join(SCRIPTS, 'p61-locales-manual.json'), 'utf8'))
const dictionary = loadBatches(SCRIPTS, 'p61-copy-dictionary')
const templates = loadBatches(SCRIPTS, 'p61-copy-templates')

/** 手工段已写入的键（别名可由手工段充当正主） */
const flatten = (tree, prefix = '') =>
  Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? flatten(v, path) : [path]
  })
const MANUAL_KEYS = new Set(flatten(manual['zh-CN']))

const problems = []

function keyOwnerReport(label, entries) {
  const byKey = new Map()
  for (const [literal, entry] of Object.entries(entries)) {
    if (literal.startsWith('_')) continue
    if (!entry || typeof entry.key !== 'string') {
      problems.push(`${label}: 条目「${literal}」缺少 key`)
      continue
    }
    const rec = byKey.get(entry.key) ?? []
    rec.push([literal, entry])
    byKey.set(entry.key, rec)
  }
  for (const [key, users] of byKey) {
    // 只有**非别名**条目会真正写入目录值；别名只是「中文 → 键」的映射，
    // 其 en 不参与生成，拿它做冲突判定会产生误报。
    const owners = users.filter(([, e]) => !e.alias)
    if (owners.length < 2) continue
    const zhValues = new Set(owners.map(([literal]) => literal))
    const enValues = new Set(owners.map(([, e]) => e.en))
    if (zhValues.size > 1 || enValues.size > 1) {
      problems.push(
        `${label}: 键 ${key} 被多条文案占用 → ${users.map(([l, e]) => `${l}(alias=${!!e.alias})`).join(' | ')}`,
      )
    }
  }
  return byKey
}

const dictByKey = keyOwnerReport('dictionary', dictionary)
const tplByKey = keyOwnerReport('templates', templates)

for (const [literal, entry] of Object.entries({ ...dictionary, ...templates })) {
  if (literal.startsWith('_')) continue
  if (typeof entry.en !== 'string' || entry.en.trim() === '') {
    problems.push(`缺英文: ${entry.key ?? '?'} ← ${literal}`)
  } else if (CJK.test(entry.en)) {
    problems.push(`英文里残留中文: ${entry.key} → ${entry.en}`)
  }
  if (entry.alias) {
    // 别名只是「中文 → 键」的映射，本身不写值；必须存在**非别名**条目写这个键，
    // 否则键根本不会出现在目录里，页面会渲染出键名。
    // 正主可以来自字典/参数化文案，也可以来自手工段（manual 是合法来源）。
    const owners = [...(dictByKey.get(entry.key) ?? []), ...(tplByKey.get(entry.key) ?? [])]
    const fromManual = MANUAL_KEYS.has(entry.key)
    if (!fromManual && !owners.some(([, e]) => !e.alias)) {
      problems.push(`别名没有正主（无人写入该键）: ${entry.key} ← ${literal}`)
    }
  }
}

// 跨批次改名不阻断：生成器与 codemod 用同一份合并结果，应用内自洽；
// 但保留可见性，便于 R2a 同义/同形收敛时复核。
const renames = batchOverrides(SCRIPTS, 'p61-copy-dictionary')

// 键集一致性：以同一份源构建两份目录，键集必须逐键相同
function keySetOf(tree, prefix = '') {
  const out = new Set()
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') for (const p of keySetOf(v, path)) out.add(p)
    else out.add(path)
  }
  return out
}

function buildTree(locale) {
  const setPath = (tree, key, value) => {
    const parts = key.split('.')
    let node = tree
    for (const part of parts.slice(0, -1)) {
      node[part] = node[part] ?? {}
      node = node[part]
    }
    node[parts[parts.length - 1]] = value
  }
  const tree = JSON.parse(JSON.stringify(manual[locale]))
  for (const [zh, entry] of Object.entries(dictionary)) {
    if (zh.startsWith('_') || entry.alias) continue
    setPath(tree, entry.key, locale === 'zh-CN' ? zh : entry.en)
  }
  return tree
}

const zhKeys = keySetOf(buildTree('zh-CN'))
const enKeys = keySetOf(buildTree('en-US'))
for (const k of zhKeys) if (!enKeys.has(k)) problems.push(`en-US 缺键: ${k}`)
for (const k of enKeys) if (!zhKeys.has(k)) problems.push(`zh-CN 缺键: ${k}`)

const stats = {
  dictionaryEntries: Object.keys(dictionary).filter((k) => !k.startsWith('_')).length,
  templateEntries: Object.keys(templates).filter((k) => !k.startsWith('_')).length,
  manualKeys: keySetOf(manual['zh-CN']).size,
  localeKeys: zhKeys.size,
  distinctKeys: new Set([...dictByKey.keys(), ...tplByKey.keys()]).size,
}

console.log(JSON.stringify({ ...stats, crossBatchKeyChanges: renames.length }, null, 2))
if (renames.length) {
  console.log('\n（信息）跨批次键收敛记录：')
  for (const o of renames) console.log(`  「${o.literal}」 ${o.from} → ${o.to}`)
}
if (problems.length) {
  console.error(`\nP61 字典校验：发现 ${problems.length} 个问题`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log('\nP61 字典校验：通过（键唯一、双语齐备、键集零差异）')
