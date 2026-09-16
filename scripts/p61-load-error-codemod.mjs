/**
 * P61 R2b：给「load() 只有 try/finally、没有 catch」的列表页补上失败态。
 *
 * 缺陷形态：请求抛错后错误成为未处理拒绝，列表保持为空，页面显示「暂无数据」——
 * 用户看到的是「没有数据」而不是「加载失败」，且没有任何恢复入口。
 *
 * 统一补丁（8 个 IoT 列表页形态一致）：
 *   1. 新增 loadError 状态
 *   2. load() 增加 catch，把错误转为可读文案
 *   3. isEmpty 增加「本次加载成功」维度，失败时不再冒充空态
 *   4. 表格上方渲染错误提示（可关闭 + 提供重试）
 *
 * 用法：node scripts/p61-load-error-codemod.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dry = process.argv.includes('--dry')

const PAGES = [
  'src/modules/iot/views/IotConnectionList.vue',
  'src/modules/iot/views/IotDeviceList.vue',
  'src/modules/iot/views/IotFlowActions.vue',
  'src/modules/iot/views/IotProductList.vue',
  'src/modules/iot/views/IotRuleList.vue',
  'src/modules/iot/views/IotRuntimeLogs.vue',
  'src/modules/iot/views/IotScriptList.vue',
  'src/modules/iot/views/IotTopicList.vue',
]

const ALERT = `    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-error"
    >
      <template #default>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

`

let changed = 0
for (const rel of PAGES) {
  const file = join(ROOT, rel)
  const before = readFileSync(file, 'utf8')
  let src = before

  // 1) loadError 状态
  if (!/const loadError = ref/.test(src)) {
    src = src.replace(
      /(const loading = ref\(false\)\n)/,
      "$1/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */\nconst loadError = ref('')\n",
    )
  }

  // 2) load() 增加 catch
  const loadRe = /(async function load\(\) \{\n {2}loading\.value = true\n)( {2}try \{)/u
  if (loadRe.test(src)) {
    src = src.replace(loadRe, "$1  loadError.value = ''\n$2")
    src = src.replace(
      /(\n {2}\} finally \{\n {4}loading\.value = false\n {2}\}\n\})/u,
      "\n  } catch (err) {\n    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')\n  } finally {\n    loading.value = false\n  }\n}",
    )
  }

  // 3) isEmpty 增加成功维度
  src = src.replace(
    /const isEmpty = computed\(\s*\(\) => !loading\.value && ([^)]+)\.length === 0,?\s*\)/,
    (m, listExpr) =>
      `const isEmpty = computed(() => !loading.value && !loadError.value && ${listExpr}.length === 0)`,
  )

  // 4) 表格上方错误提示
  if (!src.includes('v-if="loadError"')) {
    src = src.replace(/(\s*<el-table)/, (m, tail) => `\n${ALERT}${tail.trimStart()}`)
  }

  // 5) ApiError 导入（判定导入语句存在，而不是判定标识符是否被使用——
  //    插入 catch 之后源码里一定有 ApiError，用使用情况判定会漏掉导入）
  const hasApiErrorImport =
    /import\s*\{[^}]*\bApiError\b[^}]*\}\s*from\s*'@\/foundation\/request'/.test(src)
  if (!hasApiErrorImport) {
    if (/import \{ request \} from '@\/foundation\/request'/.test(src)) {
      src = src.replace(
        /import \{ request \} from '@\/foundation\/request'/,
        "import { ApiError, request } from '@/foundation/request'",
      )
    } else if (/from '@\/foundation\/request'/.test(src)) {
      src = src.replace(
        /import \{([^}]*)\} from '@\/foundation\/request'/,
        (m, names) => `import { ApiError,${names.trimEnd()} } from '@/foundation/request'`,
      )
    } else {
      src = src.replace(
        /(import \{ ElMessage[^\n]*from 'element-plus'\n)/,
        "$1import { ApiError } from '@/foundation/request'\n",
      )
    }
  }

  if (src !== before) {
    if (!dry) writeFileSync(file, src)
    changed++
    console.log(`${rel}`)
  } else {
    console.log(`${rel}  —— 未变化（形态不符，需人工核对）`)
  }
}

console.log(`\n补失败态：${changed}/${PAGES.length} 个页面（${dry ? 'dry-run' : '已写入'}）`)
