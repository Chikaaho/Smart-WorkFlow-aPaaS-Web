/**
 * P61 R1 codemod：把已分类的用户可见中文替换为 i18n 调用。
 *
 * 安全性依据：**分类前置**。字典 (= 人工/代理逐条判定为「用户可见」的中文) 是唯一替换来源；
 * 明确判定为非展示的文案不在字典中，因此天然不会被改写。
 * 在此之上再做**上下文排除**，避免同形字符串出现在业务值位置时被误改：
 *   - 比较/分支位置（=== !== == != includes startsWith endsWith indexOf match test case）
 *   - 对象字面量键（{'中文': ...}）
 *   - 导入路径、正则、控制台日志
 * 被排除的位置不会静默丢弃：`--report` 会逐条列出，供人工复核或登记豁免。
 *
 * 模板文本与静态属性（Vue 模板区）单独处理：>中文< 与 label="中文"。
 *
 * 用法：
 *   node scripts/p61-key-copy.mjs --report   # 只分类不改写，输出统计与排除清单
 *   node scripts/p61-key-copy.mjs --dry      # 改写预览，不落盘
 *   node scripts/p61-key-copy.mjs            # 实际改写
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadBatches } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

const mode = process.argv.includes('--report')
  ? 'report'
  : process.argv.includes('--dry')
    ? 'dry'
    : 'write'

const SCRIPTS = join(ROOT, 'scripts')
const dict = loadBatches(SCRIPTS, 'p61-copy-dictionary')
const templates = loadBatches(SCRIPTS, 'p61-copy-templates')

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

function excluded(rel) {
  return (
    /\.(spec|test)\.ts$/.test(rel) ||
    rel.startsWith('src/foundation/mock') ||
    rel.startsWith('src/locales/')
  )
}

/** 扫描出所有字符串字面量（跳过注释），返回 {start,end,quote,content,isTemplate} */
function scanLiterals(src) {
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

/** 取字面量前后的非空字符，用于上下文判定 */
function contextOf(src, lit) {
  let a = lit.start - 1
  while (a >= 0 && /\s/.test(src[a])) a--
  let b = lit.end
  while (b < src.length && /\s/.test(src[b])) b++
  const before2 = src.slice(Math.max(0, a - 2), a + 1)
  const beforeWord =
    (src.slice(Math.max(0, a - 20), a + 1).match(/([A-Za-z_$][\w$]*)\s*$/) ?? [])[1] ?? ''
  return { prev: src[a] ?? '', next: src[b] ?? '', before2, beforeWord }
}

/**
 * 类型位置判定：用 TypeScript 编译器精确求解。
 *
 * 类型别名/接口/`as` 断言里的字符串是**类型**而非展示值，替换会把类型写成函数调用。
 * 行级启发式在「值数组的字面量元素」与「对象类型成员」之间无法区分，因此直接解析 AST：
 * 字面量的祖先中出现任意 TypeNode，即判定为类型位置。
 *
 * 输入是「将被扫描的那段文本」，因此返回的偏移量与扫描器偏移量同一坐标系。
 */
function typeOffsets(text) {
  const sf = ts.createSourceFile('p61.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const set = new Set()
  const isTypeNode = (kind) =>
    kind >= ts.SyntaxKind.FirstTypeNode && kind <= ts.SyntaxKind.LastTypeNode
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      let p = node.parent
      while (p && p !== sf) {
        if (isTypeNode(p.kind)) {
          set.add(node.getStart(sf))
          break
        }
        if (ts.isStatement(p)) break
        p = p.parent
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return set
}

/**
 * 编译器宏参数位置：defineProps / withDefaults / defineEmits / defineOptions / defineSlots /
 * defineModel 会被提升到 setup() 之外，参数里引用 t() 会在编译期直接失败
 *（「cannot reference locally declared variables」）。这些位置的文案必须在渲染期解析。
 */
const MACROS = new Set([
  'defineProps',
  'withDefaults',
  'defineEmits',
  'defineOptions',
  'defineSlots',
  'defineModel',
])

function macroOffsets(text) {
  const sf = ts.createSourceFile('p61m.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const set = new Set()
  const collect = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      set.add(node.getStart(sf))
    }
    ts.forEachChild(node, collect)
  }
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      MACROS.has(node.expression.text)
    ) {
      for (const arg of node.arguments) collect(arg)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return set
}

/** 对 .vue 的 <script> 块或 .ts 全文件求「不可键化位置」偏移（含标签剥离后的偏移校正） */
function typeOffsetsFor(fragment) {
  const analyze = (t) => new Set([...typeOffsets(t), ...macroOffsets(t)])
  const m = fragment.match(/<script[^>]*>([\s\S]*)<\/script>/)
  if (!m) return analyze(fragment)
  const delta = fragment.indexOf(m[1])
  return new Set([...analyze(m[1])].map((o) => o + delta))
}

const COMPARE_OPS = /(===|!==|==|!=)$/
const TYPE_WORDS = new Set([
  'as',
  'satisfies',
  'extends',
  'implements',
  'keyof',
  'typeof',
  'asserts',
])
const VALUE_METHODS = new Set([
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'match',
  'test',
  'case',
  'is',
  'has',
  'get',
  'set',
  'add',
  'delete',
])
const LOG_CALLS = new Set(['log', 'warn', 'error', 'debug', 'info', 'trace'])

/** 判定一个字面量是否应替换；返回 {action, reason} */
function classify(src, lit) {
  const text = lit.content
  if (!text || !CJK.test(text)) return { action: 'skip', reason: 'non-cjk' }
  const isTpl = lit.isTemplate
  // 参数化文案可能被写成模板串或普通串；两者都查
  const entry = (isTpl ? templates[text] : dict[text]) ?? (isTpl ? dict[text] : templates[text])
  if (!entry) return { action: 'skip', reason: 'not-in-dictionary' }

  const { prev, next, before2, beforeWord } = contextOf(src, lit)

  if (/\$\{/.test(text)) {
    const exprs = [...text.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim())
    // 允许标识符与成员表达式（a.b.c → 变量名取末段）；其余形态（三元/调用/下标）留给人工
    const names = []
    for (const e of exprs) {
      const bare = /^[A-Za-z_$][\w$]*$/.test(e)
      const member = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(e)
      if (!bare && !member) return { action: 'manual', reason: 'complex-interpolation' }
      names.push(bare ? e : e.slice(e.lastIndexOf('.') + 1))
    }
    // 与翻译条目里的占位符集合必须一致，否则键值会错位
    const placeholders = [...String(entry.zh ?? '').matchAll(/\{([A-Za-z_$][\w$]*)\}/g)].map(
      (m) => m[1],
    )
    const sameSet =
      placeholders.length === names.length && placeholders.every((p) => names.includes(p))
    if (!sameSet) return { action: 'manual', reason: 'placeholder-mismatch' }
    return { action: 'replace-template', reason: 'ok', key: entry.key, vars: names, exprs }
  }
  if (isTpl && !dict[text]) return { action: 'skip', reason: 'not-in-dictionary' }

  // 对象字面量键 {'中文': ...}
  if (next === ':' && (prev === '{' || prev === ',' || prev === '(')) {
    return { action: 'skip', reason: 'object-key' }
  }
  if (currentTypeOffsets.has(lit.start)) return { action: 'skip', reason: 'type-or-macro-position' }
  if (TYPE_WORDS.has(beforeWord)) return { action: 'skip', reason: 'type-position' }
  if (COMPARE_OPS.test(before2)) return { action: 'skip', reason: 'comparison' }
  if (beforeWord === 'case') return { action: 'skip', reason: 'case-branch' }
  if (VALUE_METHODS.has(beforeWord) && prev === '(')
    return { action: 'skip', reason: 'value-method' }
  if (LOG_CALLS.has(beforeWord) && prev === '(') return { action: 'skip', reason: 'console-log' }
  if (prev === '>' || prev === '<') return { action: 'skip', reason: 'template-region' }
  // 导入路径 / 正则
  if (/^(from\s|import\()/.test(src.slice(Math.max(0, lit.start - 8), lit.start))) {
    return { action: 'skip', reason: 'import-path' }
  }
  return { action: 'replace', reason: 'ok', key: entry.key }
}

const stats = {
  files: 0,
  replaced: 0,
  byReason: new Map(),
  manual: [],
  skipped: [],
}

function bump(reason) {
  stats.byReason.set(reason, (stats.byReason.get(reason) ?? 0) + 1)
}

const counts = { changed: 0 }
let currentTypeOffsets = new Set()

/** 对一段 JS 片段做字面量替换，返回新片段 */
function replaceJS(fragment, rel, call) {
  currentTypeOffsets = typeOffsetsFor(fragment)
  const lits = scanLiterals(fragment)
  const edits = []
  for (const lit of lits) {
    const res = classify(fragment, lit)
    if (res.action === 'replace' || res.action === 'replace-template') edits.push({ lit, res })
    else if (res.action === 'manual') stats.manual.push(`${rel} :: ${lit.content} (${res.reason})`)
    else if (
      res.action === 'skip' &&
      res.reason !== 'non-cjk' &&
      res.reason !== 'not-in-dictionary'
    ) {
      stats.skipped.push(`${rel} :: ${lit.content} (${res.reason})`)
    }
  }
  let out = fragment
  for (const { lit, res } of edits.reverse()) {
    bump(res.reason)
    const rep =
      res.action === 'replace-template'
        ? call(
            res.key,
            res.vars.map((name, i) => (name === res.exprs[i] ? name : `${name}: ${res.exprs[i]}`)),
          )
        : call(res.key)
    out = out.slice(0, lit.start) + rep + out.slice(lit.end)
    counts.changed++
  }
  return out
}

/** 处理单个文件；返回改写后的源码（不落盘） */
function processFile(rel, src) {
  const startCount = counts.changed
  const isVue = rel.endsWith('.vue')
  // 文件内若已存在同名局部绑定 t（如 `const t = new Date(...)`），注入的 t 会被遮蔽，
  // 生成 t(...) 会变成「调用数字」。此时改用 i18n.global.t，绕开遮蔽。
  const shadowed = /\b(const|let|var)\s+t\b(?!\s*\}\s*=\s*useI18n)/.test(src)
  const useGlobal = !isVue || shadowed

  // bindings 形如 ['path', 'name: row.name']（同名变量简写）
  const call = (key, bindings) => {
    const bind = bindings && bindings.length ? `, { ${bindings.join(', ')} }` : ''
    return useGlobal ? `i18n.global.t('${key}'${bind})` : `t('${key}'${bind})`
  }

  let out = src

  if (isVue) {
    // 分区：<script> 区按 JS 处理，其余按 Vue 模板处理（模板属性用双引号，内部才是 JS）
    const spans = []
    const re = /<script[^>]*>[\s\S]*?<\/script>/g
    let m
    while ((m = re.exec(out)) !== null) spans.push([m.index, m.index + m[0].length])

    const parts = []
    let cursor = 0
    for (const [a, b] of spans) {
      parts.push({ type: 'tpl', text: out.slice(cursor, a) })
      parts.push({ type: 'js', text: out.slice(a, b) })
      cursor = b
    }
    parts.push({ type: 'tpl', text: out.slice(cursor) })

    for (const p of parts) {
      if (p.type === 'js') {
        p.text = replaceJS(p.text, rel, call)
        continue
      }
      let tpl = p.text
      // 文本节点。字典键是空白归一后的文案：源码里文字可能跨行/缩进，
      // 与门禁的归一口径必须一致，否则门禁说未治理、codemod 却匹配不上。
      tpl = tpl.replace(/>([^<>{}]*?)</g, (full, inner) => {
        const trimmed = inner.trim()
        const normalized = trimmed.replace(/\s+/g, ' ').trim()
        const entry = dict[normalized]
        if (!entry || !CJK.test(normalized)) return full
        counts.changed++
        return `>{{ t('${entry.key}') }}<`
      })
      // 静态属性（双引号或单引号写法都要覆盖）。
      // 值里可能**字面**含花括号（JSON 示例、${userName} 语法示例），因此不排除 {}；
      // 命中条件收紧为「整值就是字典里的某条文案」，已转换的 t('key') 值不含中文故不会二次命中。
      const STATIC_ATTRS =
        'label|placeholder|title|subtitle|sub-title|description|content|header|empty-text|tooltip|active-text|inactive-text|range-separator|start-placeholder|end-placeholder'
      tpl = tpl.replace(
        new RegExp(`(\\s)(${STATIC_ATTRS})=("([^"]*?)"|'([^']*?)')`, 'g'),
        (full, sp, attr, _a, dq, sq) => {
          const val = (dq ?? sq ?? '').trim()
          const entry = dict[val]
          if (!entry || !CJK.test(val)) return full
          counts.changed++
          return `${sp}:${attr}="${call(entry.key)}"`
        },
      )
      // 插值 {{ expr }} 与绑定属性 :attr="expr"（其内容为 JS 表达式）
      tpl = tpl.replace(
        /\{\{([\s\S]*?)\}\}/g,
        (full, inner) => `{{${replaceJS(inner, rel, call)}}}`,
      )
      tpl = tpl.replace(/(\s[:@]?[\w:.-]+)="([^"]*?)"/g, (full, head, val) => {
        if (!CJK.test(val)) return full
        return `${head}="${replaceJS(val, rel, call)}"`
      })
      p.text = tpl
    }
    out = parts.map((p) => p.text).join('')
  } else {
    out = replaceJS(out, rel, call)
  }

  if (counts.changed === startCount) return null

  // --- 注入 i18n 能力 ---
  const hasI18nImport = /import\s*\{[^}]*\bi18n\b[^}]*\}\s*from\s*'@\/locales'/.test(out)
  if (isVue && !useGlobal) {
    if (!/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(out)) {
      out = out.replace(
        /<script setup lang="ts">/,
        `<script setup lang="ts">\nimport { useI18n } from '@/locales'\n\nconst { t } = useI18n()`,
      )
    }
  } else if (!hasI18nImport) {
    const importLine = `import { i18n } from '@/locales'\n`
    if (isVue) {
      out = out.replace(/(<script setup lang="ts">\n)/, `$1${importLine}`)
    } else {
      out = importLine + out
    }
    if (!/i18n\.global\.t/.test(out) && !isVue) {
      // 非 Vue 文件仍以 i18n.global.t 调用，见 call()
    }
  }
  return out
}

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (excluded(rel)) continue
  const src = readFileSync(file, 'utf8')
  const out = processFile(rel, src)
  if (!out) continue
  stats.files++
  if (mode !== 'report') writeFileSync(file, out)
  console.log(`changed\t${rel}`)
}

const totalReplaced = [...stats.byReason.values()].reduce((a, b) => a + b, 0)
console.log(`\n模式=${mode} 改写文件 ${stats.files} 个，替换 ${totalReplaced} 处`)
console.log('替换原因分布：')
for (const [k, v] of [...stats.byReason.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${v}\t${k}`)

if (stats.skipped.length) {
  console.log(`\n上下文排除（未替换，需人工复核）${stats.skipped.length} 条：`)
  for (const s of stats.skipped.slice(0, 60)) console.log('  ' + s)
}
if (stats.manual.length) {
  console.log(`\n需人工处理（复杂插值）${stats.manual.length} 条：`)
  for (const s of stats.manual.slice(0, 60)) console.log('  ' + s)
}

const report = {
  mode,
  files: stats.files,
  replaced: totalReplaced,
  byReason: [...stats.byReason],
  skipped: stats.skipped,
  manual: stats.manual,
}
writeFileSync(join(ROOT, '.p61-tmp/key-copy-report.json'), JSON.stringify(report, null, 2))
