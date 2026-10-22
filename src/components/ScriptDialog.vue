<script setup lang="ts">
/* global AbortSignal, AbortController, setTimeout, clearTimeout */
/**
 * ScriptDialog — BF20261013-022② 统一脚本编辑弹窗。
 *
 * 左侧按分类展示可用函数：点击函数行把用法片段插入右侧脚本输入框；
 * 函数行尾的问号悬停显示该函数的作用与用法。右侧为脚本编辑区（支持 #函数名 语法糖）。
 * 由调用方传入函数目录（流程脚本 / 表单脚本）与当前脚本，确定后回传编辑结果。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import DetailDialog from './DetailDialog.vue'
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
  simulate?: (code: string, signal?: AbortSignal) => Promise<SimResult>
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 确定应用：回传编辑后的脚本全文。 */
  save: [code: string]
}>()

const visibleModel = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()
const working = ref('')
const search = ref('')
const selected = ref<ScriptFunctionDoc | null>(null)
const editorRef = ref<InstanceType<typeof JsCodeEditor> | null>(null)
const helpFunction = computed(() => selected.value ?? props.functions[0])

const categories = computed(() => {
  const seen = new Map<string, ScriptFunctionDoc[]>()
  for (const fn of props.functions) {
    const query = search.value.trim().toLocaleLowerCase()
    if (
      query &&
      !`${fn.name} ${fn.category} ${fn.desc} ${fn.snippet}`.toLocaleLowerCase().includes(query)
    )
      continue
    const list = seen.get(fn.category) ?? []
    list.push(fn)
    seen.set(fn.category, list)
  }
  return [...seen.entries()].map(([name, items]) => ({ name, items }))
})

function insertFunction(fn: ScriptFunctionDoc) {
  selected.value = fn
  editorRef.value?.insertAtCaret(fn.snippet)
}

async function clearCode() {
  if (!working.value) return
  const original = working.value
  const session = generation
  try {
    await ElMessageBox.confirm(t('scriptWorkspace.clearConfirm'), t('scriptWorkspace.clear'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    if (visibleModel.value && generation === session && working.value === original)
      working.value = ''
  } catch {
    /* 取消保留草稿。 */
  }
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
let generation = 0
let previewController: AbortController | null = null

function cancelPreview() {
  generation++
  previewController?.abort()
  previewController = null
  simulating.value = false
}

watch(
  visibleModel,
  (open) => {
    cancelPreview()
    simResult.value = null
    if (open) {
      working.value = props.code ?? ''
      search.value = ''
      selected.value = props.functions[0] ?? null
    }
  },
  { immediate: true, flush: 'sync' },
)
watch(
  working,
  () => {
    cancelPreview()
    simResult.value = null
  },
  { flush: 'sync' },
)
onBeforeUnmount(cancelPreview)

async function runSimulation() {
  if (simulating.value || !visibleModel.value) return
  simResult.value = null
  if (props.simulate) {
    const current = ++generation
    const controller = new AbortController()
    previewController = controller
    simulating.value = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const cancelled = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error(t('scriptWorkspace.cancelled'))),
          { once: true },
        )
      })
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(t('scriptWorkspace.timeout')))
          controller.abort()
        }, 15000)
      })
      const result = await Promise.race([
        props.simulate(working.value, controller.signal),
        cancelled,
        timedOut,
      ])
      if (current === generation && visibleModel.value) simResult.value = result
    } catch (e) {
      if (current === generation && visibleModel.value) {
        simResult.value = { ok: false, log: [], error: e instanceof Error ? e.message : String(e) }
      }
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      if (current === generation) {
        simulating.value = false
        previewController = null
      }
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
  <DetailDialog
    v-model="visibleModel"
    :title="title"
    width="1480px"
    appearance="design"
    class="script-dialog"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="script-dialog__body">
      <aside class="script-dialog__catalog">
        <p class="script-dialog__catalog-title">{{ t('scriptWorkspace.functions') }}</p>
        <el-input
          v-model="search"
          :placeholder="t('scriptWorkspace.search')"
          :aria-label="t('scriptWorkspace.search')"
          clearable
        />
        <section v-for="group in categories" :key="group.name" class="script-dialog__group">
          <p class="script-dialog__group-name">{{ group.name }}</p>
          <div v-for="fn in group.items" :key="fn.name" class="script-dialog__fn">
            <button
              type="button"
              class="script-dialog__fn-name"
              :class="{ 'is-selected': helpFunction?.name === fn.name }"
              :title="fn.snippet"
              @mousedown.prevent
              @click="insertFunction(fn)"
            >
              {{ fn.name }}
            </button>
            <el-tooltip :content="fn.desc" placement="top">
              <button
                type="button"
                class="script-dialog__fn-help"
                :aria-label="t('scriptWorkspace.help', { name: fn.name })"
                @click="selected = fn"
              >
                ?
              </button>
            </el-tooltip>
          </div>
        </section>
        <p v-if="!categories.length" class="script-dialog__empty">
          {{ t('scriptWorkspace.noFunctions') }}
        </p>
      </aside>
      <div class="script-dialog__editor">
        <section class="script-dialog__code">
          <div class="script-dialog__toolbar">
            <span>JavaScript</span>
            <button type="button" @click="clearCode">{{ t('scriptWorkspace.clear') }}</button>
          </div>
          <JsCodeEditor
            ref="editorRef"
            v-model="working"
            :functions="props.functions"
            appearance="workspace"
            :language-mode="props.simulate ? 'javascript' : 'bounded'"
            :placeholder="placeholder ?? t('scriptWorkspace.placeholder')"
          />
        </section>
        <section class="script-dialog__help">
          <p class="script-dialog__help-signature">
            {{ helpFunction?.snippet ?? t('scriptWorkspace.functions') }}
          </p>
          <p class="script-dialog__help-desc">
            {{ helpFunction?.desc ?? t('scriptWorkspace.noFunctions') }}
          </p>
        </section>
        <section class="script-dialog__sim" aria-live="polite" data-testid="script-sim-result">
          <div class="script-dialog__sim-header">
            <p class="script-dialog__sim-title">{{ t('scriptWorkspace.result') }}</p>
            <span
              v-if="simResult"
              class="script-dialog__status"
              :class="{ 'is-error': !simResult.ok }"
              >{{ t(simResult.ok ? 'scriptWorkspace.success' : 'scriptWorkspace.failure') }}</span
            >
          </div>
          <div class="script-dialog__result-content">
            <p v-if="simResult && !simResult.ok" class="script-dialog__sim-error">
              {{ simResult.error || t('scriptWorkspace.failure') }}
            </p>
            <template v-else-if="simResult">
              <p class="script-dialog__sim-line">
                {{ t('scriptWorkspace.returnValue') }}{{ formatValue(simResult.value) }}
              </p>
              <ul v-if="simResult.log.length" class="script-dialog__sim-log">
                <li v-for="(item, index) in simResult.log" :key="index">{{ item }}</li>
              </ul>
            </template>
            <p v-else class="script-dialog__empty">
              {{ t(simulating ? 'scriptWorkspace.running' : 'scriptWorkspace.notRun') }}
            </p>
          </div>
        </section>
      </div>
    </div>
    <template #footer>
      <el-button :loading="simulating" @click="runSimulation">{{
        t('scriptWorkspace.run')
      }}</el-button>
      <el-button @click="onCancel">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="onSave">{{ t('scriptWorkspace.apply') }}</el-button>
    </template>
  </DetailDialog>
</template>

<style scoped>
:global(.script-dialog.sw-detail-dialog--design .el-dialog__body) {
  max-height: none;
  overflow: hidden;
}
.script-dialog__body {
  display: flex;
  gap: var(--sw-space-16);
  height: min(650px, calc(100dvh - 182px));
  min-height: 300px;
}
.script-dialog__catalog {
  box-sizing: border-box;
  width: 280px;
  flex: 0 0 280px;
  padding: var(--sw-space-16);
  overflow: auto;
  background: var(--sw-surface-page);
}
.script-dialog__catalog-title {
  margin: 0 0 var(--sw-space-8);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.script-dialog__catalog :deep(.el-input) {
  margin-bottom: var(--sw-space-8);
}
.script-dialog__group-name {
  margin: 0 0 var(--sw-space-8);
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.script-dialog__fn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-8);
  height: 28px;
  margin-bottom: var(--sw-space-8);
}
.script-dialog__fn-name,
.script-dialog__fn-help,
.script-dialog__toolbar button {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
.script-dialog__fn-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 14px;
  line-height: 22px;
  color: var(--sw-text-regular);
}
.script-dialog__fn-name.is-selected,
.script-dialog__fn-name:hover {
  color: var(--sw-color-primary);
}
.script-dialog__fn-help {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.script-dialog__editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-12);
}
.script-dialog__code {
  box-sizing: border-box;
  flex: 1;
  min-height: 100px;
  padding: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}
.script-dialog__toolbar {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.script-dialog__toolbar button {
  color: inherit;
}
.script-dialog__help,
.script-dialog__sim {
  box-sizing: border-box;
  flex-shrink: 0;
  padding: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  background: var(--sw-surface-page);
}
.script-dialog__help {
  height: 98px;
  overflow: auto;
}
.script-dialog__help-signature {
  margin: 0 0 var(--sw-space-8);
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.script-dialog__help-desc {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.script-dialog__sim {
  height: 108px;
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}
.script-dialog__sim-header {
  display: flex;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
}
.script-dialog__sim-title {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.script-dialog__status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 24px;
  border-radius: var(--sw-radius-base);
  font-size: 12px;
  color: var(--sw-success-text);
  background: var(--sw-success-bg);
}
.script-dialog__status.is-error {
  color: var(--sw-danger);
  background: var(--sw-danger-bg);
}
.script-dialog__result-content {
  min-height: 0;
  overflow: auto;
  font-size: 14px;
  line-height: 22px;
}
.script-dialog__sim-line {
  margin: 0;
  color: var(--sw-success-text);
}
.script-dialog__sim-error {
  margin: 0;
  color: var(--sw-danger);
  overflow-wrap: anywhere;
}
.script-dialog__sim-log {
  margin: var(--sw-space-4) 0 0;
  padding-left: var(--sw-space-16);
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.script-dialog__empty {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
@media (max-width: 800px) {
  .script-dialog__body {
    flex-direction: column;
    min-height: 0;
  }
  .script-dialog__catalog {
    width: 100%;
    flex: 0 0 120px;
  }
  .script-dialog__editor {
    min-height: 0;
  }
  .script-dialog__help {
    height: 74px;
  }
  .script-dialog__sim {
    height: 90px;
  }
}
</style>
