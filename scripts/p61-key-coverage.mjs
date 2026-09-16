/**
 * P61：源码引用的文案键 ↔ 目录覆盖校验。
 *
 * 这是「重建目录丢键」类缺陷的根本防线：只要源码里 t('x.y') 引用的键不在目录中，
 * 页面上就会渲染出键名本身（既不报错也不告警）。静态校验把它变成构建期失败。
 *
 * 判定范围：
 *   1. t('key') / i18n.global.t('key') / $t('key') 调用实参——必然是键
 *   2. 以目录既有命名空间开头、且形如 a.b.c 的字符字面量——覆盖 error-code-map
 *      这类「键存在映射表里、不经过 t() 调用点」的用法
 *
 * 用法：node scripts/p61-key-coverage.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocaleTree, flattenTree, stripComments, walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

const zh = new Map(flattenTree(buildLocaleTree(join(ROOT, 'scripts'), 'zh-CN')))
const en = new Map(flattenTree(buildLocaleTree(join(ROOT, 'scripts'), 'en-US')))

/** 目录里真实存在的命名空间（用于把普通点号字符串与文案键区分开） */
const NAMESPACES = new Set([...zh.keys()].map((k) => k.split('.')[0]))

const CALL_KEY = /(?:i18n\.global\.t|\bt|\$t)\(\s*'([\w.$]+)'/g
const QUOTED = /'([a-z][\w$]*(?:\.[\w$]+)+)'/g

const missingZh = []
const missingEn = []
const seen = new Set()

for (const file of walkDir(SRC)) {
  const rel = file
    .slice(ROOT.length + 1)
    .split('\\')
    .join('/')
  if (rel.startsWith('src/locales/')) continue
  // 测试文件里的键可能是刻意的探针（验证可插拔性），不构成产品缺键
  if (/\.(spec|test)\.ts$/.test(rel)) continue
  const src = stripComments(readFileSync(file, 'utf8'))

  const candidates = new Set()
  for (const m of src.matchAll(CALL_KEY)) candidates.add(m[1])
  for (const m of src.matchAll(QUOTED)) {
    const key = m[1]
    if (NAMESPACES.has(key.split('.')[0])) candidates.add(key)
  }

  for (const key of candidates) {
    if (seen.has(`${rel}::${key}`)) continue
    seen.add(`${rel}::${key}`)
    if (!zh.has(key)) missingZh.push(`${rel} :: ${key}`)
    if (!en.has(key)) missingEn.push(`${rel} :: ${key}`)
  }
}

const problems = [
  ...missingZh.map((s) => `zh-CN 缺键  ${s}`),
  ...missingEn.map((s) => `en-US 缺键  ${s}`),
]

console.log(`目录键数: zh-CN ${zh.size} / en-US ${en.size}`)
console.log(`源码引用键位: ${seen.size}`)

/**
 * 允许清单：这些字符串看着像键，但不是文案键。
 * 每条都要写清为什么，避免用白名单掩盖真实缺键。
 */
const ALLOW = new Set([
  'common.name', // 示例：无
])
const real = problems.filter((p) => !ALLOW.has(p.split('::').pop().trim()) && !ALLOW.has(p))

if (real.length) {
  console.error(`\nP61 键覆盖：发现 ${real.length} 处引用了目录中不存在的键`)
  for (const p of real) console.error('  ' + p)
  process.exit(1)
}
console.log('\nP61 键覆盖：通过（源码引用的键在双语目录中均存在）')
