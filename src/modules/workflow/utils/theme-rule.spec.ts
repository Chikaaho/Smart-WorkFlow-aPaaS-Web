import { describe, it, expect } from 'vitest'
import {
  SEQ_DIGIT_OPTIONS,
  THEME_ELEMENT_DEFAULT_RAW,
  chipText,
  datePatternOf,
  escapeThemeText,
  expressionOf,
  parseRuleSegments,
  parseThemeElements,
  seqDigitsOf,
  seqToken,
  serializeThemeElements,
  themeElementError,
  themeElementKind,
  themeRuleDisplay,
  themeRulePreview,
  tokenLabelKey,
} from './theme-rule'
import type { ThemeElement } from './theme-rule'

/** 测试用翻译替身：直接回显 key，验证「变量 → 文案键」的映射与参数 */
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

describe('BF20261013-041/042 流程编号规则构建器', () => {
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
    expect(seqDigitsOf('{SEQ:5}')).toBe(5)
    expect(seqDigitsOf('{SEQ}')).toBe(0)
    expect(seqDigitsOf('{YYYYMMDD}')).toBeNull()
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

  // 0.1.7 #37：要素编排器模型（规则文本 ↔ 要素序列；新增日期/时间格式与自定义表达式要素）
  it('要素类型判定：日期/时间/流水号/发起人/自定义/历史记法/字面文字', () => {
    expect(themeElementKind('{DATE:yyyy-MM-dd}')).toBe('date')
    expect(themeElementKind('{TIME:HH:mm}')).toBe('time')
    expect(themeElementKind('{SEQ:3}')).toBe('seq')
    expect(themeElementKind('{INITIATOR}')).toBe('initiator')
    expect(themeElementKind('{EXPR:seq > 0}')).toBe('custom')
    expect(themeElementKind('{YYYYMMDD}')).toBe('legacy')
    expect(themeElementKind('OA-')).toBe('text')
  })

  it('要素序列往返：拆分（相邻文字合并）+ 序列化（字面量转义、变量原样）', () => {
    const rule = 'OA-{DATE:yyyyMMdd}-{SEQ:3}'
    const elements = parseThemeElements(rule)
    // 两个占位符之间的字面量「-」是独立常量要素（编排序即所见顺序）
    expect(elements.map((element) => element.kind)).toEqual(['text', 'date', 'text', 'seq'])
    expect(elements[1]!.raw).toBe('{DATE:yyyyMMdd}')
    expect(serializeThemeElements(elements)).toBe(rule)

    // 手写花括号（库内已转义）回显成字面文字，再序列化仍回到转义形态
    const escaped = parseThemeElements('单号{{临时}}')
    expect(escaped).toHaveLength(1)
    expect(escaped[0]!.raw).toBe('单号{临时}')
    expect(serializeThemeElements(escaped)).toBe('单号{{临时}}')
  })

  it('要素配置读取：日期/时间格式、自定义表达式、默认记法', () => {
    expect(datePatternOf('{DATE:yyMMdd}')).toBe('yyMMdd')
    expect(datePatternOf('{TIME:HHmmss}')).toBe('HHmmss')
    expect(datePatternOf('{YYYYMMDD}')).toBe('yyyyMMdd')
    expect(datePatternOf('{INITIATOR}')).toBeNull()
    expect(expressionOf('{EXPR:initiatorName seq}')).toBe('initiatorName seq')
    expect(expressionOf('{SEQ:3}')).toBeNull()
    expect(THEME_ELEMENT_DEFAULT_RAW.date).toBe('{DATE:yyyyMMdd}')
    expect(THEME_ELEMENT_DEFAULT_RAW.custom.startsWith('{EXPR:')).toBe(true)
  })

  it('示例预览（#37 新要素）：日期/时间按白名单格式输出，自定义表达式单变量显示演示值', () => {
    const now = new Date(2026, 9, 14, 9, 5, 7)
    expect(themeRulePreview('{DATE:yyyyMMdd}-{TIME:HHmmss}', now)).toBe('20261014-090507')
    expect(themeRulePreview('{DATE:yyyy-MM-dd}', now)).toBe('2026-10-14')
    expect(themeRulePreview('{DATE:yyyy-M-d}', now)).toBe('2026-10-14')
    expect(themeRulePreview('{TIME:HH:mm}', now)).toBe('09:05')
    // 单变量表达式显示演示值；复合表达式原样展示（真实值由服务端物化）
    expect(themeRulePreview('{EXPR:yyyy}{EXPR:MM}', now)).toBe('202610')
    expect(themeRulePreview('{EXPR:seq > 0}', now)).toBe('seq > 0')
  })

  it('要素级校验：空常量 / 空表达式 / 括号不成对报错，其余要素与合法表达式通过', () => {
    const make = (kind: ThemeElement['kind'], raw: string): ThemeElement => ({ id: 'x', kind, raw })
    expect(themeElementError(make('text', ''))).toBe('emptyText')
    expect(themeElementError(make('text', 'OA-'))).toBeNull()
    expect(themeElementError(make('custom', '{EXPR:   }'))).toBe('emptyExpression')
    expect(themeElementError(make('custom', '{EXPR:(seq > 0}'))).toBe('unbalancedParens')
    expect(themeElementError(make('custom', '{EXPR:seq > 0)}'))).toBe('unbalancedParens')
    expect(themeElementError(make('custom', '{EXPR:(seq > 0)}'))).toBeNull()
    expect(themeElementError(make('custom', '{EXPR:initiatorName}'))).toBeNull()
    // 非自定义要素不做表达式校验
    expect(themeElementError(make('seq', '{SEQ:3}'))).toBeNull()
    expect(themeElementError(make('legacy', '{TIMESTAMP}'))).toBeNull()
  })
})
