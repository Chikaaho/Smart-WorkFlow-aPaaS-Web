import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RichTextControl from './RichTextControl.vue'
import { RICH_TEXT_PREFIX } from '@/modules/form/rich-text'

/* 基础排版工具栏（direction-ui-completion-020）：
 * 删除线/对齐/缩进/有序无序列表属于原规范基础排版，按受控字符串格式补齐。 */

function mountControl(modelValue: unknown = '', readonly = false) {
  return mount(RichTextControl, {
    props: {
      field: { name: 'bio', type: 'RICH_TEXT' } as never,
      modelValue,
      readonly,
    },
  })
}

describe('RichTextControl 基础排版工具栏', () => {
  it('渲染删除线/对齐/缩进/列表全部基础排版按钮', () => {
    const wrapper = mountControl()
    const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('删除线')
    expect(labels).toContain('左对齐')
    expect(labels).toContain('居中对齐')
    expect(labels).toContain('右对齐')
    expect(labels).toContain('增加缩进')
    expect(labels).toContain('减少缩进')
    expect(labels).toContain('无序列表')
    expect(labels).toContain('有序列表')
  })

  it('编辑输入按受控格式回传（含删除线标签）', async () => {
    const wrapper = mountControl()
    const editor = wrapper.find('.rt-editor')
    ;(editor.element as HTMLElement).innerHTML = '<p>价格<s>99</s>1</p>'
    await editor.trigger('input')
    await flushPromises()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toBe(`${RICH_TEXT_PREFIX}<p>价格<s>99</s>1</p>`)
  })
})

describe('RichTextControl 只读旧数据兼容', () => {
  it('未带前缀的旧 <p> 值按富文本渲染，不显示标签字符', () => {
    const wrapper = mountControl('<p>演练期间核心交易各中断约 10 分钟。</p>', true)
    const readonly = wrapper.find('[data-test="rich-text-readonly"]')
    expect(readonly.exists()).toBe(true)
    expect(readonly.text()).toContain('演练期间核心交易各中断约 10 分钟。')
    expect(readonly.text()).not.toContain('<p>')
  })

  it('纯文本旧值仍按纯文本展示（不当作 HTML）', () => {
    const wrapper = mountControl('两行文本\n第二行', true)
    expect(wrapper.find('[data-test="rich-text-readonly"]').exists()).toBe(false)
  })
})
