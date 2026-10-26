import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FormPreview from './FormPreview.vue'
import { RICH_TEXT_PREFIX } from '@/modules/form/rich-text'

/* 预览 v-model 完整回传（direction-ui-completion-020）：
 * RichText 等自定义控件在 form-create 预览态的编辑值必须经组件级 v-model
 * 原样回到 FormPreview 调用方，预览不是数据死胡同。 */

describe('FormPreview 填写值回传', () => {
  it('RICH_TEXT 编辑值经 form-create 组件级 v-model 回传调用方', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(FormPreview, {
      props: {
        mode: 'fill',
        schema: {
          title: '回传表单',
          fields: [{ name: 'bio', type: 'RICH_TEXT' as const, label: '介绍' }],
        },
      },
    })
    await flushPromises()

    const editor = wrapper.element.querySelector<HTMLElement>(
      '[data-test="rich-text-editor"] .rt-editor',
    )
    expect(editor).not.toBeNull()
    editor!.innerHTML = '<p>预览填写<s>草稿</s></p>'
    editor!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const emitted = wrapper.emitted<{ [field: string]: unknown }[]>('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0]
    expect(last.bio).toBe(`${RICH_TEXT_PREFIX}<p>预览填写<s>草稿</s></p>`)
    warn.mockRestore()
    wrapper.unmount()
  })
})
