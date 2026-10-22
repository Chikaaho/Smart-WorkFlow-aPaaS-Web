import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeDialog from './ThemeDialog.vue'
import { applyTheme, readTheme } from '@/foundation/theme'

const stubs = {
  DetailDialog: {
    props: ['modelValue', 'error'],
    template: '<div><span>{{error}}</span><slot/><slot name="footer"/></div>',
  },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}
const open = () => mount(ThemeDialog, { props: { modelValue: true }, global: { stubs } })
describe('theme dialog', () => {
  beforeEach(() => {
    localStorage.clear()
    applyTheme({ name: 'purple', customColor: '#b45309' })
  })
  it('previews selection locally and applies it only on Done', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[1]!.trigger('click')
    expect(readTheme().name).toBe('purple')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(readTheme().name).toBe('blue')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
  it('rejects invalid custom colors and keeps the dialog open', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[3]!.trigger('click')
    await wrapper.find('input').setValue('#bad')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(wrapper.text()).toContain('请输入六位十六进制颜色')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(readTheme().name).toBe('purple')
  })
  it('restores the default draft before confirming', async () => {
    applyTheme({ name: 'custom', customColor: '#123456' })
    const wrapper = open()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '恢复默认')!
      .trigger('click')
    expect(readTheme().name).toBe('custom')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(readTheme().name).toBe('purple')
  })
})
