/**
 * BF20261013-041/042 流程编号（主题）规则构建器。
 *
 * 规则文法（与服务端 ProcessThemeService 白名单一致）：固定文字 + 变量
 * {YYYYMMDD} / {YYYYMMDDHHMMSS} / {TIMESTAMP} / {SEQ} / {SEQ:n}（n=1..10 左补零）/ {INITIATOR}。
 * BF20261013-042：用户手写的 {xxx} 一律按普通字符串处理——字面量花括号在保存时转义为
 * {{ / }}，回显时还原成普通文字；变量只能经按钮带入（标识在编辑框内以灰底文字展示）。
 * 本模块只做纯函数：变量按钮带入、位数拼装、示例预览、展示文案——页面不拼字符串、不背文法。
 */

/** 固定变量按钮（不含自增序号：序号要带位数选择）。 */
export interface ThemeRuleToken {
  /** 稳定键（按钮 key） */
  key: 'date' | 'dateTime' | 'timestamp' | 'initiator'
  /** 按钮文案 i18n key */
  labelKey: string
  /** 插入规则的占位符 */
  token: string
}

export const THEME_RULE_TOKENS: ThemeRuleToken[] = [
  // 发起时间复用既有文案键（同一文案一个键：common.startTimeShort = 「发起时间」）
  { key: 'date', labelKey: 'workflow.themeRuleTokenDate', token: '{YYYYMMDD}' },
  { key: 'dateTime', labelKey: 'common.startTimeShort', token: '{YYYYMMDDHHMMSS}' },
  { key: 'timestamp', labelKey: 'workflow.themeRuleTokenTimestamp', token: '{TIMESTAMP}' },
  // 发起人复用既有文案键（同一文案一个键：common.initiator = 「发起人」）
  { key: 'initiator', labelKey: 'common.initiator', token: '{INITIATOR}' },
]

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

/** 指定位置是否为合法变量（{TIMESTAMP}/{YYYYMMDD}/{YYYYMMDDHHMMSS}/{SEQ}/{SEQ:n}/{INITIATOR}）。 */
function tokenAt(rule: string, index: number): string | null {
  if (rule[index] !== '{') return null
  const close = rule.indexOf('}', index + 1)
  if (close < 0) return null
  const body = rule.slice(index + 1, close)
  if (FIXED_TOKENS.has(body) || /^SEQ(?::\d{1,2})?$/.test(body)) return `{${body}}`
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

/** 位数 → 自增序号占位符：0 为 {SEQ}，其余 {SEQ:n}。 */
export function seqToken(digits: number): string {
  return digits > 0 ? `{SEQ:${digits}}` : '{SEQ}'
}

/** 规则里的自增位数（供位数选择回显）；没有自增序号返回 null。 */
export function seqDigitsFromRule(rule: string): number | null {
  for (const segment of parseRuleSegments(rule)) {
    if (segment.kind !== 'token') continue
    const matched = /^\{SEQ(?::(\d{1,2}))?\}$/.exec(segment.value)
    if (matched) return matched[1] ? Number(matched[1]) : 0
  }
  return null
}

function pad(value: number, digits: number): string {
  return digits > 0 ? String(value).padStart(digits, '0') : String(value)
}

/**
 * 规则示例：把变量替换成演示值（日期取当天、序号取 1、发起人取当前用户），
 * 让用户看到编号长什么样；手写文字原样保留（含手写的 {xxx}）。
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
      return token
    })
    .join('')
}
