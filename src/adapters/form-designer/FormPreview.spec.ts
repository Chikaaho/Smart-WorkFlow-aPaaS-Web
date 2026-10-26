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

  it('TABLE 预览渲染真实表头/行，添加行与单元格编辑经 v-model 回传', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(FormPreview, {
      props: {
        mode: 'fill',
        schema: {
          title: '明细表单',
          fields: [
            {
              name: 'items',
              type: 'TABLE' as const,
              label: '明细',
              subFields: [
                { name: 'col1', type: 'TEXT' as const, label: '名称' },
                { name: 'col2', type: 'NUMBER' as const, label: '金额' },
              ],
            },
          ],
        },
      },
    })
    await flushPromises()

    // 真实表头按子表字段渲染
    const table = wrapper.element.querySelector('table')
    expect(table).not.toBeNull()
    const headers = Array.from(table!.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(headers).toContain('名称')
    expect(headers).toContain('金额')

    // 添加行 → 行进入回传值
    const addBtn = Array.from(wrapper.element.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '添加行',
    )
    expect(addBtn).toBeTruthy()
    addBtn!.click()
    await flushPromises()
    let emitted = wrapper.emitted<{ [field: string]: unknown }[]>('update:modelValue')
    let last = emitted![emitted!.length - 1][0] as { items: unknown[] }
    expect(Array.isArray(last.items)).toBe(true)
    expect(last.items).toHaveLength(1)

    // 单元格编辑 → 单元格值回传（行结构保留）
    const cellInput = wrapper.element.querySelector<HTMLInputElement>(
      'table tbody input[type="text"]',
    )
    expect(cellInput).not.toBeNull()
    cellInput!.value = '报销A'
    cellInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    emitted = wrapper.emitted<{ [field: string]: unknown }[]>('update:modelValue')
    last = emitted![emitted!.length - 1][0] as { items: { col1: string }[] }
    expect(last.items[0].col1).toBe('报销A')
    warn.mockRestore()
    wrapper.unmount()
  })

  it('TABLE 设计态渲染示例空行且无行操作按钮', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(FormPreview, {
      props: {
        mode: 'design',
        schema: {
          title: '明细表单',
          fields: [
            {
              name: 'items',
              type: 'TABLE' as const,
              label: '明细',
              subFields: [{ name: 'col1', type: 'TEXT' as const, label: '名称' }],
            },
          ],
        },
      },
    })
    await flushPromises()

    const table = wrapper.element.querySelector('table')
    expect(table).not.toBeNull()
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2)
    const buttons = Array.from(wrapper.element.querySelectorAll('button')).map((b) =>
      b.textContent?.trim(),
    )
    expect(buttons).not.toContain('添加行')
    expect(buttons).not.toContain('删除')
    warn.mockRestore()
    wrapper.unmount()
  })
})
