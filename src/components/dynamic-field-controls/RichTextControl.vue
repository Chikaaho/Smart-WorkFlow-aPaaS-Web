<script setup lang="ts">
/* global document, window, HTMLElement, Node, Range, ClipboardEvent, MouseEvent, PointerEvent */
/**
 * 富文本（RICH_TEXT）控件（direction-ui-semantics-020 / direction-ui-completion-020 / A09—A12）。
 * - 编辑：受控字体/字号/颜色与基础排版（加粗/斜体/下划线/删除线、对齐/缩进、有序/无序列表）；
 *   对齐与缩进不用 execCommand 行内样式，直接写 p/div 受控令牌；粘贴与直写经同一清洗；
 * - 只读/历史：带前缀的新值按受控 HTML 渲染，旧无前缀值按纯文本换行展示；
 * - 长度/必填按用户可见文本计数（父级 FormRender 与服务端同口径）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import ReadonlyValue from './ReadonlyValue.vue'
import SafeHtml from '@/security/SafeHtml.vue'
import {
  RICH_TEXT_COLORS,
  RICH_TEXT_FONTS,
  RICH_TEXT_SIZES,
  editorHtmlForValue,
  isRichText,
  richTextVisibleText,
  sanitizeRichTextBody,
  serializeRichText,
} from '@/modules/form/rich-text'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const { t } = useI18n()
const editorRef = ref<HTMLElement | null>(null)
const colorWrapRef = ref<HTMLElement | null>(null)
const focused = ref(false)
const colorOpen = ref(false)
const customColor = ref('#6F2DFF')
const activeFont = ref('default')
const activeSize = ref(14)
const activeColor = ref('#6F2DFF')
const boldActive = ref(false)
const italicActive = ref(false)
const underlineActive = ref(false)
const strikeActive = ref(false)
const ulActive = ref(false)
const olActive = ref(false)
const activeAlign = ref<'left' | 'center' | 'right'>('left')
let savedRange: Range | null = null
let pendingSize: number | null = null

const fontOptions = RICH_TEXT_FONTS
const sizeOptions = RICH_TEXT_SIZES
const colorOptions = RICH_TEXT_COLORS
const readonlyRich = computed(() => isRichText(props.modelValue))
const readonlyValue = computed(() => String(props.modelValue ?? ''))
const visibleCount = computed(() => Array.from(richTextVisibleText(props.modelValue)).length)
const maxLength = computed(() => Number(props.field.length ?? 0))
const showCount = computed(() => maxLength.value > 0)
const overLimit = computed(() => maxLength.value > 0 && visibleCount.value > maxLength.value)

function syncEditor(): void {
  const editor = editorRef.value
  if (!editor) return
  editor.innerHTML = editorHtmlForValue(props.modelValue)
}

function emitEditorValue(): void {
  const editor = editorRef.value
  if (!editor) return
  const value = serializeRichText(editor.innerHTML)
  if (value !== String(props.modelValue ?? '')) emit('update:modelValue', value)
}

function onInput(): void {
  emitEditorValue()
}

function saveSelection(): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (editorRef.value?.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange()
  }
}

function restoreSelection(): void {
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  if (!savedRange) return
  const selection = window.getSelection()
  if (!selection) return
  try {
    selection.removeAllRanges()
    selection.addRange(savedRange)
  } catch {
    // 保存的 Range 已被编辑器重建失效：退回当前光标位置，不中断格式操作。
  }
}

function fontTokenOf(face: string): string {
  const value = face.toLowerCase()
  if (value.includes('simsun') || value.includes('宋体')) return 'song'
  if (value.includes('simhei') || value.includes('黑体')) return 'hei'
  if (value.includes('yahei') || value.includes('微软雅黑')) return 'yahei'
  if (value.includes('arial')) return 'arial'
  if (value.includes('times')) return 'times'
  return 'default'
}

function normalizeColor(value: string): string {
  const hex = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase()
  const rgb = hex.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`
  }
  return ''
}

function sizeTokenOf(value: string): string {
  const px = Math.round(Number.parseFloat(value))
  return (RICH_TEXT_SIZES as readonly number[]).includes(px) ? String(px) : ''
}

function applyDataAttributes(
  target: HTMLElement,
  attrs: { font?: string; size?: string; color?: string },
): void {
  if (attrs.font) target.setAttribute('data-rt-font', attrs.font)
  if (attrs.size) target.setAttribute('data-rt-size', attrs.size)
  if (attrs.color) target.setAttribute('data-rt-color', attrs.color)
}

/** 把浏览器 execCommand 产物统一成受控 span；样式只提取白名单令牌。 */
function normalizeEditorDom(sizeForFontTag: number | null = pendingSize): void {
  const editor = editorRef.value
  if (!editor) return

  for (const font of Array.from(editor.querySelectorAll('font'))) {
    const span = document.createElement('span')
    const face = font.getAttribute('face') ?? ''
    const color = normalizeColor(font.getAttribute('color') ?? '')
    const hasSize = font.hasAttribute('size')
    applyDataAttributes(span, {
      font: face ? fontTokenOf(face) : undefined,
      size: hasSize && sizeForFontTag ? String(sizeForFontTag) : undefined,
      color: color || undefined,
    })
    span.append(...Array.from(font.childNodes))
    font.replaceWith(span)
  }

  for (const span of Array.from(editor.querySelectorAll('span[style]'))) {
    const style = (span as HTMLElement).style
    const attrs = {
      font: style.fontFamily ? fontTokenOf(style.fontFamily) : undefined,
      size: style.fontSize ? sizeTokenOf(style.fontSize) : undefined,
      color: style.color ? normalizeColor(style.color) : undefined,
    }
    if (attrs.font || attrs.size || attrs.color) {
      applyDataAttributes(span as HTMLElement, attrs)
    }
    span.removeAttribute('style')
  }

  for (const span of Array.from(editor.querySelectorAll('span'))) {
    for (const attr of Array.from(span.attributes)) {
      if (attr.name.startsWith('data-rt-') && !attr.value) span.removeAttribute(attr.name)
    }
    if (span.attributes.length === 0) span.replaceWith(...Array.from(span.childNodes))
  }
}

function afterCommand(): void {
  normalizeEditorDom()
  emitEditorValue()
  void nextTick(updateActiveState)
}

function applyFont(token: string): void {
  const option = RICH_TEXT_FONTS.find((font) => font.token === token)
  if (!option) return
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'false')
  // execCommand 需要具体字体族；default 用产品基础字体，归一化时再转回 default 令牌。
  document.execCommand('fontName', false, option.family || 'Noto Sans SC')
  afterCommand()
}

function applySize(size: number): void {
  if (!(RICH_TEXT_SIZES as readonly number[]).includes(size)) return
  restoreSelection()
  pendingSize = size
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand('fontSize', false, '7')
  normalizeEditorDom(size)
  pendingSize = null
  emitEditorValue()
  void nextTick(updateActiveState)
}

function applyColor(value: string): void {
  const color = normalizeColor(value)
  if (!color) return
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand('foreColor', false, color)
  afterCommand()
  colorOpen.value = false
}

function toggle(command: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(command)
  afterCommand()
}

/** 对齐/缩进令牌只挂在 p/div 上；列表项由列表自身样式承载。 */
function alignTargetBlock(): HTMLElement | null {
  const editor = editorRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return null
  let node: Node | null = selection.anchorNode
  while (node && node !== editor) {
    if (node.nodeType === 1) {
      const tag = (node as HTMLElement).tagName.toLowerCase()
      if (tag === 'p' || tag === 'div') return node as HTMLElement
    }
    node = node.parentNode
  }
  return null
}

function ensureAlignBlock(): HTMLElement | null {
  const existing = alignTargetBlock()
  if (existing) return existing
  // 裸文本行先格式化成块，才能承载 data-rt-align / data-rt-indent 令牌。
  document.execCommand('formatBlock', false, 'div')
  return alignTargetBlock()
}

function applyAlign(mode: 'left' | 'center' | 'right'): void {
  restoreSelection()
  const block = ensureAlignBlock()
  if (!block) return
  if (mode === 'left') block.removeAttribute('data-rt-align')
  else block.setAttribute('data-rt-align', mode)
  afterCommand()
}

function applyIndent(delta: 1 | -1): void {
  restoreSelection()
  const block = ensureAlignBlock()
  if (!block) return
  const current = Number(block.getAttribute('data-rt-indent') ?? '0')
  const next = Math.min(2, Math.max(0, current + delta))
  if (next <= 0) block.removeAttribute('data-rt-indent')
  else block.setAttribute('data-rt-indent', String(next))
  afterCommand()
}

function toggleList(kind: 'ul' | 'ol'): void {
  restoreSelection()
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList')
  afterCommand()
}

function onFontSelect(value: unknown): void {
  applyFont(String(value ?? 'default'))
}

function onSizeSelect(value: unknown): void {
  applySize(Number(value ?? 14))
}

function applyCustomColor(): void {
  applyColor(customColor.value)
}

/* ── 495:18680 颜色面板：430×286，饱和度/色相/色板/HEX ── */

const satRef = ref<HTMLElement | null>(null)
const hueRef = ref<HTMLElement | null>(null)
const panelHsv = ref({ h: 263, s: 76, v: 100 })

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const normalized = normalizeColor(hex)
  if (!normalized) return null
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : Math.round((delta / max) * 100), v: Math.round(max * 100) }
}

function hsvToHex(h: number, s: number, v: number): string {
  const sat = s / 100
  const val = v / 100
  const f = (n: number): number => {
    const k = (n + h / 60) % 6
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[f(5), f(3), f(1)]
    .map((part) =>
      Math.round(part * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`
}

const hueColor = computed(() => hsvToHex(panelHsv.value.h, 100, 100))
const satBackground = computed(
  () =>
    `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${hueColor.value})`,
)
const satPointerStyle = computed(() => ({
  left: `${panelHsv.value.s}%`,
  top: `${100 - panelHsv.value.v}%`,
}))

function syncCustomFromHsv(): void {
  customColor.value = hsvToHex(panelHsv.value.h, panelHsv.value.s, panelHsv.value.v)
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function startAreaDrag(
  event: PointerEvent,
  area: HTMLElement | null,
  apply: (xPercent: number, yPercent: number) => void,
): void {
  if (!area) return
  event.preventDefault()
  const rect = area.getBoundingClientRect()
  const move = (pointer: PointerEvent): void => {
    const x = clampPercent(((pointer.clientX - rect.left) / rect.width) * 100)
    const y = clampPercent(((pointer.clientY - rect.top) / rect.height) * 100)
    apply(x, y)
  }
  move(event)
  const stop = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function onSatPointerDown(event: PointerEvent): void {
  startAreaDrag(event, satRef.value, (x, y) => {
    panelHsv.value = { ...panelHsv.value, s: Math.round(x), v: Math.round(100 - y) }
    syncCustomFromHsv()
  })
}

function onHuePointerDown(event: PointerEvent): void {
  startAreaDrag(event, hueRef.value, (x) => {
    panelHsv.value = { ...panelHsv.value, h: Math.round(clampPercent(x) * 3.599) }
    syncCustomFromHsv()
  })
}

watch(colorOpen, (open) => {
  if (!open) return
  const hsv = hexToHsv(activeColor.value || customColor.value)
  if (hsv) panelHsv.value = hsv
})

/** 清除格式（参考 101:2 工具条 Tx）：仅移除字符格式与块令牌，保留文本。 */
function clearFormat(): void {
  restoreSelection()
  document.execCommand('removeFormat')
  const editor = editorRef.value
  if (editor) {
    for (const block of Array.from(editor.querySelectorAll('[data-rt-align], [data-rt-indent]'))) {
      block.removeAttribute('data-rt-align')
      block.removeAttribute('data-rt-indent')
    }
  }
  afterCommand()
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const html = event.clipboardData?.getData('text/html') ?? ''
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (html) {
    document.execCommand('insertHTML', false, sanitizeRichTextBody(html))
  } else if (text) {
    document.execCommand('insertText', false, text)
  }
  normalizeEditorDom()
  emitEditorValue()
}

function updateActiveState(): void {
  const editor = editorRef.value
  if (!editor) return
  try {
    boldActive.value = document.queryCommandState('bold')
    italicActive.value = document.queryCommandState('italic')
    underlineActive.value = document.queryCommandState('underline')
    strikeActive.value = document.queryCommandState('strikeThrough')
    ulActive.value = document.queryCommandState('insertUnorderedList')
    olActive.value = document.queryCommandState('insertOrderedList')
  } catch {
    // 部分环境不支持 queryCommandState：保持按钮原状态，不影响编辑。
  }
  const alignBlock = alignTargetBlock()
  activeAlign.value =
    (alignBlock?.getAttribute('data-rt-align') as 'left' | 'center' | 'right' | null) ?? 'left'
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  let node: Node | null = selection.anchorNode
  let font: string | null = null
  let size: string | null = null
  let color: string | null = null
  while (node && node !== editor) {
    if (node.nodeType === 1) {
      const element = node as HTMLElement
      font ??= element.getAttribute('data-rt-font')
      size ??= element.getAttribute('data-rt-size')
      color ??= element.getAttribute('data-rt-color')
    }
    node = node.parentNode
  }
  if (font) activeFont.value = font
  if (size) activeSize.value = Number(size)
  if (color) activeColor.value = color
}

function onFocus(): void {
  focused.value = true
  updateActiveState()
}

function onBlur(): void {
  // 失焦不主动转换格式：旧纯文本只有在真实 input/工具操作后才升级为新格式。
  focused.value = false
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!colorOpen.value) return
  const target = event.target as Node | null
  if (target && colorWrapRef.value?.contains(target)) return
  colorOpen.value = false
}

/* 495:18680（执行提示13）：颜色面板 430×286 随宿主锚定、边界内完整可见（fixed 定位防画布裁切）。 */
const colorPanelStyle = ref<{ position: 'fixed'; left: string; top: string } | null>(null)

function placeColorPanel(): void {
  const btn = colorWrapRef.value?.querySelector('.rt-tool--color') as HTMLElement | null
  if (!btn) return
  const r = btn.getBoundingClientRect()
  let left = r.left
  if (left + 430 > window.innerWidth - 8) left = window.innerWidth - 8 - 430
  let top = r.bottom + 6
  if (top + 286 > window.innerHeight - 8) top = Math.max(8, r.top - 286 - 6)
  colorPanelStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  }
}

function openColor(): void {
  saveSelection()
  colorOpen.value = !colorOpen.value
  if (colorOpen.value) void nextTick(placeColorPanel)
}

onMounted(() => {
  syncEditor()
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

watch(
  () => props.modelValue,
  () => {
    if (!focused.value) syncEditor()
  },
)
</script>

<template>
  <ReadonlyValue v-if="readonly && !readonlyRich" :plain="subField" multiline>{{
    String(modelValue ?? '') || '—'
  }}</ReadonlyValue>
  <div
    v-else-if="readonly"
    class="rt-readonly"
    :class="{ 'rt-readonly--sub': subField }"
    data-test="rich-text-readonly"
  >
    <SafeHtml class="rt-content" :html="readonlyValue" rich-text />
  </div>

  <div
    v-else
    class="rt-control"
    :class="{ 'rt-control--sub': subField, 'is-focused': focused }"
    data-test="rich-text-editor"
  >
    <div
      class="rt-toolbar"
      role="toolbar"
      :aria-label="t('form.richTextToolbar')"
      @mousedown="saveSelection"
    >
      <el-select
        class="rt-select"
        size="small"
        popper-class="rt-font-popper"
        :aria-label="t('form.richTextFont')"
        :model-value="activeFont"
        @update:model-value="onFontSelect"
      >
        <el-option
          v-for="font in fontOptions"
          :key="font.token"
          :label="font.label"
          :value="font.token"
        />
      </el-select>
      <el-select
        class="rt-select rt-select--size"
        size="small"
        popper-class="rt-size-popper"
        :aria-label="t('form.richTextSize')"
        :model-value="activeSize"
        @update:model-value="onSizeSelect"
      >
        <el-option v-for="size in sizeOptions" :key="size" :label="`${size} px`" :value="size" />
      </el-select>
      <div ref="colorWrapRef" class="rt-color-wrap">
        <button
          class="rt-tool rt-tool--color"
          type="button"
          :aria-label="t('form.richTextColor')"
          :aria-expanded="colorOpen"
          :style="{ color: activeColor }"
          @mousedown.prevent
          @click="openColor"
        >
          A
        </button>
        <div
          v-if="colorOpen"
          class="rt-colors"
          :style="colorPanelStyle ?? undefined"
          @mousedown.prevent
        >
          <p class="rt-colors__label">{{ t('appearance.presetColors') }}</p>
          <div class="rt-colors__swatches">
            <button
              v-for="color in colorOptions"
              :key="color.value"
              class="rt-swatch"
              type="button"
              :title="color.name"
              :aria-label="color.name"
              :style="{ background: color.value }"
              @mousedown.prevent
              @click="applyColor(color.value)"
            />
          </div>
          <div
            class="rt-colors__sat"
            :style="{ background: satBackground }"
            @pointerdown="onSatPointerDown"
          >
            <span class="rt-colors__pointer" :style="satPointerStyle" />
          </div>
          <div class="rt-colors__hue" @pointerdown="onHuePointerDown">
            <span
              class="rt-colors__pointer rt-colors__pointer--hue"
              :style="{ left: `${(panelHsv.h / 359.9) * 100}%` }"
            />
          </div>
          <div class="rt-colors__hex">
            <span class="rt-colors__hex-label">HEX</span>
            <input
              v-model="customColor"
              class="rt-colors__hex-input"
              type="text"
              maxlength="7"
              :aria-label="t('form.richTextCustomColor')"
              :placeholder="t('form.richTextCustomColor')"
              @keydown.enter.prevent="applyCustomColor"
            />
            <span class="rt-colors__preview" :style="{ background: customColor }" />
          </div>
        </div>
      </div>
      <button
        class="rt-tool"
        :class="{ 'is-active': boldActive }"
        type="button"
        :aria-label="t('form.richTextBold')"
        :aria-pressed="boldActive"
        @mousedown.prevent
        @click="toggle('bold')"
      >
        <strong>B</strong>
      </button>
      <button
        class="rt-tool"
        :class="{ 'is-active': italicActive }"
        type="button"
        :aria-label="t('form.richTextItalic')"
        :aria-pressed="italicActive"
        @mousedown.prevent
        @click="toggle('italic')"
      >
        <em>I</em>
      </button>
      <button
        class="rt-tool"
        :class="{ 'is-active': underlineActive }"
        type="button"
        :aria-label="t('form.richTextUnderline')"
        :aria-pressed="underlineActive"
        @mousedown.prevent
        @click="toggle('underline')"
      >
        <u>U</u>
      </button>
      <button
        class="rt-tool"
        :class="{ 'is-active': strikeActive }"
        type="button"
        :aria-label="t('form.richTextStrike')"
        :aria-pressed="strikeActive"
        @mousedown.prevent
        @click="toggle('strikeThrough')"
      >
        <s>S</s>
      </button>
      <span class="rt-sep" aria-hidden="true" />
      <button
        v-for="mode in ['left', 'center', 'right'] as const"
        :key="mode"
        class="rt-tool"
        :class="{ 'is-active': activeAlign === mode }"
        type="button"
        :aria-label="
          t(
            `form.richTextAlign${mode === 'left' ? 'Left' : mode === 'center' ? 'Center' : 'Right'}`,
          )
        "
        :aria-pressed="activeAlign === mode"
        @mousedown.prevent
        @click="applyAlign(mode)"
      >
        <span class="rt-icon" :class="`rt-icon--align-${mode}`"><i /><i /><i /></span>
      </button>
      <button
        class="rt-tool"
        type="button"
        :aria-label="t('form.richTextOutdent')"
        @mousedown.prevent
        @click="applyIndent(-1)"
      >
        <span class="rt-icon rt-icon--outdent"><i /><i /><i /></span>
      </button>
      <button
        class="rt-tool"
        type="button"
        :aria-label="t('form.richTextIndent')"
        @mousedown.prevent
        @click="applyIndent(1)"
      >
        <span class="rt-icon rt-icon--indent"><i /><i /><i /></span>
      </button>
      <button
        class="rt-tool"
        :class="{ 'is-active': ulActive }"
        type="button"
        :aria-label="t('form.richTextUnorderedList')"
        :aria-pressed="ulActive"
        @mousedown.prevent
        @click="toggleList('ul')"
      >
        <span class="rt-icon rt-icon--ul"><i /><i /><i /></span>
      </button>
      <button
        class="rt-tool"
        :class="{ 'is-active': olActive }"
        type="button"
        :aria-label="t('form.richTextOrderedList')"
        :aria-pressed="olActive"
        @mousedown.prevent
        @click="toggleList('ol')"
      >
        <span class="rt-icon rt-icon--ol"><i /><i /><i /></span>
      </button>
      <button
        class="rt-tool"
        type="button"
        :aria-label="t('form.richTextClear')"
        @mousedown.prevent
        @click="clearFormat"
      >
        <span class="rt-icon rt-icon--clear">Tx</span>
      </button>
      <span v-if="showCount" class="rt-count" :class="{ 'is-over': overLimit }">
        {{ visibleCount }}/{{ maxLength }}
      </span>
    </div>
    <div
      ref="editorRef"
      class="rt-editor"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="t('form.richTextPlaceholder')"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @paste="onPaste"
      @keyup="updateActiveState"
      @mouseup="updateActiveState"
    />
  </div>
</template>

<style scoped>
.rt-control {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  overflow: hidden;
}
.rt-control.is-focused {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sw-color-primary) 18%, transparent);
}
.rt-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  /* 参考 101:2：工具条行高 40，控件 28 */
  padding: 6px 8px;
  border-bottom: 1px solid var(--sw-border-light);
  background: var(--sw-surface-card);
}
.rt-select {
  width: 104px;
  height: 28px;
}
.rt-select--size {
  width: 78px;
}
.rt-toolbar .rt-select :deep(.el-select__wrapper) {
  box-sizing: border-box;
  min-height: 28px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}
.rt-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--sw-radius-sm);
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 13px;
  cursor: pointer;
}
.rt-tool:hover,
.rt-tool.is-active {
  background: var(--sw-color-primary-softer);
  color: var(--sw-color-primary);
}
.rt-color-wrap {
  position: relative;
  display: inline-flex;
}
.rt-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--sw-border-light);
}
.rt-icon {
  display: inline-flex;
  box-sizing: border-box;
  flex-direction: column;
  gap: 2px;
  width: 13px;
  padding-top: 1px;
}
.rt-icon i {
  position: relative;
  display: block;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
}
.rt-icon--align-left i:nth-child(2),
.rt-icon--align-right i:nth-child(2) {
  width: 70%;
}
.rt-icon--align-center i {
  margin: 0 auto;
}
.rt-icon--align-center i:nth-child(2) {
  width: 70%;
}
.rt-icon--align-right i {
  margin-left: auto;
}
.rt-icon--indent i:nth-child(n + 2),
.rt-icon--outdent i:nth-child(n + 2) {
  width: 72%;
}
.rt-icon--indent i {
  margin-left: 6px;
}
.rt-icon--indent i:first-child {
  margin-left: 0;
}
.rt-icon--outdent i:nth-child(n + 2) {
  margin-left: 6px;
}
.rt-icon--ul i,
.rt-icon--ol i {
  padding-left: 7px;
}
.rt-icon--ul i::before {
  position: absolute;
  top: -1px;
  left: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}
.rt-icon--ol i::before {
  position: absolute;
  top: -5px;
  left: 0;
  font-size: 8px;
  line-height: 8px;
  content: '1';
}
.rt-icon--ol i:nth-child(2)::before {
  content: '2';
}
.rt-icon--ol i:nth-child(3)::before {
  content: '3';
}
.rt-tool--color {
  border-bottom: 3px solid currentColor;
  font-weight: 600;
}
/* 495:18680：430×286 完整颜色面板（预设色板/饱和度/色相/HEX）。 */
.rt-colors {
  position: absolute;
  z-index: 30;
  top: 28px;
  left: 0;
  box-sizing: border-box;
  width: 430px;
  height: 286px;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
  box-shadow: var(--sw-shadow-card);
}
.rt-colors__label {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.rt-colors__swatches {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}
.rt-swatch {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 4px;
  cursor: pointer;
}
.rt-colors__sat {
  position: relative;
  width: 396px;
  height: 118px;
  margin-top: 18px;
  border-radius: 2px;
  cursor: crosshair;
}
.rt-colors__hue {
  position: relative;
  width: 396px;
  height: 8px;
  margin-top: 16px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    #f00 0%,
    #ff0 17%,
    #0f0 33%,
    #0ff 50%,
    #00f 67%,
    #f0f 83%,
    #f00 100%
  );
  cursor: pointer;
}
.rt-colors__pointer {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 2px rgb(0 0 0 / 45%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.rt-colors__pointer--hue {
  top: 50%;
}
.rt-colors__hex {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.rt-colors__hex-label {
  color: var(--sw-text-secondary);
  font-size: 14px;
  line-height: 22px;
}
.rt-colors__hex-input {
  box-sizing: border-box;
  width: 180px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-sm);
  font-size: 13px;
}
.rt-colors__preview {
  width: 28px;
  height: 28px;
  margin-left: auto;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 4px;
}
.rt-count {
  margin-left: auto;
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.rt-count.is-over {
  color: var(--sw-danger);
}
.rt-editor {
  box-sizing: border-box;
  min-height: 96px;
  padding: 8px 12px;
  outline: none;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rt-control--sub .rt-editor {
  min-height: 64px;
  padding: 6px 8px;
  font-size: 13px;
}
.rt-editor:empty::before {
  color: var(--sw-text-placeholder);
  content: attr(data-placeholder);
  pointer-events: none;
}
.rt-readonly {
  box-sizing: border-box;
  width: 100%;
  min-height: 70px;
  padding: 10px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}
.rt-readonly--sub {
  min-height: 60px;
  padding: 6px 8px;
}
.rt-content {
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.rt-readonly--sub .rt-content {
  font-size: 13px;
}
.rt-content :deep(p),
.rt-content :deep(div) {
  margin: 0 0 4px;
}
.rt-content :deep(p:last-child),
.rt-content :deep(div:last-child) {
  margin-bottom: 0;
}
.rt-content :deep(ul),
.rt-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
</style>

<style>
/* 495:18648/18663：字体 208×224（6 行 36）、字号 120×260（7 行 36）浮层。 */
/* 495:18648/18663（执行提示13）：含边框可见外框 208×224 / 120×260；选中面 #EFF6FF 文字蓝。 */
.rt-font-popper {
  box-sizing: border-box;
  width: 208px;
  height: 224px;
}
.rt-font-popper .el-select-dropdown {
  box-sizing: border-box;
  height: 222px;
  padding: 3px 0;
}
.rt-font-popper .el-select-dropdown__list {
  max-height: 216px;
  overflow-y: auto;
}
.rt-font-popper .el-select-dropdown__item {
  height: 36px;
  line-height: 36px;
}
.rt-font-popper .el-select-dropdown__item.is-hovering,
.rt-font-popper .el-select-dropdown__item:hover {
  background-color: #eff6ff;
}
.rt-font-popper .el-select-dropdown__item.is-selected {
  color: var(--sw-color-primary, #2563eb);
  background-color: #eff6ff;
}
.rt-size-popper {
  box-sizing: border-box;
  width: 120px;
  height: 260px;
}
.rt-size-popper .el-select-dropdown {
  box-sizing: border-box;
  height: 258px;
  padding: 3px 0;
}
.rt-size-popper .el-select-dropdown__list {
  max-height: 252px;
  overflow-y: auto;
}
.rt-size-popper .el-select-dropdown__item {
  height: 36px;
  line-height: 36px;
}
.rt-size-popper .el-select-dropdown__item.is-hovering,
.rt-size-popper .el-select-dropdown__item:hover {
  background-color: #eff6ff;
}
.rt-size-popper .el-select-dropdown__item.is-selected {
  color: var(--sw-color-primary, #2563eb);
  background-color: #eff6ff;
}
/* 受控令牌的固定样式（内容由 innerHTML 写入，scoped 选择器无法命中）。 */
.rt-editor [data-rt-font='default'] {
  font-family: var(--sw-font-family);
}
.rt-editor [data-rt-font='song'] {
  font-family: SimSun, 宋体, serif;
}
.rt-editor [data-rt-font='hei'] {
  font-family: SimHei, 黑体, sans-serif;
}
.rt-editor [data-rt-font='yahei'] {
  font-family: 'Microsoft YaHei', 微软雅黑, sans-serif;
}
.rt-editor [data-rt-font='arial'] {
  font-family: Arial, sans-serif;
}
.rt-editor [data-rt-font='times'] {
  font-family: 'Times New Roman', serif;
}
.rt-editor [data-rt-size='12'] {
  font-size: 12px;
}
.rt-editor [data-rt-size='14'] {
  font-size: 14px;
}
.rt-editor [data-rt-size='16'] {
  font-size: 16px;
}
.rt-editor [data-rt-size='18'] {
  font-size: 18px;
}
.rt-editor [data-rt-size='20'] {
  font-size: 20px;
}
.rt-editor [data-rt-size='24'] {
  font-size: 24px;
}
.rt-editor [data-rt-size='28'] {
  font-size: 28px;
}
.rt-editor [data-rt-color='#6F2DFF'] {
  color: #6f2dff;
}
.rt-editor [data-rt-color='#2563EB'] {
  color: #2563eb;
}
.rt-editor [data-rt-color='#0E8B8B'] {
  color: #0e8b8b;
}
.rt-editor [data-rt-color='#10805A'] {
  color: #10805a;
}
.rt-editor [data-rt-color='#D97706'] {
  color: #d97706;
}
.rt-editor [data-rt-color='#DC2626'] {
  color: #dc2626;
}
.rt-editor [data-rt-color='#DB2777'] {
  color: #db2777;
}
.rt-editor [data-rt-color='#64748B'] {
  color: #64748b;
}
.rt-editor [data-rt-align='center'] {
  text-align: center;
}
.rt-editor [data-rt-align='right'] {
  text-align: right;
}
.rt-editor [data-rt-indent='1'] {
  padding-left: 32px;
}
.rt-editor [data-rt-indent='2'] {
  padding-left: 64px;
}
</style>
