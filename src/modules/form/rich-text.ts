import DOMPurify from 'dompurify'

/**
 * RICH_TEXT 唯一编码契约（direction-ui-semantics-020 / direction-ui-completion-020）：
 * - 新值 = 前缀 `<!--sw-rt:1-->` + 受控 HTML；
 * - 旧值无前缀 → 纯文本，展示/编辑均不按 HTML 解释；
 * - 受控字号/字体/颜色只用 data-rt-* 令牌；基础排版 = 加粗/斜体/下划线/删除线(s)、
 *   有序/无序列表(ul/ol/li)、对齐与缩进(p/div 的 data-rt-align / data-rt-indent)；
 *   服务端按同一令牌白名单复核。
 */
export const RICH_TEXT_PREFIX = '<!--sw-rt:1-->'

export const RICH_TEXT_FONTS = [
  { token: 'default', label: '默认字体', family: '' },
  { token: 'song', label: '宋体', family: 'SimSun, 宋体, serif' },
  { token: 'hei', label: '黑体', family: 'SimHei, 黑体, sans-serif' },
  { token: 'yahei', label: '微软雅黑', family: '"Microsoft YaHei", 微软雅黑, sans-serif' },
  { token: 'arial', label: 'Arial', family: 'Arial, sans-serif' },
  { token: 'times', label: 'Times New Roman', family: '"Times New Roman", serif' },
] as const

export const RICH_TEXT_SIZES = [12, 14, 16, 18, 20, 24, 28] as const

/** 设计 495:18680 的 8 个预设色；自定义仅接受 #RRGGBB。 */
export const RICH_TEXT_COLORS = [
  { name: '紫', value: '#6F2DFF' },
  { name: '蓝', value: '#2563EB' },
  { name: '青', value: '#0E8B8B' },
  { name: '绿', value: '#10805A' },
  { name: '橙', value: '#D97706' },
  { name: '红', value: '#DC2626' },
  { name: '粉', value: '#DB2777' },
  { name: '灰', value: '#64748B' },
] as const

export const RICH_TEXT_ALIGNS = ['left', 'center', 'right'] as const
export const RICH_TEXT_INDENTS = [0, 1, 2] as const
/** 缩进一档的渲染宽度（px），编辑器与只读态共用。 */
export const RICH_TEXT_INDENT_PX = 32

const FONT_TOKENS = new Set<string>(RICH_TEXT_FONTS.map((font) => font.token))
const SIZE_TOKENS = new Set<string>(RICH_TEXT_SIZES.map(String))
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const ALIGN_TOKENS = new Set<string>(RICH_TEXT_ALIGNS)
const INDENT_TOKENS = new Set<string>(RICH_TEXT_INDENTS.map(String))
const ALLOWED_TAGS = [
  'p',
  'div',
  'br',
  'span',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
]
const ALLOWED_ATTR = ['data-rt-font', 'data-rt-size', 'data-rt-color']
/** 仅输入容错：粘贴里的 del/strike 先放行，随后统一转成受控 s 标签。 */
const INPUT_TOLERANCE_TAGS = ['del', 'strike']
/** 对齐/缩进令牌只允许挂在块级 p/div 上；li 的对齐由列表自身样式决定。 */
const BLOCK_TAGS = ['p', 'div']

export function isRichText(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(RICH_TEXT_PREFIX)
}

export function richTextBody(value: unknown): string {
  return isRichText(value) ? value.slice(RICH_TEXT_PREFIX.length) : ''
}

function normalizeColor(value: string): string {
  return value.toUpperCase()
}

function validDataAttr(name: string, value: string): boolean {
  if (name === 'data-rt-font') return FONT_TOKENS.has(value)
  if (name === 'data-rt-size') return SIZE_TOKENS.has(value)
  if (name === 'data-rt-color') return COLOR_RE.test(value)
  if (name === 'data-rt-align') return ALIGN_TOKENS.has(value)
  if (name === 'data-rt-indent') return INDENT_TOKENS.has(value)
  return false
}

/** 块级令牌归一：left/0 是默认值，不落库；其余保留受控值。 */
function normalizeBlockAttr(name: string, value: string): string | null {
  if (!validDataAttr(name, value)) return null
  if (name === 'data-rt-align' && value === 'left') return null
  if (name === 'data-rt-indent' && value === '0') return null
  return value
}

/**
 * 客户端清洗：只保留受控标签/令牌，剥离脚本、事件属性、样式、链接和外部内容。
 * 服务端仍会独立复核，不能把这里当作唯一安全边界。
 */
export function sanitizeRichTextBody(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, ...INPUT_TOLERANCE_TAGS],
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true,
  })
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html')
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase()
    if (tag === 'del' || tag === 'strike') {
      // 删除线统一受控 s 标签，历史 del/strike 来源（粘贴/旧浏览器）同口径。
      const replacement = doc.createElement('s')
      replacement.append(...Array.from(element.childNodes))
      element.replaceWith(replacement)
      continue
    }
    if (tag !== 'span' && !BLOCK_TAGS.includes(tag)) {
      for (const attr of Array.from(element.attributes)) {
        if (attr.name.startsWith('data-rt-')) element.removeAttribute(attr.name)
      }
      continue
    }
    if (tag === 'span') {
      for (const attr of Array.from(element.attributes)) {
        if (!validDataAttr(attr.name, attr.value)) element.removeAttribute(attr.name)
        else if (attr.name === 'data-rt-color')
          element.setAttribute(attr.name, normalizeColor(attr.value))
      }
    } else {
      for (const attr of Array.from(element.attributes)) {
        const normalized = normalizeBlockAttr(attr.name, attr.value)
        if (normalized === null) element.removeAttribute(attr.name)
        else element.setAttribute(attr.name, normalized)
      }
    }
    if (element.attributes.length === 0 && tag === 'span') {
      element.replaceWith(...Array.from(element.childNodes))
    }
  }
  for (const element of Array.from(doc.body.querySelectorAll('span'))) {
    if (!element.textContent && element.children.length === 0) element.remove()
  }
  return doc.body.innerHTML
}

/** 用户可见文本：标签不计数，`<br>`/块级边界按换行计。 */
export function visibleTextFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const parts: string[] = []
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        parts.push(child.textContent ?? '')
        continue
      }
      if (child.nodeType !== 1) continue
      const element = child as Element
      const tag = element.tagName.toLowerCase()
      if (tag === 'br') {
        parts.push('\n')
        continue
      }
      const block = tag === 'p' || tag === 'div' || tag === 'li'
      // 只在块与块之间补换行，末尾不额外补；单段正文的长度即真实字数。
      if (block && parts.length && !parts[parts.length - 1].endsWith('\n')) parts.push('\n')
      walk(element)
    }
  }
  walk(doc.body)
  return parts.join('')
}

/** RICH_TEXT 与旧纯文本统一取可见文本；旧值原样返回。 */
export function richTextVisibleText(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  return isRichText(text) ? visibleTextFromHtml(richTextBody(text)) : text
}

/** 编辑器提交值：空正文归一为 ''，有正文则带格式前缀。 */
export function serializeRichText(html: string): string {
  const clean = sanitizeRichTextBody(html)
  if (!visibleTextFromHtml(clean).trim()) return ''
  return `${RICH_TEXT_PREFIX}${clean}`
}

/** 只读/历史渲染：令牌转固定内联样式，返回已清洗 HTML。 */
export function renderRichTextHtml(value: unknown): string {
  const clean = sanitizeRichTextBody(richTextBody(value))
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html')
  for (const span of Array.from(doc.body.querySelectorAll('span'))) {
    const font = span.getAttribute('data-rt-font')
    const fontOption = RICH_TEXT_FONTS.find((option) => option.token === font)
    if (fontOption) {
      span.style.fontFamily = fontOption.family || 'var(--sw-font-family)'
    }
    const size = span.getAttribute('data-rt-size')
    if (size && SIZE_TOKENS.has(size)) span.style.fontSize = `${size}px`
    const color = span.getAttribute('data-rt-color')
    if (color && COLOR_RE.test(color)) span.style.color = color
    span.removeAttribute('data-rt-font')
    span.removeAttribute('data-rt-size')
    span.removeAttribute('data-rt-color')
  }
  for (const block of Array.from(doc.body.querySelectorAll<HTMLElement>('p, div'))) {
    const align = block.getAttribute('data-rt-align')
    if (align && ALIGN_TOKENS.has(align)) block.style.textAlign = align
    const indent = block.getAttribute('data-rt-indent')
    if (indent && INDENT_TOKENS.has(indent)) {
      block.style.marginLeft = `${Number(indent) * RICH_TEXT_INDENT_PX}px`
    }
    block.removeAttribute('data-rt-align')
    block.removeAttribute('data-rt-indent')
  }
  return doc.body.innerHTML
}

/** 编辑器初始内容：旧纯文本按文字转义，不把尖括号当 HTML。 */
export function editorHtmlForValue(value: unknown): string {
  if (isRichText(value)) return sanitizeRichTextBody(richTextBody(value))
  return escapePlainText(String(value ?? ''))
}

export function escapePlainText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replace(/\r?\n/g, '<br>')
}
