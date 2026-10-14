<script setup lang="ts">
/**
 * JsCodeEditor — BF20261013-028：脚本输入框的 JS 标准样式渲染。
 *
 * 无第三方依赖的轻量实现：透明 textarea 叠在着色 pre 之上（同字体度量同步滚动），
 * 关键字/内置对象/字符串/数字/注释/#函数名 着色；输入时按前缀弹出候选（关键字/内置对象/
 * 目录函数），Tab 或 Enter 补齐、上下键选择、Esc 关闭——样式对齐浏览器 console 习惯。
 */
/* global document, window, HTMLElement, HTMLTextAreaElement, Event, KeyboardEvent */
import { computed, nextTick, ref, watch } from 'vue'

interface EditorFunction {
  name: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    /** 内置函数目录（#函数名 语法糖高亮与自动补齐候选）。 */
    functions?: EditorFunction[]
  }>(),
  { placeholder: '', functions: () => [] },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const KEYWORDS = [
  'var',
  'let',
  'const',
  'if',
  'else',
  'return',
  'function',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'switch',
  'case',
  'default',
  'try',
  'catch',
  'finally',
  'throw',
  'delete',
  'void',
  'this',
]
const LITERALS = ['true', 'false', 'null', 'undefined']
const BUILTINS = [
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Math',
  'JSON',
  'Date',
  'RegExp',
  'Error',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'console',
  'length',
  'push',
  'join',
  'split',
  'slice',
  'indexOf',
  'includes',
  'filter',
  'map',
  'forEach',
  'reduce',
  'trim',
  'toString',
  'keys',
  'values',
  'entries',
  'isArray',
]

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLElement | null>(null)

/** 自动配对表（BF20261013-029）：左括号/引号 → 右半。 */
const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
}
const CLOSERS = new Set([')', ']', '}', '"', "'", '`'])

const isIdentChar = (ch: string): boolean => /[A-Za-z0-9_$\u4e00-\u9fa5]/.test(ch)

interface Token {
  text: string
  cls: string
}

/** 轻量词法着色（覆盖脚本子集：关键字/字面量/内置/字符串/数字/注释/#函数名）。 */
const tokens = computed<Token[]>(() => {
  const code = props.modelValue ?? ''
  const fnNames = new Set(props.functions.map((item) => item.name))
  const out: Token[] = []
  const push = (cls: string, text: string) => out.push({ cls, text })
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      const stop = end === -1 ? code.length : end
      push('tok-comment', code.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? code.length : end + 2
      push('tok-comment', code.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      let j = i + 1
      while (j < code.length && code[j] !== quote) {
        if (code[j] === '\\') j++
        j++
      }
      const stop = Math.min(j + 1, code.length)
      push('tok-string', code.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '#' && isIdentChar(code[i + 1] ?? '')) {
      let j = i + 1
      while (j < code.length && isIdentChar(code[j])) j++
      push('tok-fn', code.slice(i, j))
      i = j
      continue
    }
    if (/[0-9]/.test(ch)) {
      let j = i
      while (j < code.length && /[0-9._]/.test(code[j])) j++
      push('tok-number', code.slice(i, j))
      i = j
      continue
    }
    if (isIdentChar(ch)) {
      let j = i
      while (j < code.length && isIdentChar(code[j])) j++
      const word = code.slice(i, j)
      if (LITERALS.includes(word)) push('tok-literal', word)
      else if (KEYWORDS.includes(word)) push('tok-keyword', word)
      else if (BUILTINS.includes(word)) push('tok-builtin', word)
      else if (fnNames.has(word)) push('tok-fn', word)
      else push('', word)
      i = j
      continue
    }
    push('', ch)
    i++
  }
  return out.length ? out : [{ cls: '', text: ' ' }]
})

/* ── 自动补齐 ── */

const suggestionOpen = ref(false)
const suggestions = ref<string[]>([])
const activeIndex = ref(0)
const wordStart = ref(0)
const dropdownStyle = ref<Record<string, string>>({})

function syncScroll() {
  const ta = textareaRef.value
  const pre = preRef.value
  if (!ta || !pre) return
  pre.scrollTop = ta.scrollTop
  pre.scrollLeft = ta.scrollLeft
}

/** 光标处的词前缀（#开头则只补函数名）。 */
function wordAtCaret(): { word: string; start: number } {
  const ta = textareaRef.value
  if (!ta) return { word: '', start: 0 }
  const caret = ta.selectionStart ?? 0
  let start = caret
  while (start > 0 && isIdentChar(ta.value[start - 1])) start--
  if (start > 0 && ta.value[start - 1] === '#') start--
  return { word: ta.value.slice(start, caret), start }
}

function updateDropdownPosition() {
  const ta = textareaRef.value
  if (!ta) return
  const mirror = document.createElement('div')
  const style = window.getComputedStyle(ta)
  const mirrorStyle = mirror.style as unknown as Record<string, string>
  for (const prop of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'padding',
    'border',
    'boxSizing',
    'width',
  ]) {
    mirrorStyle[prop] = style.getPropertyValue(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
  }
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '0'
  mirror.textContent = ta.value.slice(0, ta.selectionStart ?? 0)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const rect = ta.getBoundingClientRect()
  const lineHeight = Number.parseFloat(style.lineHeight) || 20
  const top = rect.top + marker.offsetTop - ta.scrollTop + lineHeight + 2
  const left = rect.left + marker.offsetLeft
  document.body.removeChild(mirror)
  dropdownStyle.value = {
    position: 'fixed',
    top: `${Math.min(top, window.innerHeight - 220)}px`,
    left: `${Math.min(left, window.innerWidth - 220)}px`,
  }
}

function refreshSuggestions() {
  const { word, start } = wordAtCaret()
  if (!word) {
    suggestionOpen.value = false
    return
  }
  const fnNames = props.functions.map((item) => item.name)
  const pool = word.startsWith('#')
    ? fnNames.map((name) => `#${name}`)
    : [...fnNames, ...KEYWORDS, ...LITERALS, ...BUILTINS]
  const lower = word.toLowerCase()
  const matched = pool.filter((item) => item.toLowerCase().startsWith(lower) && item !== word)
  suggestions.value = matched.slice(0, 12)
  activeIndex.value = 0
  wordStart.value = start
  suggestionOpen.value = suggestions.value.length > 0
  if (suggestionOpen.value) void nextTick(() => updateDropdownPosition())
}

function applySuggestion(text: string) {
  const ta = textareaRef.value
  if (!ta) return
  const caret = ta.selectionStart ?? 0
  const next = ta.value.slice(0, wordStart.value) + text + ta.value.slice(caret)
  emit('update:modelValue', next)
  suggestionOpen.value = false
  void nextTick(() => {
    const pos = wordStart.value + text.length
    ta.setSelectionRange(pos, pos)
    ta.focus()
  })
}

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  syncScroll()
  refreshSuggestions()
}

function onKeydown(event: KeyboardEvent) {
  if (suggestionOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex.value =
        (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      applySuggestion(suggestions.value[activeIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      suggestionOpen.value = false
      return
    }
  }
  // 无候选时 Tab 插入两空格（编辑器习惯）
  if (event.key === 'Tab') {
    event.preventDefault()
    const ta = textareaRef.value
    if (!ta) return
    const caret = ta.selectionStart ?? 0
    const next = `${ta.value.slice(0, caret)}  ${ta.value.slice(ta.selectionEnd ?? caret)}`
    emit('update:modelValue', next)
    void nextTick(() => ta.setSelectionRange(caret + 2, caret + 2))
    return
  }
  // BF20261013-029：括号/引号自动配对（选中文本则包裹，成对退格一次删净，右括号已存在则跳过）
  const closer = PAIRS[event.key]
  const ta = textareaRef.value
  if (closer && ta) {
    event.preventDefault()
    suggestionOpen.value = false
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? 0
    const selected = ta.value.slice(start, end)
    const next = `${ta.value.slice(0, start)}${event.key}${selected}${closer}${ta.value.slice(end)}`
    emit('update:modelValue', next)
    const caret = selected ? start + selected.length + 2 : start + 1
    void nextTick(() => {
      ta.setSelectionRange(caret, caret)
      ta.focus()
    })
    return
  }
  if (CLOSERS.has(event.key) && ta) {
    const caret = ta.selectionStart ?? 0
    if (ta.selectionStart === ta.selectionEnd && ta.value[caret] === event.key) {
      event.preventDefault()
      void nextTick(() => {
        ta.setSelectionRange(caret + 1, caret + 1)
        ta.focus()
      })
    }
    return
  }
  if (event.key === 'Backspace' && ta) {
    const caret = ta.selectionStart ?? 0
    if (ta.selectionStart === ta.selectionEnd && caret > 0) {
      const before = ta.value[caret - 1]
      const after = ta.value[caret]
      if (PAIRS[before] === after) {
        event.preventDefault()
        emit('update:modelValue', ta.value.slice(0, caret - 1) + ta.value.slice(caret + 1))
        void nextTick(() => {
          ta.setSelectionRange(caret - 1, caret - 1)
          ta.focus()
        })
      }
    }
  }
}

watch(
  () => props.modelValue,
  () => void nextTick(syncScroll),
)
</script>

<template>
  <div class="js-editor">
    <pre ref="preRef" class="js-editor__pre" aria-hidden="true"><code><span
          v-for="(token, index) in tokens"
          :key="index"
          :class="token.cls"
        >{{ token.text }}</span></code></pre>
    <textarea
      ref="textareaRef"
      class="js-editor__input"
      :value="modelValue"
      :placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
      @scroll="syncScroll"
      @blur="suggestionOpen = false"
    />
    <ul
      v-if="suggestionOpen"
      class="js-editor__suggest"
      :style="dropdownStyle"
      data-testid="js-editor-suggest"
    >
      <li
        v-for="(item, index) in suggestions"
        :key="item"
        :class="{ 'is-active': index === activeIndex }"
        @mousedown.prevent="applySuggestion(item)"
      >
        {{ item }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.js-editor {
  position: relative;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}
.js-editor__pre,
.js-editor__input {
  margin: 0;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  tab-size: 2;
}
.js-editor__pre {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  color: #1f2a44;
}
.js-editor__input {
  position: relative;
  display: block;
  width: 100%;
  min-height: 320px;
  border: none;
  outline: none;
  resize: vertical;
  background: transparent;
  color: transparent;
  caret-color: #1f2a44;
}
.js-editor__input::placeholder {
  color: #a8abb2;
}
.js-editor :deep(.tok-keyword) {
  color: #c2185b;
  font-weight: 600;
}
.js-editor :deep(.tok-literal) {
  color: #1a56db;
}
.js-editor :deep(.tok-builtin) {
  color: #0b7285;
}
.js-editor :deep(.tok-fn) {
  color: #7c3aed;
  font-weight: 600;
}
.js-editor :deep(.tok-string) {
  color: #0a7d33;
}
.js-editor :deep(.tok-number) {
  color: #1a56db;
}
.js-editor :deep(.tok-comment) {
  color: #8a9099;
  font-style: italic;
}
.js-editor__suggest {
  z-index: 3000;
  margin: 0;
  padding: 4px 0;
  min-width: 200px;
  max-height: 220px;
  overflow-y: auto;
  list-style: none;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  box-shadow: var(--el-box-shadow-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: #1f2a44;
}
.js-editor__suggest li {
  padding: 3px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.js-editor__suggest li.is-active {
  background: #e8f0fe;
}
</style>
