<script setup lang="ts">
/**
 * ScriptDialog — BF20261013-022② 统一脚本编辑弹窗。
 *
 * 左侧按分类展示可用函数：点击函数行把用法片段插入右侧脚本输入框；
 * 函数行尾的问号悬停显示该函数的作用与用法。右侧为脚本编辑区（支持 #函数名 语法糖）。
 * 由调用方传入函数目录（流程脚本 / 表单脚本）与当前脚本，确定后回传编辑结果。
 */
import { computed, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import JsCodeEditor from './JsCodeEditor.vue'
import { parseScript, runScript } from '@/modules/form/utils/script-interpreter'
import { transpileScriptSugar } from '@/modules/form/utils/script-sugar'
import type { ScriptFunctionDoc } from './script-catalog'

interface SimResult {
  ok: boolean
  value?: unknown
  log: string[]
  error?: string
}

const props = defineProps<{
  title: string
  functions: ScriptFunctionDoc[]
  /** 打开时的初始脚本。 */
  code: string
  /** 输入框占位（可选）。 */
  placeholder?: string
  /**
   * 服务端模拟运行（流程表达式）。提供时优先使用：与运行期同一脚本引擎（GraalJS + # 函数语法糖），
   * 避免本地解释器与运行期语义漂移；表单脚本仍走本地解释器（表单表达式是异步插件入口，语义不同）。
   */
  simulate?: (code: string) => Promise<SimResult>
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 确定应用：回传编辑后的脚本全文。 */
  save: [code: string]
}>()

const visibleModel = defineModel<boolean>('visible', { required: true })

const working = ref('')
watch(visibleModel, (open) => {
  if (open) working.value = props.code ?? ''
})

const categories = computed(() => {
  const seen = new Map<string, ScriptFunctionDoc[]>()
  for (const fn of props.functions) {
    const list = seen.get(fn.category) ?? []
    list.push(fn)
    seen.set(fn.category, list)
  }
  return [...seen.entries()].map(([name, items]) => ({ name, items }))
})

function insertFunction(fn: ScriptFunctionDoc) {
  working.value = working.value.trimEnd()
    ? `${working.value.replace(/\s*$/, '')}\n${fn.snippet};`
    : `${fn.snippet};`
}

/* ── BF20261013-028：模拟运行（本地解释器执行；宿主函数返回示例值并记录调用） ── */

const simResult = ref<SimResult | null>(null)

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `"${value}"`
  if (value === null) return 'null'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** 模拟宿主：获取类返回示例值（真实值运行时由服务端解析），设置/提示类记录调用。 */
function buildSimulationHost(log: string[]): Record<string, (...args: unknown[]) => unknown> {
  const host: Record<string, (...args: unknown[]) => unknown> = {}
  const argsText = (args: unknown[]) => args.map((arg) => formatValue(arg)).join(', ')
  for (const fn of props.functions) {
    const name = fn.name.replace(/^#/, '')
    if (name === 'String' || name === 'Number' || name === 'Boolean') continue
    if (
      name.startsWith('设置') ||
      name.startsWith('提示') ||
      name.startsWith('显示') ||
      name.startsWith('隐藏')
    ) {
      host[name] = (...args: unknown[]) => {
        log.push(`${name}(${argsText(args)}) → 已记录`)
        return null
      }
      continue
    }
    host[name] = (...args: unknown[]) => {
      const key = String(args[0] ?? '')
      let sample: unknown = '示例值'
      if (/当前用户姓名/.test(name)) sample = '示例用户'
      else if (/用户|部门负责人|分管领导|上级部门|当前部门/.test(name)) sample = 1001
      else if (/流程变量|字段值/.test(name)) sample = key ? `示例值(${key})` : '示例值'
      log.push(`${name}(${argsText(args)}) → ${formatValue(sample)}`)
      return sample
    }
  }
  return host
}

const simulating = ref(false)

async function runSimulation() {
  simResult.value = null
  if (props.simulate) {
    simulating.value = true
    try {
      simResult.value = await props.simulate(working.value ?? '')
    } catch (e) {
      simResult.value = { ok: false, log: [], error: e instanceof Error ? e.message : String(e) }
    } finally {
      simulating.value = false
    }
    return
  }
  try {
    const program = parseScript(transpileScriptSugar(working.value ?? ''))
    const log: string[] = []
    const value = runScript(program, { hostFunctions: buildSimulationHost(log) })
    simResult.value = { ok: true, value, log }
  } catch (e) {
    simResult.value = { ok: false, log: [], error: e instanceof Error ? e.message : String(e) }
  }
}

function onCancel() {
  visibleModel.value = false
}

function onSave() {
  emit('save', working.value)
  visibleModel.value = false
}
</script>

<template>
  <el-dialog
    v-model="visibleModel"
    :title="title"
    width="min(980px, 96vw)"
    class="script-dialog"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="script-dialog__body">
      <aside class="script-dialog__catalog">
        <p class="script-dialog__catalog-title">可用函数</p>
        <section v-for="group in categories" :key="group.name" class="script-dialog__group">
          <p class="script-dialog__group-name">{{ group.name }}</p>
          <div v-for="fn in group.items" :key="fn.name" class="script-dialog__fn">
            <button
              type="button"
              class="script-dialog__fn-name"
              :title="`插入 ${fn.snippet}`"
              @click="insertFunction(fn)"
            >
              {{ fn.name }}
            </button>
            <el-tooltip :content="fn.desc" placement="top" effect="dark">
              <el-icon class="script-dialog__fn-help"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </section>
      </aside>
      <div class="script-dialog__editor">
        <JsCodeEditor
          v-model="working"
          :functions="props.functions"
          :placeholder="placeholder ?? '在此编写计算脚本，结果用 return 返回'"
        />
        <!-- BF20261013-028：模拟运行结果（流程脚本=服务端同一引擎；表单脚本=本地解释器示例值） -->
        <div v-if="simResult" class="script-dialog__sim" data-testid="script-sim-result">
          <p class="script-dialog__sim-title">模拟运行结果</p>
          <p v-if="simResult.error" class="script-dialog__sim-error">{{ simResult.error }}</p>
          <template v-else>
            <p class="script-dialog__sim-line">
              返回值：<code>{{ formatValue(simResult.value) }}</code>
            </p>
            <ul v-if="simResult.log.length" class="script-dialog__sim-log">
              <li v-for="(item, index) in simResult.log" :key="index">{{ item }}</li>
            </ul>
            <p v-else-if="!props.simulate" class="script-dialog__sim-note">未调用内置函数</p>
          </template>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button :loading="simulating" @click="runSimulation">模拟运行</el-button>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" @click="onSave">应用</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.script-dialog__body {
  display: flex;
  gap: 14px;
  min-height: 420px;
}

.script-dialog__catalog {
  width: 250px;
  flex: 0 0 250px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafd;
}

.script-dialog__catalog-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.script-dialog__group + .script-dialog__group {
  margin-top: 10px;
}

.script-dialog__group-name {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.script-dialog__fn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 0;
}

.script-dialog__fn-name {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: 13px;
  color: #6d5bd0;
  text-align: left;
}

.script-dialog__fn-name:hover {
  text-decoration: underline;
}

.script-dialog__fn-help {
  color: var(--el-text-color-secondary);
  cursor: help;
  flex: 0 0 auto;
}

.script-dialog__editor {
  flex: 1;
  min-width: 0;
}

/* BF20261013-028：模拟运行结果面板 */
.script-dialog__sim {
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: #f7f9fc;
  font-size: 12px;
  color: #1f2a44;
}
.script-dialog__sim-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.script-dialog__sim-line code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #0a7d33;
}
.script-dialog__sim-log {
  margin: 4px 0 0;
  padding-left: 18px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #4b5563;
}
.script-dialog__sim-note {
  margin: 4px 0 0;
  color: #8a9099;
}
.script-dialog__sim-error {
  margin: 0;
  color: #c2185b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
