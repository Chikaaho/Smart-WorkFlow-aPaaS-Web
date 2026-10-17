<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global HTMLElement,
  Element,
  Range,
  Node,
  MouseEvent,
  InputEvent,
  ClipboardEvent,
  window,
  document */
/**
 * ThemeRuleDialog — 流程编号（主题）规则设置弹窗（BF20261013-041，BF20261013-042 重构）。
 *
 * 交互口径（Owner）：
 *   - 变量按钮与输入框同框：按钮位于输入框内、以灰底文字样式展示，点击在光标处带入；
 *   - 用户看不到占位记法（{YYYYMMDD…}），框内只显示 [发起时间] 这类灰底标识；
 *   - 用户手写的 {xxx} 一律当普通字符串：保存时转义字面花括号，回显仍是普通文字。
 * 供流程定义列表与表单工作台「关联流程」共用。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { ApiError } from '@/foundation/request'
import { getProcessDefThemeRule, updateProcessDefThemeRule } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import {
  THEME_RULE_TOKENS,
  SEQ_DIGIT_OPTIONS,
  chipText,
  escapeThemeText,
  parseRuleSegments,
  seqDigitsFromRule,
  seqToken,
  themeRulePreview,
} from '@/modules/workflow/utils/theme-rule'

const props = defineProps<{ visible: boolean; def: ProcessDef | null }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const userStore = useUserStore()

const themeRuleInput = ref('')
const saving = ref(false)
/** 自增编号位数（0 = 不补零）：点「自增序号」按钮时按此位数带入 {SEQ:n} */
const themeSeqDigits = ref(3)
/** 规则编辑区（contenteditable）：变量在框内直接显示成灰底文字标识 */
const themeEditorRef = ref<HTMLElement | null>(null)
/** 编辑器内最近一次光标（点框内按钮时用它定位插入点） */
let themeCaret: Range | null = null

/** 位数下拉选项：既有规则可能是 7-10 位（服务端上限 10），动态并入以免回显丢失 */
const seqDigitChoices = computed(() => {
  const base = SEQ_DIGIT_OPTIONS.map(Number)
  if (base.includes(themeSeqDigits.value)) return base
  return [...base, themeSeqDigits.value].sort((a, b) => a - b)
})

/** 示例预览：变量替换成演示值（发起人取当前登录用户），用户直接看到编号长什么样 */
const themePreview = computed(() =>
  themeRulePreview(themeRuleInput.value, new Date(), userStore.user?.displayName ?? ''),
)

/** 预览与输入框内灰底标识同源：变量的展示文字（含自增位数） */
function themeChipText(token: string): string {
  return chipText(token, (key, params) => (params ? t(key, params) : t(key)))
}

function rememberThemeCaret() {
  const el = themeEditorRef.value
  const selection = window.getSelection()
  if (!el || !selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (el.contains(range.startContainer) && !caretInsideChip(range)) themeCaret = range.cloneRange()
}

/** 光标是否落在灰底标识内部（标识是原子对象，不允许在里面打字） */
function caretInsideChip(range: Range | null): boolean {
  const node = range?.startContainer
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return Boolean(element?.closest('.theme-editor__chip'))
}

/**
 * 点中标识：不把光标放进标识内部（否则打字会把标识文字改坏且不落规则），
 * 改为按点击半边把光标放到标识前/后。
 */
function focusChipEdge(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const chip = target?.closest?.('.theme-editor__chip') as HTMLElement | null
  if (!chip) return
  event.preventDefault()
  const el = themeEditorRef.value
  if (!el) return
  el.focus()
  const rect = chip.getBoundingClientRect()
  const range = document.createRange()
  if (rect.width > 0 && event.clientX >= rect.left + rect.width / 2) {
    range.setStartAfter(chip)
  } else {
    range.setStartBefore(chip)
  }
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  themeCaret = range.cloneRange()
}

/** 兜底：任何落在标识内部的输入一律拦下（键盘导航/输入法路径） */
function guardChipInput(event: InputEvent) {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && caretInsideChip(selection.getRangeAt(0))) {
    event.preventDefault()
  }
}

function themeCaretRange(): Range {
  const el = themeEditorRef.value as HTMLElement
  if (themeCaret && el.contains(themeCaret.startContainer)) return themeCaret
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  return range
}

/** 在光标处插入一个灰底标识（选中内容会被替换），并把光标落到标识之后 */
function appendThemeToken(token: string) {
  const el = themeEditorRef.value
  if (!el) return
  el.focus()
  const chip = document.createElement('span')
  chip.className = 'theme-editor__chip'
  chip.contentEditable = 'false'
  chip.dataset.token = token
  chip.textContent = `[${themeChipText(token)}]`
  const range = themeCaretRange()
  range.deleteContents()
  range.insertNode(chip)
  const after = document.createRange()
  after.setStartAfter(chip)
  after.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(after)
  themeCaret = after.cloneRange()
  syncThemeRule()
}

/** 光标处插入纯文本（粘贴统一降级为纯文本，避免带入外部格式） */
function pasteThemeText(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const el = themeEditorRef.value
  if (!el || !text) return
  el.focus()
  const range = themeCaretRange()
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  const after = document.createRange()
  after.setStartAfter(node)
  after.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(after)
  themeCaret = after.cloneRange()
  syncThemeRule()
}

/**
 * 编辑区 DOM → 规则文本：文字节点按字面量转义（手写 {xxx} 是普通字符串），
 * 灰底标识取 data-token（标识内的展示文字不参与）。
 */
function ruleFromThemeEditor(): string {
  const el = themeEditorRef.value
  if (!el) return themeRuleInput.value
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeThemeText(node.textContent ?? '')
      continue
    }
    const element = node as HTMLElement
    if (element.dataset?.token) out += element.dataset.token
    else out += escapeThemeText(element.textContent ?? '')
  }
  return out
}

function syncThemeRule() {
  themeRuleInput.value = ruleFromThemeEditor()
}

/** 规则文本 → 编辑区 DOM（打开弹窗与清空后回显；输入过程不重绘，避免光标跳动） */
function renderThemeEditor() {
  const el = themeEditorRef.value
  if (!el) return
  el.textContent = ''
  for (const segment of parseRuleSegments(themeRuleInput.value)) {
    if (segment.kind === 'text') {
      el.appendChild(document.createTextNode(segment.value))
      continue
    }
    const chip = document.createElement('span')
    chip.className = 'theme-editor__chip'
    chip.contentEditable = 'false'
    chip.dataset.token = segment.value
    chip.textContent = `[${themeChipText(segment.value)}]`
    el.appendChild(chip)
  }
}

async function loadThemeRule() {
  if (!props.def) return
  themeRuleInput.value = ''
  themeCaret = null
  themeSeqDigits.value = 3
  try {
    const rule = await getProcessDefThemeRule(props.def.id)
    themeRuleInput.value = rule ?? ''
    themeSeqDigits.value = seqDigitsFromRule(rule ?? '') ?? 3
  } catch {
    // 读取失败按空规则处理：用户仍可重新设置，保存时服务端校验兜底
    themeRuleInput.value = ''
  }
  await nextTick()
  renderThemeEditor()
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadThemeRule()
  },
  { immediate: true },
)

function close() {
  emit('update:visible', false)
}

async function saveThemeRule() {
  if (!props.def) return
  const rule = themeRuleInput.value.trim()
  if (!rule) {
    ElMessage.warning(t('workflow.themeRuleRequired'))
    return
  }
  saving.value = true
  try {
    await updateProcessDefThemeRule(props.def.id, rule)
    ElMessage.success(t('workflow.themeRuleSaved'))
    emit('saved')
    close()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.themeRuleSaveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('workflow.themeRuleTitle')"
    width="620px"
    append-to-body
    @update:model-value="emit('update:visible', $event)"
  >
    <p v-if="def" class="theme-dialog__meta">{{ def.name }}（{{ def.processKey }}）</p>
    <p class="theme-dialog__desc">{{ t('workflow.themeRuleDesc') }}</p>
    <!-- BF20261013-042：变量按钮放进输入框（灰底文字样式），点击在光标处带入；
         框内只显示 [发起时间] 类标识，手写 {xxx} 是普通字符串 -->
    <div class="theme-editor">
      <div
        ref="themeEditorRef"
        class="theme-editor__content"
        :data-placeholder="t('workflow.themeRulePlaceholder')"
        contenteditable="true"
        role="textbox"
        aria-label="workflow-theme-rule"
        @input="syncThemeRule"
        @keyup="rememberThemeCaret"
        @mouseup="rememberThemeCaret"
        @mousedown="focusChipEdge"
        @beforeinput="guardChipInput"
        @keydown.enter.prevent
        @paste.prevent="pasteThemeText"
      />
      <div class="theme-editor__bar">
        <span class="theme-editor__bar-label">{{ t('workflow.themeRuleTokens') }}</span>
        <button
          v-for="token in THEME_RULE_TOKENS"
          :key="token.key"
          type="button"
          class="theme-editor__add"
          @mousedown.prevent
          @click="appendThemeToken(token.token)"
        >
          {{ t(token.labelKey) }}
        </button>
        <span class="theme-editor__seq">
          <button
            type="button"
            class="theme-editor__add"
            @mousedown.prevent
            @click="appendThemeToken(seqToken(themeSeqDigits))"
          >
            {{ t('workflow.themeRuleTokenSeq') }}
          </button>
          <el-select v-model="themeSeqDigits" size="small" class="theme-dialog__seq-digits">
            <el-option
              v-for="digits in seqDigitChoices"
              :key="digits"
              :value="digits"
              :label="
                digits === 0
                  ? t('workflow.themeRuleSeqNoPad')
                  : t('workflow.themeRuleSeqDigits', { n: digits })
              "
            />
          </el-select>
        </span>
      </div>
    </div>
    <p class="theme-dialog__preview">
      {{ t('workflow.themeRulePreview') }}：<strong>{{ themePreview || '—' }}</strong>
    </p>
    <p class="theme-dialog__hint">{{ t('workflow.themeRuleRequiredHint') }}</p>
    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="saveThemeRule">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* BF20261013-042 流程编号规则构建器：输入框内灰底标识 + 同框变量按钮（灰底文字样式） */
.theme-dialog__meta {
  margin: 0 0 6px;
  color: #17213a;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.theme-dialog__desc {
  margin: 0 0 12px;
  color: #687386;
  font-size: 13px;
  line-height: 20px;
}
/* 规则输入框：内容区 + 变量按钮条同处一个描边框内（对齐 el-input 外观） */
.theme-editor {
  box-sizing: border-box;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: var(--el-border-radius-base, 4px);
  background: var(--el-fill-color-blank, #fff);
  overflow: hidden;
}
.theme-editor:focus-within {
  border-color: var(--el-color-primary, #6f2dff);
}
.theme-editor__content {
  box-sizing: border-box;
  min-height: 34px;
  padding: 6px 11px;
  color: var(--el-text-color-regular, #606266);
  font-size: 14px;
  line-height: 20px;
  word-break: break-all;
  cursor: text;
  outline: none;
}
.theme-editor__content:empty::before {
  content: attr(data-placeholder);
  color: var(--el-text-color-placeholder, #a8abb2);
}
/* 动态创建的标识节点没有 scoped 属性，必须经 :deep 落样式（BF041 灰底未生效的根因） */
.theme-editor :deep(.theme-editor__chip) {
  display: inline-block;
  margin: 0 1px;
  padding: 0 6px;
  border-radius: 4px;
  background: #eef1f7;
  color: #46506a;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  /* 标识是原子对象：文字不可被选进光标（配合 mousedown 兜底，避免把标识文字改坏） */
  user-select: none;
}
.theme-editor__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 11px;
  border-top: 1px solid #f0f2f7;
  background: #fbfcff;
}
.theme-editor__bar-label {
  color: #8690ae;
  font-size: 12px;
}
/* 变量按钮 = 与框内标识同款的灰底文字（点击带入，不显示占位记法） */
.theme-editor__add {
  padding: 1px 8px;
  border: none;
  border-radius: 4px;
  background: #eef1f7;
  color: #46506a;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.theme-editor__add:hover {
  background: #e3e8f2;
}
.theme-editor__seq {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.theme-dialog__seq-digits {
  width: 104px;
}
.theme-dialog__preview {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f7f9fd;
  color: #344164;
  font-size: 13px;
  line-height: 20px;
}
.theme-dialog__hint {
  margin: 10px 0 0;
  color: #8690ae;
  font-size: 12px;
  line-height: 18px;
}
</style>
