/**
 * BF20261013-041/042 流程编号（主题）规则构建器。
 *
 * 规则文法（与服务端 ProcessThemeService 白名单一致）：固定文字 + 变量
 * {YYYYMMDD} / {YYYYMMDDHHMMSS} / {TIMESTAMP} / {SEQ} / {SEQ:n}（n=1..10 左补零）/ {INITIATOR}。
 * BF20261013-042：用户手写的 {xxx} 一律按普通字符串处理——字面量花括号在保存时转义为
 * {{ / }}，回显时还原成普通文字；变量只能经按钮带入（标识在编辑框内以灰底文字展示）。
 * 本模块只做纯函数：变量按钮带入、位数拼装、示例预览、展示文案——页面不拼字符串、不背文法。
 */

/** 固定变量名（白名单）；SEQ 另按位数规则识别。 */
const FIXED_TOKENS = new Set(['TIMESTAMP', 'YYYYMMDD', 'YYYYMMDDHHMMSS', 'INITIATOR'])

/** 规则文本 → 编辑器/展示用的片段序列（固定文字 / 变量）。 */
export interface ThemeRuleSegment {
  kind: 'text' | 'token'
  /** text = 字面文字（已还原转义）；token = 变量记法（如 {SEQ:3}） */
  value: string
}

/** 保存时转义字面量花括号：用户手写的 {xxx} 落库后仍按普通字符串对待。 */
export function escapeThemeText(text: string): string {
  return text.replace(/\{/g, '{{').replace(/\}/g, '}}')
}

/** 指定位置是否为合法变量（{TIMESTAMP}/{YYYYMMDD}/{YYYYMMDDHHMMSS}/{SEQ}/{SEQ:n}/{INITIATOR}
 *  /{DATE:格式}/{TIME:格式}/{EXPR:表达式}，与后端 ProcessThemeService 白名单同源）。 */
function tokenAt(rule: string, index: number): string | null {
  if (rule[index] !== '{') return null
  const close = rule.indexOf('}', index + 1)
  if (close < 0) return null
  const body = rule.slice(index + 1, close)
  if (FIXED_TOKENS.has(body) || /^SEQ(?::\d{1,2})?$/.test(body)) return `{${body}}`
  if (/^DATE:[A-Za-z-]+$/.test(body) || /^TIME:[A-Za-z:]+$/.test(body)) return `{${body}}`
  if (body.startsWith('EXPR:')) return `{${body}}`
  return null
}

/**
 * 规则文本 → 片段序列（固定文字 / 变量），供输入框内「文字 + 灰底标识」混排回显。
 * {{ / }} 还原成字面量花括号；未识别的手写 {xxx} 按普通文字处理。
 */
export function parseRuleSegments(rule: string): ThemeRuleSegment[] {
  const segments: ThemeRuleSegment[] = []
  let text = ''
  const flush = () => {
    if (text) {
      segments.push({ kind: 'text', value: text })
      text = ''
    }
  }
  let i = 0
  while (i < rule.length) {
    if (rule.startsWith('{{', i)) {
      text += '{'
      i += 2
      continue
    }
    if (rule.startsWith('}}', i)) {
      text += '}'
      i += 2
      continue
    }
    const token = tokenAt(rule, i)
    if (token) {
      flush()
      segments.push({ kind: 'token', value: token })
      i += token.length
      continue
    }
    text += rule[i]
    i += 1
  }
  flush()
  return segments
}

/** 变量 → 文案键（回显成灰底文字标识时用）；未知记法返回 null。 */
export function tokenLabelKey(token: string): string | null {
  if (token === '{YYYYMMDD}') return 'workflow.themeRuleTokenDate'
  if (token === '{YYYYMMDDHHMMSS}') return 'common.startTimeShort'
  if (token === '{TIMESTAMP}') return 'workflow.themeRuleTokenTimestamp'
  if (token === '{INITIATOR}') return 'common.initiator'
  if (/^\{SEQ(?::\d{1,2})?\}$/.test(token)) return 'workflow.themeRuleTokenSeq'
  if (/^\{DATE:[A-Za-z-]+\}$/.test(token)) return 'workflow.themeRuleElementDate'
  if (/^\{TIME:[A-Za-z:]+\}$/.test(token)) return 'workflow.themeRuleElementTime'
  if (token.startsWith('{EXPR:')) return 'workflow.themeRuleElementCustom'
  return null
}

/**
 * 变量 → 输入框内灰底标识的文字（不含方括号，调用方加）。
 * 自增序号带上位数，避免 3 位与不补零看起来一样。
 */
export function chipText(
  token: string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  const seq = /^\{SEQ:(\d{1,2})\}$/.exec(token)
  if (seq) {
    return `${translate('workflow.themeRuleTokenSeq')} ${translate('workflow.themeRuleSeqDigits', {
      n: Number(seq[1]),
    })}`
  }
  const key = tokenLabelKey(token)
  return key ? translate(key) : token
}

/** 规则 → 列表/选择列表展示文字：变量显示成 [文案]，固定文字原样（隐藏占位记法）。 */
export function themeRuleDisplay(
  rule: string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  return parseRuleSegments(rule)
    .map((segment) =>
      segment.kind === 'token' ? `[${chipText(segment.value, translate)}]` : segment.value,
    )
    .join('')
}

/** 自增编号位数可选项（0 = 不补零）。 */
export const SEQ_DIGIT_OPTIONS = [0, 2, 3, 4, 5, 6] as const

/* ------------------------------------------------------------------ */
/* 0.1.7 #37：要素编排器模型（模拟编号 + 要素条 + 逐要素配置）             */
/* 规则文本仍是唯一真源：parse 出要素 → 编辑 → serialize 回规则文本。      */
/* ------------------------------------------------------------------ */

/** 要素类型：text=常量（字面文字）；legacy=历史固定记法（{TIMESTAMP} 等，只读保留）。 */
export type ThemeElementKind = 'text' | 'date' | 'time' | 'seq' | 'initiator' | 'custom' | 'legacy'

export interface ThemeElement {
  /** 渲染/选中用的稳定键（按序列位置派生，不落库） */
  id: string
  kind: ThemeElementKind
  /** 规则原文：text=未转义字面文字；其余=占位记法（如 {DATE:yyyy-MM-dd}） */
  raw: string
}

/** 日期格式白名单（与后端 ProcessThemeService.DATE_PATTERNS 逐项一致）。 */
export const THEME_DATE_FORMATS = [
  'yyyyMMdd',
  'yyMMdd',
  'yyyy-MM-dd',
  'yyyy-MM',
  'yyyy-M-d',
] as const

/** 时间格式白名单（与后端 TIME_PATTERNS 逐项一致）。 */
export const THEME_TIME_FORMATS = ['HHmmss', 'HH:mm:ss', 'HH:mm', 'H:mm'] as const

/** 自定义要素可读变量（与后端 expressionVariables 同名；只读、不执行脚本）。 */
export const THEME_EXPRESSION_VARIABLES = [
  'initiatorName',
  'initiatorId',
  'seq',
  'yyyy',
  'yy',
  'MM',
  'dd',
  'HH',
  'mm',
  'ss',
] as const

/** 新要素入条时的默认记法。 */
export const THEME_ELEMENT_DEFAULT_RAW: Record<
  Exclude<ThemeElementKind, 'text' | 'legacy'>,
  string
> = {
  date: '{DATE:yyyyMMdd}',
  time: '{TIME:HHmmss}',
  seq: '{SEQ:3}',
  initiator: '{INITIATOR}',
  custom: '{EXPR:initiatorName}',
}

/** 占位记法 → 要素类型（无法识别按字面文字处理）。 */
export function themeElementKind(raw: string): ThemeElementKind {
  if (raw === '{INITIATOR}') return 'initiator'
  if (/^\{SEQ(?::\d{1,2})?\}$/.test(raw)) return 'seq'
  if (/^\{DATE:[A-Za-z-]+\}$/.test(raw)) return 'date'
  if (/^\{TIME:[A-Za-z:]+\}$/.test(raw)) return 'time'
  if (raw.startsWith('{EXPR:') && raw.endsWith('}')) return 'custom'
  if (/^\{(TIMESTAMP|YYYYMMDD|YYYYMMDDHHMMSS)\}$/.test(raw)) return 'legacy'
  return 'text'
}

/** 规则文本 → 要素序列（相邻字面文字合并为一个常量要素）。 */
export function parseThemeElements(rule: string): ThemeElement[] {
  const elements: ThemeElement[] = []
  parseRuleSegments(rule).forEach((segment, index) => {
    elements.push({
      id: `el-${index}`,
      kind: segment.kind === 'text' ? 'text' : themeElementKind(segment.value),
      raw: segment.value,
    })
  })
  return elements
}

/** 要素序列 → 规则文本（字面量转义花括号；变量记法原样）。 */
export function serializeThemeElements(elements: ThemeElement[]): string {
  return elements
    .map((element) => (element.kind === 'text' ? escapeThemeText(element.raw) : element.raw))
    .join('')
}

/** {DATE:pattern} / 历史 {YYYYMMDD} 的格式串；无格式返回 null。 */
export function datePatternOf(raw: string): string | null {
  const matched = /^\{(?:DATE|TIME):([A-Za-z:-]+)\}$/.exec(raw)
  if (matched) return matched[1]
  if (raw === '{YYYYMMDD}') return 'yyyyMMdd'
  if (raw === '{YYYYMMDDHHMMSS}') return 'yyyyMMddHHmmss'
  return null
}

/** 自定义要素的表达式（非自定义返回 null）。 */
export function expressionOf(raw: string): string | null {
  if (!raw.startsWith('{EXPR:') || !raw.endsWith('}')) return null
  return raw.slice('{EXPR:'.length, -1)
}

/** 自增编号位数可选项（0 = 不补零）。 */
export function seqDigitsOf(raw: string): number | null {
  const matched = /^\{SEQ(?::(\d{1,2}))?\}$/.exec(raw)
  if (!matched) return null
  return matched[1] ? Number(matched[1]) : 0
}

/** 位数 → 自增序号占位符：0 为 {SEQ}，其余 {SEQ:n}。 */
export function seqToken(digits: number): string {
  return digits > 0 ? `{SEQ:${digits}}` : '{SEQ}'
}

/** 要素级问题（编排器的前置提示；服务端校验仍是权威）。 */
export type ThemeElementError = 'emptyText' | 'emptyExpression' | 'unbalancedParens'

/**
 * 单个要素是否可保存：常量不能为空、自定义表达式不能为空且括号成对
 * （与服务端 validateExpressionTokens 同口径；仅本地提示，保存以服务端为准）。
 */
export function themeElementError(element: ThemeElement): ThemeElementError | null {
  if (element.kind === 'text') return element.raw ? null : 'emptyText'
  if (element.kind !== 'custom') return null
  const expression = (expressionOf(element.raw) ?? '').trim()
  if (!expression) return 'emptyExpression'
  let depth = 0
  for (const char of expression) {
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth < 0) return 'unbalancedParens'
    }
  }
  return depth === 0 ? null : 'unbalancedParens'
}

function pad(value: number, digits: number): string {
  return digits > 0 ? String(value).padStart(digits, '0') : String(value)
}

/**
 * 规则示例：把变量替换成演示值（日期取当天、序号取 1、发起人取当前用户），
 * 让用户看到编号长什么样；手写文字原样保留（含手写的 {xxx}）。
 * 0.1.7 #37：{DATE:pattern}/{TIME:pattern} 按格式输出；{EXPR:表达式} 单变量（如 seq/yyyy）
 * 显示其演示值，其余表达式原样展示（前端不执行表达式，真实值由服务端物化）。
 */
export function themeRulePreview(rule: string, now: Date = new Date(), initiatorName = ''): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const ymd = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`
  const ymdhms = `${ymd}${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}T${two(
    now.getHours(),
  )}:${two(now.getMinutes())}:${two(now.getSeconds())}.000`
  return parseRuleSegments(rule)
    .map((segment) => {
      if (segment.kind === 'text') return segment.value
      const token = segment.value
      if (token === '{YYYYMMDD}') return ymd
      if (token === '{YYYYMMDDHHMMSS}') return ymdhms
      if (token === '{TIMESTAMP}') return stamp
      if (token === '{INITIATOR}') return initiatorName
      const seq = /^\{SEQ(?::(\d{1,2}))?\}$/.exec(token)
      if (seq) return pad(1, seq[1] ? Number(seq[1]) : 0)
      const format = /^\{(?:DATE|TIME):([A-Za-z:-]+)\}$/.exec(token)
      if (format) return formatDateTimePattern(format[1], now)
      const expression = expressionOf(token)
      if (expression !== null) return expressionPreview(expression, now, initiatorName)
      return token
    })
    .join('')
}

/** 白名单格式串 → 演示值（未知格式原样返回，避免预览抛错）。 */
function formatDateTimePattern(pattern: string, now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const map: Record<string, string> = {
    yyyyMMdd: `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`,
    yyyyMMddHHmmss: `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}${two(
      now.getHours(),
    )}${two(now.getMinutes())}${two(now.getSeconds())}`,
    yyMMdd: `${two(now.getFullYear() % 100)}${two(now.getMonth() + 1)}${two(now.getDate())}`,
    'yyyy-MM-dd': `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`,
    'yyyy-MM': `${now.getFullYear()}-${two(now.getMonth() + 1)}`,
    'yyyy-M-d': `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`,
    HHmmss: `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`,
    'HH:mm:ss': `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,
    'HH:mm': `${two(now.getHours())}:${two(now.getMinutes())}`,
    'H:mm': `${now.getHours()}:${two(now.getMinutes())}`,
  }
  return map[pattern] ?? pattern
}

/** 表达式演示值：单变量互换成演示值（与后端 expressionVariables 同名），其余原样展示。 */
function expressionPreview(expression: string, now: Date, initiatorName: string): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const samples: Record<string, string> = {
    initiatorName,
    initiatorId: '1',
    seq: '1',
    yyyy: String(now.getFullYear()),
    yy: two(now.getFullYear() % 100),
    MM: two(now.getMonth() + 1),
    dd: two(now.getDate()),
    HH: two(now.getHours()),
    mm: two(now.getMinutes()),
    ss: two(now.getSeconds()),
  }
  const bare = expression.trim()
  return bare in samples ? samples[bare] : expression
}
