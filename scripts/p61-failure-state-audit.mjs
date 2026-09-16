/**
 * P61 R2b：失败态与空态审计。
 *
 * 三条可复核判定（用源码结构判定，不靠人工声明）：
 *   1. 静默吞错：**含 await 的 try**（真实请求）其 catch 块既无用户反馈也不再抛出
 *      —— 同步解析里的 `try { JSON.parse } catch { return fallback }` 属有意兜底，不计入
 *   2. 失败伪装空态：页面同时有空态与列表，但空态条件只看数据长度、不看请求结果
 *   3. 猜测单一成因：catch 里非 ApiError 分支给出**具体业务原因**（而非通用失败）
 *
 * 用法：node scripts/p61-failure-state-audit.mjs [--json]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/**
 * 已复核豁免：键为「文件 :: catch 体首段」。逐条必须写清依据；
 * 没有登记的静默吞错一律视为缺陷。豁免不是免检——依据要经得起复核。
 */
const ALLOWLIST = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(ROOT, 'scripts/p61-failure-allowlist.json'), 'utf8')),
  ).filter((k) => !k.startsWith('_')),
)
const allowKey = (rel, catchBody) => `${rel} :: ${catchBody.trim().slice(0, 60)}`

function excluded(rel) {
  return (
    /\.(spec|test)\.ts$/.test(rel) ||
    rel.startsWith('src/foundation/mock') ||
    rel.startsWith('src/locales/')
  )
}

/**
 * 用户可见反馈：消息调用、error 命名的状态赋值、错误字段、显式失败相位、重抛。
 * 「失败必须让用户看见」的判定标准就是这几类落点之一。
 */
const FEEDBACK =
  /\b(ElMessage(Box)?\.|throw\b|reject(ed)?\.value|[\w$]*[Ee]rror[\w$]*\s*(?:\.value)?\s*=[^=]|errorMessage\s*:|failReason\s*:|failMessage\s*:|\s*=\s*'error'|\s*=\s*"error")/

/** 用户取消确认框不是失败：try 体以 ElMessageBox 为主且 catch 直接返回 */
function isUserCancel(tryBody, catchBody) {
  return (
    /ElMessageBox\./.test(tryBody) &&
    /^\s*(return\b|confirmed\s*=\s*false|.*取消|.*cancel)/.test(catchBody.trim())
  )
}

/** 通用失败文案的键名特征（这些不算「猜测具体成因」） */
const GENERIC_KEY = /(failed|failure|error|network|system|unknown|fallback|fault)/i

/** 匹配 try { ... } catch (x) { ... }，要求 try 体内出现 await */
function findRequestCatches(src, rel) {
  const out = []
  const re = /\btry\s*\{/g
  let m
  while ((m = re.exec(src)) !== null) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const tryBody = src.slice(m.index + m[0].length, i)
    if (!/\bawait\b/.test(tryBody)) continue
    const after = src.slice(i + 1)
    const cm = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(after)
    if (!cm) continue
    const cStart = i + 1 + cm[0].length - 1
    depth = 0
    let j = cStart
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push({
      tryStart: m.index,
      line: src.slice(0, m.index).split('\n').length,
      tryBody,
      catchBody: src.slice(cStart + 1, j),
      allowKey: allowKey(rel, src.slice(cStart + 1, j)),
    })
  }
  return out
}

const silentCatches = []
const guessedCauses = []
const emptyStateRisks = []

for (const file of walkDir(SRC)) {
  const rel = file
    .slice(ROOT.length + 1)
    .split('\\')
    .join('/')
  if (excluded(rel) || !rel.endsWith('.vue')) continue
  const src = stripComments(readFileSync(file, 'utf8'))

  for (const c of findRequestCatches(src, rel)) {
    const body = c.catchBody.trim()
    if (isUserCancel(c.tryBody, c.catchBody)) continue
    if (ALLOWLIST.has(c.allowKey)) continue
    if (body === '') {
      silentCatches.push({ file: rel, line: c.line, kind: '空 catch（请求失败无任何反馈）' })
      continue
    }
    if (!FEEDBACK.test(c.catchBody)) {
      silentCatches.push({
        file: rel,
        line: c.line,
        kind: '请求失败无用户反馈且未重抛',
        body: body.slice(0, 100).replace(/\s+/g, ' '),
      })
    }
    // 猜测单一成因：catch 里非 ApiError 分支给了具体业务原因的键
    for (const g of c.catchBody.matchAll(
      /instanceof\s+ApiError\s*\?\s*[^:]+:\s*(?:t\()?'([\w.$]+)'/g,
    )) {
      const key = g[1]
      if (!GENERIC_KEY.test(key)) {
        guessedCauses.push({ file: rel, line: c.line, fallbackKey: key })
      }
    }
  }

  // 失败伪装空态
  if (!/<el-empty|ListEmpty|<EmptyState/.test(src) || !/<el-table/.test(src)) continue

  // 页面是否具备错误分支（把失败显式呈现出来的那一支）
  const hasErrorBranch =
    /v-(?:if|else-if)="[^"]*(?:loadError|errorMsg|\berror\b|errMsg)/i.test(src) ||
    /:title="(?:loadError|errorMsg|error)"/.test(src)

  const emptyIdx = src.search(/<el-empty/i)
  const emptyTag = /<el-empty[^>]*>/i.exec(src)?.[0] ?? ''
  // v-else / v-else-if 链上的空态，其「失败不显示空态」由前置错误分支保证。
  // 裸属性 v-else 没有等号；空态还可能被包在 <template v-else> 里（自身无 v-else）。
  const selfChained = /v-else(?:\s|-if)/.test(emptyTag)
  const before = src.slice(0, emptyIdx)
  const lastOpen = before.lastIndexOf('<template v-else')
  const lastClose = before.lastIndexOf('</template>')
  const chained = selfChained || (lastOpen !== -1 && lastOpen > lastClose)
  const condMatch =
    /<el-empty[^>]*v-if="([^"]+)"/.exec(src) ??
    /v-if="([^"]*(?:empty|isEmpty|noData|no-data)[^"]*)"/i.exec(src)
  const cond = condMatch?.[1] ?? ''
  if (!cond) {
    if (hasErrorBranch && chained) continue
    emptyStateRisks.push({
      file: rel,
      line: 0,
      kind: hasErrorBranch
        ? '存在错误分支，但空态既不在 v-else 链上、也没有自身条件'
        : '同时存在空态与列表且没有错误分支（失败时会直接显示空态）',
    })
    continue
  }
  if (chained) continue
  // 条件常常是一个 computed 标识符（isEmpty），必须解析它的定义才算真的判定
  const ident = /^([A-Za-z_$][\w$]*)$/.exec(cond.trim())?.[1]
  const computedDef = ident
    ? (new RegExp(`const\\s+${ident}\\s*=\\s*computed\\(([\\s\\S]*?)\\)\\s*\\n`).exec(src)?.[1] ??
      '')
    : ''
  const haystack = `${cond}\n${computedDef}`
  if (!/error|err\b|err\s*\.|fail|loaded|loadOk|settled|success/i.test(haystack)) {
    emptyStateRisks.push({
      file: rel,
      line: src.slice(0, condMatch.index).split('\n').length,
      kind: `空态条件未含请求结果维度: ${cond}`,
    })
  }
}

const report = {
  silentCatchCount: silentCatches.length,
  guessedCauseCount: guessedCauses.length,
  emptyStateRiskCount: emptyStateRisks.length,
  silentCatches,
  guessedCauses,
  emptyStateRisks,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`【1】请求静默吞错：${silentCatches.length} 处`)
  for (const s of silentCatches)
    console.log(`  ${s.file}:${s.line}  ${s.kind}${s.body ? `  ${s.body}` : ''}`)
  console.log(`\n【2】catch 内猜测单一成因：${guessedCauses.length} 处`)
  for (const g of guessedCauses) console.log(`  ${g.file}:${g.line}  fallbackKey=${g.fallbackKey}`)
  console.log(`\n【3】失败伪装空态风险：${emptyStateRisks.length} 处`)
  for (const e of emptyStateRisks) console.log(`  ${e.file}:${e.line}  ${e.kind}`)

  // 门禁：三类都必须为 0。确属合理降级的位置登记进 p61-failure-allowlist.json 并写明依据，
  // 豁免不是免检——依据要经得起复核。
  const failures = [
    ['请求静默吞错', silentCatches.length],
    ['catch 内猜测单一成因', guessedCauses.length],
    ['失败伪装空态', emptyStateRisks.length],
  ].filter(([, n]) => n > 0)
  if (failures.length) {
    console.error(`\nP61 失败态审计未通过：${failures.map(([k, n]) => `${k} ${n} 处`).join('；')}`)
    process.exit(1)
  }
  console.log('\nP61 失败态审计：通过（失败必反馈、不猜成因、失败不冒充空态）')
}
