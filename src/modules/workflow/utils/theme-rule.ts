/**
 * BF20261013-041 流程编号（主题）规则构建器。
 *
 * 规则文法（与服务端 ProcessThemeService 白名单一致）：
 * 固定文字 + 变量 {YYYYMMDD} / {YYYYMMDDHHMMSS} / {TIMESTAMP} / {SEQ} / {SEQ:n}（n=1..10 左补零）。
 * 本模块只做纯函数：变量按钮的插入位置、自增位数拼装、示例预览——页面不拼字符串、不背文法。
 */

/** 固定变量按钮（不含自增序号：序号要带位数选择）。 */
export interface ThemeRuleToken {
  /** 稳定键（按钮 key） */
  key: 'date' | 'dateTime' | 'timestamp'
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
]

/** 已识别变量（白名单）匹配：与规则回显/示例拆分共用一套口径。 */
const KNOWN_TOKEN = /\{(?:TIMESTAMP|YYYYMMDDHHMMSS|YYYYMMDD|SEQ(?::\d{1,2})?)\}/g

/** 变量 → 文案键（回显成灰底文字标识时用）；未知记法返回 null。 */
export function tokenLabelKey(token: string): string | null {
  if (token === '{YYYYMMDD}') return 'workflow.themeRuleTokenDate'
  if (token === '{YYYYMMDDHHMMSS}') return 'common.startTimeShort'
  if (token === '{TIMESTAMP}') return 'workflow.themeRuleTokenTimestamp'
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

/** 规则文本 → 片段序列（固定文字 / 变量），供输入框内「文字 + 灰底标识」混排回显。 */
export function parseRuleSegments(rule: string): Array<{ kind: 'text' | 'token'; value: string }> {
  const segments: Array<{ kind: 'text' | 'token'; value: string }> = []
  let last = 0
  for (const match of rule.matchAll(KNOWN_TOKEN)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ kind: 'text', value: rule.slice(last, start) })
    segments.push({ kind: 'token', value: match[0] })
    last = start + match[0].length
  }
  if (last < rule.length) segments.push({ kind: 'text', value: rule.slice(last) })
  return segments
}

/** 自增编号位数可选项（0 = 不补零）。 */
export const SEQ_DIGIT_OPTIONS = [0, 2, 3, 4, 5, 6] as const

/** 位数 → 自增序号占位符：0 为 {SEQ}，其余 {SEQ:n}。 */
export function seqToken(digits: number): string {
  return digits > 0 ? `{SEQ:${digits}}` : '{SEQ}'
}

function pad(value: number, digits: number): string {
  return digits > 0 ? String(value).padStart(digits, '0') : String(value)
}

/**
 * 规则示例：把占位符替换成演示值（日期取当天、序号取 1），让用户看到编号长什么样。
 * 非白名单占位符原样保留（保存时服务端会拒绝）。
 */
export function themeRulePreview(rule: string, now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const ymd = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`
  const ymdhms = `${ymd}${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}T${two(
    now.getHours(),
  )}:${two(now.getMinutes())}:${two(now.getSeconds())}.000`
  return rule
    .replace(/\{YYYYMMDDHHMMSS\}/g, ymdhms)
    .replace(/\{YYYYMMDD\}/g, ymd)
    .replace(/\{TIMESTAMP\}/g, stamp)
    .replace(/\{SEQ:(\d{1,2})\}/g, (_match, digits: string) => pad(1, Number(digits)))
    .replace(/\{SEQ\}/g, '1')
}
