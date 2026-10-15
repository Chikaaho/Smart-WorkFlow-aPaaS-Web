import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

/**
 * ThemeRuleDialog 单测（BF20261013-042 流程编号设置弹窗）。
 *
 * 覆盖 Owner 口径：
 *   - 变量按钮与输入框同框（灰底文字样式），点击在光标处带入；
 *   - 框内只显示 [发起时间] 类标识（data-token），不暴露占位记法；
 *   - 用户手写的 {xxx} 一律当普通字符串（保存转义 {{ }}、预览原样、不被当变量）。
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
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
  },
  'el-select': { template: '<div class="el-select"><slot/></div>', props: ['modelValue'] },
  'el-option': { template: '<div class="el-option"/>', props: ['label', 'value'] },
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

function mountDialog(attachToBody = false) {
  return mount(ThemeRuleDialog, {
    props: { visible: false, def },
    global: { stubs, plugins: [createPinia()] },
    // 光标/选区相关用例需要真实挂载（jsdom 对游离树不落选区）
    ...(attachToBody ? { attachTo: document.body } : {}),
  })
}

async function openDialog(wrapper: ReturnType<typeof mountDialog>) {
  await wrapper.setProps({ visible: true })
  await flushPromises()
  await nextTick()
}

describe('ThemeRuleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('打开时回显规则：框内标识带 data-token、位数回显、示例实时更新', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('JRZX_{YYYYMMDDHHMMSS}_{SEQ:3}')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    expect(getProcessDefThemeRule).toHaveBeenCalledWith(9)
    const chips = wrapper.findAll('.theme-editor__chip')
    expect(chips.map((chip) => chip.attributes('data-token'))).toEqual([
      '{YYYYMMDDHHMMSS}',
      '{SEQ:3}',
    ])
    expect(wrapper.find('.theme-editor__content').text()).toContain('JRZX_')
    expect(wrapper.vm).toHaveProperty('themeSeqDigits', 3)
    expect(wrapper.find('.theme-dialog__preview').text()).toMatch(/\d{14}_001/)
  })

  it('点中灰底标识不会把光标放进标识内部（避免打字把标识文字改坏、且改坏后不落规则）', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('A{SEQ:3}B')
    const wrapper = mountDialog(true)
    await openDialog(wrapper)

    const content = wrapper.find('.theme-editor__content').element as HTMLElement
    const chip = content.querySelector('.theme-editor__chip') as HTMLElement
    expect(chip).toBeTruthy()

    // 左半边点击：光标落在标识之前；mousedown 被 preventDefault（不交给浏览器放光标）
    const allowed = chip.dispatchEvent(
      new window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 1,
      }),
    )
    expect(allowed).toBe(false)
    const selection = window.getSelection()
    expect(selection?.rangeCount).toBe(1)
    const range = selection!.getRangeAt(0)
    expect(range.startContainer).toBe(content)
    // 子节点序：文本 'A'(0) → 标识(1) → 文本 'B'；offset=1 即光标贴在标识之前
    expect(range.startOffset).toBe(1)

    // 兜底：光标若仍落在标识内部（键盘/输入法路径），beforeinput 被拦下
    const inside = window.document.createRange()
    inside.selectNodeContents(chip)
    inside.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(inside)
    const inputAllowed = content.dispatchEvent(
      new window.InputEvent('beforeinput', { bubbles: true, cancelable: true }),
    )
    expect(inputAllowed).toBe(false)
  })

  it('变量按钮在输入框内（与标识同为灰底文字），点击在光标处带入', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('')
    const wrapper = mountDialog()
    await openDialog(wrapper)

    const adds = wrapper.findAll('.theme-editor__add')
    // 4 个固定变量 + 自增序号 = 5 个按钮，全部位于输入框（.theme-editor）内
    expect(adds.length).toBe(5)
    expect(wrapper.find('.theme-editor').findAll('.theme-editor__add').length).toBe(5)

    const pick = (label: string) => adds.find((button) => button.text() === label)
    expect(pick('发起人')).toBeTruthy()

    await pick('发起人')?.trigger('click')
    await nextTick()
    expect(
      wrapper.findAll('.theme-editor__chip').map((chip) => chip.attributes('data-token')),
    ).toEqual(['{INITIATOR}'])

    // 再点「自增序号」按当前位数（默认 3 位）带入
    await pick('自增序号')?.trigger('click')
    await nextTick()
    expect(
      wrapper.findAll('.theme-editor__chip').map((chip) => chip.attributes('data-token')),
    ).toEqual(['{INITIATOR}', '{SEQ:3}'])
    // 规则文本：两个变量按带入顺序相邻拼接；示例里发起人取当前登录用户（测试无会话 → 空）、
    // 序号补零到 3 位
    expect(wrapper.vm).toHaveProperty('themeRuleInput', '{INITIATOR}{SEQ:3}')
    expect(wrapper.find('.theme-dialog__preview').text()).toContain('001')
  })

  it('手写 {xxx} 按普通字符串：保存时转义、示例原样、不被当变量', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('')
    vi.mocked(updateProcessDefThemeRule).mockResolvedValueOnce(undefined)
    const wrapper = mountDialog()
    await openDialog(wrapper)

    // 模拟用户手打「单号{临时}」（直接改编辑区 DOM 再派发 input）
    const content = wrapper.find('.theme-editor__content').element as HTMLElement
    content.textContent = '单号{临时}'
    await wrapper.find('.theme-editor__content').trigger('input')

    expect(wrapper.vm).toHaveProperty('themeRuleInput', '单号{{临时}}')
    expect(wrapper.findAll('.theme-editor__chip').length).toBe(0)
    expect(wrapper.find('.theme-dialog__preview').text()).toContain('单号{临时}')

    await wrapper
      .findAll('.el-button')
      .find((button) => button.text() === '保存')
      ?.trigger('click')
    await flushPromises()
    expect(updateProcessDefThemeRule).toHaveBeenCalledWith(9, '单号{{临时}}')
  })

  it('空规则保存被拦下（必填提示，不请求接口）', async () => {
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce(null)
    const wrapper = mountDialog()
    await openDialog(wrapper)

    await wrapper
      .findAll('.el-button')
      .find((button) => button.text() === '保存')
      ?.trigger('click')
    await flushPromises()
    expect(updateProcessDefThemeRule).not.toHaveBeenCalled()
  })
})
