import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import JsCodeEditor from './JsCodeEditor.vue'

describe('script editor completion', () => {
  it('completes a catalog function with a single hash prefix', async () => {
    const wrapper = mount(JsCodeEditor, {
      props: { modelValue: '', functions: [{ name: '#获取字段值' }] },
    })
    await wrapper.get('textarea').setValue('#获')
    expect(wrapper.get('[data-testid="js-editor-suggest"]').text()).toBe('#获取字段值')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#获取字段值'])
    wrapper.unmount()
  })
  it('limits bounded-language suggestions to supported syntax and functions', async () => {
    const wrapper = mount(JsCodeEditor, { props: { modelValue: '', languageMode: 'bounded' } })
    await wrapper.get('textarea').setValue('wh')
    expect(wrapper.find('[data-testid="js-editor-suggest"]').exists()).toBe(false)
    await wrapper.get('textarea').setValue('ret')
    expect(wrapper.get('[data-testid="js-editor-suggest"]').text()).toBe('return')
    wrapper.unmount()
  })
})
