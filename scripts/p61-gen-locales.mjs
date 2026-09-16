/**
 * P61：从单源生成 zh-CN.ts / en-US.ts。
 *
 * 单源 = scripts/p61-locales-manual.json（手工段）
 *      + scripts/p61-copy-dictionary*.json（术语字典：整串文案）
 *      + scripts/p61-copy-templates*.json（参数化文案：zh/en 用 {占位符} 表示变量）
 * 两个 locale 文件由同一份源生成，**结构必然一致**，从机制上消除缺键与键集漂移（R1 完成条件）。
 *
 * 注意：参数化文案必须一并写入目录。只把它们交给 codemod 做替换而漏进目录，会让
 * 所有带占位符的键在运行期回落成键名本身（渲染出 agent.varNamePlaceholder 这类文本）。
 *
 * 用法：node scripts/p61-gen-locales.mjs            # 生成
 *      node scripts/p61-gen-locales.mjs --check    # 只校验已生成文件与源一致（不一致非零退出）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocaleTree, loadBatches } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCRIPTS = join(ROOT, 'scripts')
const dictionary = loadBatches(SCRIPTS, 'p61-copy-dictionary')
const templates = loadBatches(SCRIPTS, 'p61-copy-templates')

/** 生成入口：与审计/校验共用 p61-lib 的同一套建树规则（含 R2a 收敛剔除） */
function build(locale) {
  for (const [zh, entry] of Object.entries(dictionary)) {
    if (zh.startsWith('_')) continue
    const value = locale === 'zh-CN' ? zh : entry.en
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`字典项 ${zh} 缺少 ${locale} 文案`)
    }
  }
  for (const [raw, entry] of Object.entries(templates)) {
    if (raw.startsWith('_')) continue
    const value = locale === 'zh-CN' ? entry.zh : entry.en
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`参数化文案 ${raw} 缺少 ${locale} 文案`)
    }
  }
  return buildLocaleTree(SCRIPTS, locale)
}

/** 按仓库 prettier 风格渲染对象（单引号、无引号标识符键、2 空格缩进、printWidth 100 折行） */
const PRINT_WIDTH = 100

function render(value, indent = 2) {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (value === null || typeof value !== 'object') return String(value)
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'
  const lines = entries.map(([k, v]) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `'${k}'`
    const rendered = render(v, indent + 2)
    const single = `${inner}${key}: ${rendered},`
    // 与 prettier 一致：单行超宽时把值折到下一行
    if (!single.includes('\n') && single.length > PRINT_WIDTH) {
      return `${inner}${key}:\n${inner}  ${rendered},`
    }
    return single
  })
  return `{\n${lines.join('\n')}\n${pad}}`
}

function toTs(tree, locale) {
  const sorted = {}
  for (const section of Object.keys(tree).sort()) {
    sorted[section] = tree[section]
  }
  const header = `/**
 * ${locale} 文案源（P61 R1）。
 *
 * 本文件由 \`scripts/p61-gen-locales.mjs\` 从单源生成，请勿手工编辑：
 * 源为 scripts/p61-locales-manual.json 与 scripts/p61-copy-dictionary*.json。
 * 生成保证 zh-CN 与 en-US 结构一致，不存在缺键或键集漂移。
 */
`
  return `${header}export default ${render(sorted, 0)}\n`
}

const outputs = {
  'src/locales/zh-CN.ts': toTs(build('zh-CN'), 'zh-CN'),
  'src/locales/en-US.ts': toTs(build('en-US'), 'en-US'),
}

const check = process.argv.includes('--check')
let drift = 0
for (const [rel, content] of Object.entries(outputs)) {
  const file = join(ROOT, rel)
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (current === content) {
    console.log(`一致	${rel}`)
  } else {
    drift++
    if (check) {
      console.error(`不一致	${rel}`)
    } else {
      writeFileSync(file, content)
      console.log(`已生成	${rel}`)
    }
  }
}

if (check && drift > 0) {
  console.error(
    `\nP61 locale 单源校验失败：${drift} 个文件与源不一致，请运行 node scripts/p61-gen-locales.mjs`,
  )
  process.exit(1)
}
const zhKeys = Object.keys(dictionary).filter((k) => !k.startsWith('_')).length
console.log(
  `\n字典条目: ${zhKeys}；locale 文件与单源${drift === 0 ? '一致' : check ? '不一致' : '已重新生成'}`,
)
