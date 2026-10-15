import { describe, it, expect } from 'vitest'
import {
  THEME_RULE_TOKENS,
  SEQ_DIGIT_OPTIONS,
  chipText,
  escapeThemeText,
  parseRuleSegments,
  seqDigitsFromRule,
  seqToken,
  themeRuleDisplay,
  themeRulePreview,
  tokenLabelKey,
} from './theme-rule'

/** 测试用翻译替身：直接回显 key，验证「变量 → 文案键」的映射与参数 */
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

describe('BF20261013-041/042 流程编号规则构建器', () => {
  it('变量按钮：发起日期/发起时间/时间戳/发起人四个固定变量（服务端白名单内的写法）', () => {
    expect(THEME_RULE_TOKENS.map((t) => t.token)).toEqual([
      '{YYYYMMDD}',
      '{YYYYMMDDHHMMSS}',
      '{TIMESTAMP}',
      '{INITIATOR}',
    ])
    // 发起时间/发起人复用既有文案键（同一文案一个键）
    expect(THEME_RULE_TOKENS[1].labelKey).toBe('common.startTimeShort')
    expect(THEME_RULE_TOKENS[3].labelKey).toBe('common.initiator')
  })

  it('自增序号：位数 0 为不补零，其余拼成 {SEQ:n}；可选项含 2-6 位', () => {
    expect(seqToken(0)).toBe('{SEQ}')
    expect(seqToken(3)).toBe('{SEQ:3}')
    expect(SEQ_DIGIT_OPTIONS).toContain(3)
    expect(SEQ_DIGIT_OPTIONS).toContain(0)
  })

  it('变量 → 文案键：白名单内五类可识别，未知记法返回 null', () => {
    expect(tokenLabelKey('{YYYYMMDD}')).toBe('workflow.themeRuleTokenDate')
    expect(tokenLabelKey('{YYYYMMDDHHMMSS}')).toBe('common.startTimeShort')
    expect(tokenLabelKey('{TIMESTAMP}')).toBe('workflow.themeRuleTokenTimestamp')
    expect(tokenLabelKey('{INITIATOR}')).toBe('common.initiator')
    expect(tokenLabelKey('{SEQ}')).toBe('workflow.themeRuleTokenSeq')
    expect(tokenLabelKey('{SEQ:4}')).toBe('workflow.themeRuleTokenSeq')
    expect(tokenLabelKey('{FOO}')).toBeNull()
  })

  it('灰底标识文字：自增序号带位数，其余取文案；未知记法原样', () => {
    expect(chipText('{SEQ:3}', translate)).toBe(
      'workflow.themeRuleTokenSeq workflow.themeRuleSeqDigits:{"n":3}',
    )
    expect(chipText('{YYYYMMDD}', translate)).toBe('workflow.themeRuleTokenDate')
    expect(chipText('{INITIATOR}', translate)).toBe('common.initiator')
    expect(chipText('{FOO}', translate)).toBe('{FOO}')
  })

  it('规则拆段：固定文字与变量交替（供输入框内文字 + 灰底标识混排回显）', () => {
    expect(parseRuleSegments('JRZX_{YYYYMMDDHHMMSS}_的流程_{SEQ:3}')).toEqual([
      { kind: 'text', value: 'JRZX_' },
      { kind: 'token', value: '{YYYYMMDDHHMMSS}' },
      { kind: 'text', value: '_的流程_' },
      { kind: 'token', value: '{SEQ:3}' },
    ])
    // 只有文字 / 空规则 / 未知记法按文字处理
    expect(parseRuleSegments('OA')).toEqual([{ kind: 'text', value: 'OA' }])
    expect(parseRuleSegments('')).toEqual([])
    expect(parseRuleSegments('{FOO}')).toEqual([{ kind: 'text', value: '{FOO}' }])
  })

  it('BF042 手写花括号：保存转义 {{ }}，回显仍是普通文字（不被当成变量）', () => {
    expect(escapeThemeText('单号{临时}')).toBe('单号{{临时}}')
    // 转义串回显为字面文字，且相邻片段合并
    expect(parseRuleSegments('A{{B}}C')).toEqual([{ kind: 'text', value: 'A{B}C' }])
    // 手写 {SEQ} 被转义后仍是文字；按钮带入的 {SEQ} 才是变量
    expect(parseRuleSegments('{{SEQ}}')).toEqual([{ kind: 'text', value: '{SEQ}' }])
    expect(parseRuleSegments('{SEQ}')).toEqual([{ kind: 'token', value: '{SEQ}' }])
  })

  it('自增位数回显：{SEQ:n} → n，{SEQ} → 0，无自增序号 → null', () => {
    expect(seqDigitsFromRule('P{SEQ:5}')).toBe(5)
    expect(seqDigitsFromRule('P{SEQ}')).toBe(0)
    expect(seqDigitsFromRule('P{YYYYMMDD}')).toBeNull()
    // 转义后的字面 {SEQ} 不算自增序号
    expect(seqDigitsFromRule('P{{SEQ}}')).toBeNull()
  })

  it('列表展示文字：变量显示成 [文案]，不暴露占位记法', () => {
    // 文案键在替身里回显为 key，这里只验证形状与转义还原
    expect(themeRuleDisplay('JRZX_{SEQ:3}', translate)).toBe(
      'JRZX_[workflow.themeRuleTokenSeq workflow.themeRuleSeqDigits:{"n":3}]',
    )
    expect(themeRuleDisplay('单号{{临时}}', translate)).toBe('单号{临时}')
  })

  it('示例预览：变量替换成演示值（日期取当天、序号 1 按位数补零、发起人取当前用户），手写文字原样', () => {
    const now = new Date(2026, 9, 14, 9, 5, 7)
    expect(themeRulePreview('{YYYYMMDD}-{SEQ:3}', now)).toBe('20261014-001')
    expect(themeRulePreview('{YYYYMMDDHHMMSS}', now)).toBe('20261014090507')
    expect(themeRulePreview('OA-{SEQ}', now)).toBe('OA-1')
    expect(themeRulePreview('{TIMESTAMP}', now)).toBe('2026-10-14T09:05:07.000')
    expect(themeRulePreview('{INITIATOR}', now, '系统管理员')).toBe('系统管理员')
    // 手写 {FOO} / 转义后的字面花括号都原样显示
    expect(themeRulePreview('{FOO}', now)).toBe('{FOO}')
    expect(themeRulePreview('单号{{临时}}', now)).toBe('单号{临时}')
  })
})
