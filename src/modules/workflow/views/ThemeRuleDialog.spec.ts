import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

/**
 * ThemeRuleDialog 单测（0.1.7 #37 要素编排器重构）。
 *
 * 覆盖 Owner 口径：
 *   - 打开按规则回显成要素条（类型 + 演示值），模拟编号实时更新；
 *   - 要素按钮追加要素、删除/清空、选中后按类型配置（常量文字 / 日期格式 / 时间格式 /
 *     流水号长度 / 自定义表达式 + 变量点选）；
 *   - 保存把要素序列序列化回规则文本（字面量转义、变量记法原样）；
 *   - 空规则保存被拦下（必填提示，不请求接口）。
 */

vi.mock('@/modules/workflow/api', () => ({
  getProcessDefThemeRule: vi.fn(),
  updateProcessDefThemeRule: vi.fn(),
}))

import { getProcessDefThemeRule, updateProcessDefThemeRule } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import ThemeRuleDialog from './ThemeRuleDialog.vue'

const stubs = {
  'el-dialog': {
    template: '<div class="el-dialog"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title'],
  },
  'el-button': {
    emits: ['click'],
    template:
      '<button class="el-button" :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
    props: ['disabled', 'size'],
  },
  // 选择器桩：把选项渲染出来并把 update:modelValue 交给父组件
  'el-select': {
    template: '<div class="el-select"><slot/></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-option': { template: '<div class="el-option"/>', props: ['label', 'value'] },
  'el-input': {
    template:
      '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'maxlength', 'placeholder'],
    emits: ['update:modelValue'],
  },
}

const def: ProcessDef = {
  id: 9,
  processKey: 'bpm_test',
  name: '测试流程',
  formKey: 'test_form',
  defVersion: 1,
  status: 'DRAFT',
  createTime: '2026-10-14 10:00:00',
  updateTime: '2026-10-14 10:00:00',
}

function mountDialog() {
  return mount(ThemeRuleDialog, {
    props: { visible: false, def },
    global: { stubs, plugins: [createPinia()] },
  })
}

async function openDialog(wrapper: ReturnType<typeof mountDialog>) {
  await wrapper.setProps({ visible: true })
  await flushPromises()
  await nextTick()
}

/** 要素条上的 (类型, 原文, 演示值)。 */
function chipFacts(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('[data-testid="theme-element-chip"]').map((chip) => ({
    kind: chip.attributes('data-kind'),
    raw: chip.attributes('data-raw'),
    value: chip.find('.theme-dialog__chip-value').text(),
  }))
}

function previewText(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.find('[data-testid="theme-preview"]').text()
}

describe('ThemeRuleDialog（#37 要素编排器）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('打开回显：规则拆成要素条，模拟编号实时展示', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('JRZX_{SEQ:3}')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    const chips = chipFacts(wrapper)
    expect(chips.map((chip) => chip.kind)).toEqual(['text', 'seq'])
    expect(chips[0]!.raw).toBe('JRZX_')
    expect(chips[1]!.raw).toBe('{SEQ:3}')
    expect(previewText(wrapper)).toContain('JRZX_001')
  })

  it('要素按钮：日期/时间/流水号/常量/发起人/自定义可追加，选中后按类型配置', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    expect(wrapper.find('[data-testid="theme-element-config"]').exists()).toBe(false)
    for (const kind of ['date', 'time', 'seq', 'text', 'initiator', 'custom']) {
      await wrapper.find(`[data-testid="theme-element-add-${kind}"]`).trigger('click')
    }
    const chips = chipFacts(wrapper)
    expect(chips.map((chip) => chip.kind)).toEqual([
      'date',
      'time',
      'seq',
      'text',
      'initiator',
      'custom',
    ])
    // 新要素默认记法：与后端白名单格式一致
    expect(chips[0]!.raw).toBe('{DATE:yyyyMMdd}')
    expect(chips[1]!.raw).toBe('{TIME:HHmmss}')
    expect(chips[3]!.raw).toBe('')

    // 选中常量（第 4 个）→ 编辑文字：模拟编号与要素条同步
    await wrapper.findAll('[data-testid="theme-element-chip"]')[3]!.trigger('click')
    await wrapper.find('[data-testid="theme-element-text"]').setValue('OA-')
    expect(chipFacts(wrapper)[3]!.raw).toBe('OA-')
    expect(previewText(wrapper)).toContain('OA-')

    // 选中自定义（第 6 个）→ 表达式可编辑、点变量追加
    await wrapper.findAll('[data-testid="theme-element-chip"]')[5]!.trigger('click')
    expect(wrapper.find('[data-testid="theme-element-expression"]').exists()).toBe(true)
    await wrapper.find('[data-testid="theme-var-seq"]').trigger('click')
    expect(chipFacts(wrapper)[5]!.raw).toBe('{EXPR:initiatorName seq}')
    // 已在表达式里的变量再点一次不重复叠加
    await wrapper.find('[data-testid="theme-var-seq"]').trigger('click')
    expect(chipFacts(wrapper)[5]!.raw).toBe('{EXPR:initiatorName seq}')
  })

  it('删除/前移后移/清空：要素条与规则同步', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('A{SEQ:3}')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    // 选中常量后前移/后移
    await wrapper.findAll('[data-testid="theme-element-chip"]')[0]!.trigger('click')
    await wrapper.find('[data-testid="theme-element-move-right"]').trigger('click')
    expect(chipFacts(wrapper).map((chip) => chip.kind)).toEqual(['seq', 'text'])
    expect(previewText(wrapper)).toContain('001A')

    // 删除当前选中要素（前移后选中的是常量，删掉后只剩流水号）
    await wrapper.find('[data-testid="theme-element-remove"]').trigger('click')
    expect(chipFacts(wrapper).map((chip) => chip.kind)).toEqual(['seq'])

    // 清空
    await wrapper.find('[data-testid="theme-clear"]').trigger('click')
    expect(chipFacts(wrapper)).toHaveLength(0)
    expect(previewText(wrapper)).toContain('—')
  })

  it('保存：要素序列序列化为规则文本（字面量转义、历史记法原样保留）', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('单号{{临时}}{TIMESTAMP}')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    const kinds = chipFacts(wrapper).map((chip) => chip.kind)
    expect(kinds).toEqual(['text', 'legacy'])
    await wrapper.find('[data-testid="theme-element-add-date"]').trigger('click')
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    expect(updateProcessDefThemeRule).toHaveBeenCalledWith(
      9,
      '单号{{临时}}{TIMESTAMP}{DATE:yyyyMMdd}',
    )
  })

  it('要素级错误：要素条标错 + 顶部汇总「存在 N 个错误」，保存按钮置灰；修正后恢复', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('OA-')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    // 常量被清空 → 1 个错误
    await wrapper.find('[data-testid="theme-element-text"]').setValue('')
    expect(wrapper.find('[data-testid="theme-error-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-element-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-save"]').attributes('disabled')).toBeDefined()

    // 填入内容 → 错误消失、保存恢复可用
    await wrapper.find('[data-testid="theme-element-text"]').setValue('OA-')
    expect(wrapper.find('[data-testid="theme-error-banner"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="theme-save"]').attributes('disabled')).toBeUndefined()

    // 自定义要素括号不成对 → 再次报错
    await wrapper.find('[data-testid="theme-element-add-custom"]').trigger('click')
    await wrapper.find('[data-testid="theme-element-expression"]').setValue('(seq > 0')
    expect(wrapper.find('[data-testid="theme-error-banner"]').exists()).toBe(true)
    await wrapper.find('[data-testid="theme-element-expression"]').setValue('(seq > 0)')
    expect(wrapper.find('[data-testid="theme-error-banner"]').exists()).toBe(false)
  })

  it('空规则保存被拦下（必填提示，不请求接口）', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    expect(updateProcessDefThemeRule).not.toHaveBeenCalled()
  })
})
