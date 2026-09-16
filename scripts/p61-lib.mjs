/**
 * P61 R1 共享工具：源码字面量扫描与注释剥离。
 *
 * 盘点与 codemod 必须用同一套扫描规则，否则会出现「门禁说未治理、codemod 说已处理」的漂移。
 * 关键点：注释里的中文（尤其被引号包住的示例）不是生产可达文案，不参与治理。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 按批次号数值排序返回字典/模板文件名，基表（无批次号）永远最先加载。
 * 纯字典序会把 batch10/11 排到 batch2 之前，导致新条目被旧条目覆盖——
 * 这类覆盖是静默的，必须在加载次序上消除。
 */
export function batchFiles(dir, prefix) {
  const base = `${prefix}.json`
  const numbered = readdirSync(dir)
    .filter((n) => new RegExp(`^${prefix}-batch(\\d+)\\.json$`).test(n))
    .sort((a, b) => Number(a.match(/-batch(\d+)\./)[1]) - Number(b.match(/-batch(\d+)\./)[1]))
  const out = []
  if (readdirSync(dir).includes(base)) out.push(base)
  return out.concat(numbered)
}

/** 合并同名前缀的全部批次（后者覆盖前者，次序由 batchFiles 保证） */
export function loadBatches(dir, prefix) {
  const merged = {}
  for (const n of batchFiles(dir, prefix)) {
    Object.assign(merged, JSON.parse(readFileSync(join(dir, n), 'utf8')))
  }
  return merged
}

/** 列出跨批次同字面量不同键的覆盖（用于审计，不阻断构建） */
export function batchOverrides(dir, prefix) {
  const seen = new Map()
  const out = []
  for (const n of batchFiles(dir, prefix)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(dir, n), 'utf8')))) {
      if (k.startsWith('_')) continue
      if (seen.has(k) && seen.get(k).key !== v.key) {
        out.push({ literal: k, from: seen.get(k).key, to: v.key })
      }
      seen.set(k, v)
    }
  }
  return out
}

export const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

export function walkDir(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n)
    const s = statSync(f)
    if (s.isDirectory()) walkDir(f, out)
    else if (/\.(ts|vue)$/.test(n)) out.push(f)
  }
  return out
}

/**
 * 把注释内容替换为等长空格（保留换行），使行号与列偏移不变。
 * 支持 // 行注释、块注释、Vue 模板 <!-- -->。
 */
export function stripComments(src) {
  const out = src.split('')
  const n = src.length
  let i = 0
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
    }
  }
  while (i < n) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++
      while (i < n) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === quote) {
          i++
          break
        }
        if (quote !== '`' && src[i] === '\n') break
        i++
      }
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      const start = i
      while (i < n && src[i] !== '\n') i++
      blank(start, i)
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = i
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      blank(start, i)
      continue
    }
    if (c === '<' && src.startsWith('<!--', i)) {
      const start = i
      const end = src.indexOf('-->', i)
      i = end === -1 ? n : end + 3
      blank(start, i)
      continue
    }
    i++
  }
  return out.join('')
}

/** 扫描字符串字面量（跳过注释）；返回 {start,end,quote,content,isTemplate} */
export function scanLiterals(src) {
  const out = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      const start = i
      i++
      while (i < n) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === quote) break
        if (quote !== '`' && src[i] === '\n') break
        i++
      }
      const end = i + 1
      out.push({ start, end, quote, content: src.slice(start + 1, i), isTemplate: quote === '`' })
      i = end
      continue
    }
    i++
  }
  return out
}

/**
 * 花括号转义：vue-i18n 会把任何 `{...}` 当占位符解析，字面花括号必须转义成 `{'{'}` / `{'}'}`，
 * 否则轻则被吞掉（`${userName}` → `$`），重则直接编译失败
 * （`{{input}}` → 「Not allowed nest placeholder」；`{"userName": "张三"}` → 「Invalid token in placeholder」）。
 *
 * 只有 `allowed` 里显式声明的具名占位符保持原样：
 *   - 术语字典条目是**字面文案** → allowed 为空，全体转义；
 *   - 参数化文案条目按 vars 声明 → 只有声明的 {name} 保留为插值。
 * 并要求占位符两侧不同时紧邻花括号，避免把 `{{input}}` 拆出一个 `{input}`。
 */
export function escapeBraces(value, allowed = []) {
  const allow = new Set(allowed)
  let out = ''
  let i = 0
  while (i < value.length) {
    const c = value[i]
    if (c === '{') {
      const close = value.indexOf('}', i)
      if (close !== -1) {
        const inner = value.slice(i + 1, close)
        const isolated = value[i - 1] !== '{' && value[close + 1] !== '}'
        if (isolated && allow.has(inner) && /^[A-Za-z_$][\w$]*$/.test(inner)) {
          out += `{${inner}}`
          i = close + 1
          continue
        }
      }
      out += "{'{'}"
      i++
      continue
    }
    if (c === '}') {
      out += "{'}'}"
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/** 反向：把转义结果还原为字面文案（校验与比对用） */
export function unescapeLiteralBraces(value) {
  return value.replace(/\{'\{'\}/g, '{').replace(/\{'}'\}/g, '}')
}

function setPath(tree, key, value) {
  const parts = key.split('.')
  let node = tree
  for (const part of parts.slice(0, -1)) {
    node[part] = node[part] ?? {}
    node = node[part]
  }
  const leaf = parts[parts.length - 1]
  if (node[leaf] !== undefined && node[leaf] !== value) {
    throw new Error(`键冲突：${key} 已存在且值不同`)
  }
  node[leaf] = value
}

/** R2a 同文异译收敛映射：被收敛键 → 权威键 */
export function loadConvergence(scriptsDir) {
  const raw = JSON.parse(readFileSync(join(scriptsDir, 'p61-key-convergence.json'), 'utf8'))
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))
}

function deletePath(tree, key) {
  const parts = key.split('.')
  const stack = []
  let node = tree
  for (const part of parts.slice(0, -1)) {
    if (node?.[part] === undefined) return
    stack.push([node, part])
    node = node[part]
  }
  delete node[parts[parts.length - 1]]
  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, part] = stack[i]
    if (Object.keys(parent[part]).length === 0) delete parent[part]
  }
}

/**
 * 由单源构建某个语言的目录树（与 gen-locales 完全同一套规则）。
 * 审计、校验与生成共用它，避免「生成的东西」和「检查的东西」不是同一份。
 *
 * 构建末期应用 R2a 收敛：被收敛键从目录剔除，权威键必须真实存在，
 * 否则页面会回落到键名本身。
 */
export function buildLocaleTree(scriptsDir, locale) {
  const manual = JSON.parse(readFileSync(join(scriptsDir, 'p61-locales-manual.json'), 'utf8'))
  const dictionary = loadBatches(scriptsDir, 'p61-copy-dictionary')
  const templates = loadBatches(scriptsDir, 'p61-copy-templates')

  const tree = JSON.parse(JSON.stringify(manual[locale]))
  for (const [zh, entry] of Object.entries(dictionary)) {
    if (zh.startsWith('_') || entry.alias) continue
    setPath(tree, entry.key, escapeBraces(locale === 'zh-CN' ? zh : entry.en))
  }
  for (const [raw, entry] of Object.entries(templates)) {
    if (raw.startsWith('_') || entry.alias) continue
    setPath(
      tree,
      entry.key,
      escapeBraces(locale === 'zh-CN' ? entry.zh : entry.en, entry.vars ?? []),
    )
  }

  const convergence = loadConvergence(scriptsDir)
  const missing = []
  for (const [loser, winner] of Object.entries(convergence)) {
    const winnerValue = winner.split('.').reduce((node, part) => node?.[part], tree)
    if (typeof winnerValue !== 'string') missing.push(`${loser} → ${winner}（权威键不存在）`)
  }
  if (missing.length) {
    throw new Error(`R2a 收敛映射指向不存在的权威键：\n  ${missing.join('\n  ')}`)
  }
  for (const loser of Object.keys(convergence)) deletePath(tree, loser)

  return tree
}

/** 拍平目录树为 [key, value] 列表 */
export function flattenTree(tree, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenTree(v, path))
    else out.push([path, v])
  }
  return out
}

/**
 * 含插值的模板文本节点（如 `>共 {{ total }} 条记录<`）。
 * 行扫描与跨行扫描都排除花括号，这类节点会被整体漏掉——必须单独识别。
 * 返回节点原文（含插值）与起始偏移；已键化的形式含 `t(`，由调用方按需排除。
 */
export function interpolatedTextNodes(src) {
  const out = []
  for (const m of src.matchAll(/>\s*([^<>]*?[\u4e00-\u9fff][^<>]*?)\s*</g)) {
    if (!m[1].includes('{{')) continue
    out.push({ text: m[1].replace(/\s+/g, ' ').trim(), index: m.index, inner: m[1] })
  }
  return out
}

/** Vue 模板纯文本节点匹配（>中文<）。调用方应先 stripComments。 */
export function templateTextNodes(src) {
  return [...src.matchAll(/>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)</g)].map((m) => ({
    text: m[1].trim(),
    index: m.index,
  }))
}

/**
 * 跨行文本节点：按钮文字换行书写（`>\n  中文\n</el-button>`）时，按行扫描永远看不见。
 * 这里对整份源码匹配「> 到 < 之间夹中文、允许换行、不含插值」的片段，
 * 返回规范化文本与起始偏移。调用方应先 stripComments。
 */
export function multilineTextNodes(src) {
  return [...src.matchAll(/>\s*([^<>{}]*[\u4e00-\u9fff][^<>{}]*?)\s*</gs)]
    .filter((m) => !m[1].includes('{') && CJK.test(m[1]))
    .map((m) => ({
      text: m[1].replace(/\s+/g, ' ').trim(),
      index: m.index,
    }))
}
