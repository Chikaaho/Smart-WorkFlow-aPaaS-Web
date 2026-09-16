/**
 * P61 R2b：给「请求失败无用户反馈」的 catch 注入反馈。
 *
 * 请求层只抛 ApiError、不做全局提示，所以页面 catch 里不说话用户就什么都看不到。
 * 本脚本按 failure-state-audit 的 JSON 结果逐处注入统一反馈文案；
 * 需要人工判断的场景不在此列（用 p61-failure-allowlist.json 登记理由）。
 *
 * 用法：node scripts/p61-feedback-codemod.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dry = process.argv.includes('--dry')

const audit = JSON.parse(
  execFileSync('node', [join(ROOT, 'scripts/p61-failure-state-audit.mjs'), '--json'], {
    encoding: 'utf8',
  }),
)

const FEEDBACK = "ElMessage.error(t('common.loadFailed'))"

/** 需要人工判断、不注入的位置（须在 allowlist 里说明理由） */
const SKIP = new Set([
  'src/modules/form/views/FormRender.vue', // 轮询重试循环，中途报错会打断既定的重试语义
  'src/modules/workflow/views/MobileWorkspace.vue', // 逐字段引用回显，逐条 toast 是噪音
  'src/modules/workflow/views/TaskDetail.vue', // 同上
  'src/modules/form/views/FormData.vue', // 可选的持久化列配置，非主数据
])

const byFile = new Map()
for (const s of audit.silentCatches) {
  if (SKIP.has(s.file)) continue
  if (!byFile.has(s.file)) byFile.set(s.file, [])
  byFile.get(s.file).push(s)
}

let files = 0
let sites = 0
for (const [rel, items] of byFile) {
  const file = join(ROOT, rel)
  let src = readFileSync(file, 'utf8')
  const original = src
  let hit = 0

  for (const item of items) {
    // 定位该行所在的 catch 块开括号
    const lines = src.split('\n')
    const idx = item.line - 1
    if (idx < 0 || idx >= lines.length) continue
    let braceLine = -1
    for (let i = idx; i < Math.min(lines.length, idx + 6); i++) {
      if (/\bcatch\b[^{]*\{/.test(lines[i])) {
        braceLine = i
        break
      }
    }
    if (braceLine === -1) continue
    if (lines[braceLine].includes(FEEDBACK)) continue
    lines[braceLine] = lines[braceLine].replace(
      /(\{)\s*$/,
      `$1\n      ${FEEDBACK}\n      // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到`,
    )
    src = lines.join('\n')
    hit++
  }

  if (hit === 0) continue

  // 确保导入：ElMessage
  if (!/import\s*\{[^}]*\bElMessage\b[^}]*\}\s*from\s*'element-plus'/.test(src)) {
    if (/import\s*\{([^}]*)\}\s*from\s*'element-plus'/.test(src)) {
      src = src.replace(
        /import\s*\{([^}]*)\}\s*from\s*'element-plus'/,
        (m, names) => `import { ElMessage,${names.trim()} } from 'element-plus'`,
      )
    } else {
      src = src.replace(
        /(<script setup lang="ts">\n)/,
        "$1import { ElMessage } from 'element-plus'\n",
      )
    }
  }
  // 确保导入：t（script setup 组件）或 i18n（.ts）
  if (rel.endsWith('.vue')) {
    if (!/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/.test(src)) {
      if (!/import\s*\{[^}]*useI18n[^}]*\}\s*from\s*'@\/locales'/.test(src)) {
        src = src.replace(/(<script setup lang="ts">\n)/, "$1import { useI18n } from '@/locales'\n")
      }
      src = src.replace(
        /(import\s*\{[^}]*useI18n[^}]*\}\s*from\s*'@\/locales'\n)/,
        '$1\nconst { t } = useI18n()\n',
      )
    }
  } else if (!/import\s*\{[^}]*\bi18n\b[^}]*\}\s*from\s*'@\/locales'/.test(src)) {
    src = `import { i18n } from '@/locales'\n${src}`
  }

  if (src !== original) {
    if (!dry) writeFileSync(file, src)
    files++
    sites += hit
    console.log(`${hit}\t${rel}`)
  }
}

console.log(`\n注入反馈：${files} 个文件，${sites} 处（${dry ? 'dry-run' : '已写入'}）`)
