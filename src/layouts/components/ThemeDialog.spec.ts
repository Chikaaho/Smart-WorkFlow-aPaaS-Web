import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeDialog from './ThemeDialog.vue'
import { applyTheme, readTheme, THEME_STORAGE_KEY } from '@/foundation/theme'

const stubs = {
  DetailDialog: {
    props: ['modelValue', 'error'],
    emits: ['update:modelValue'],
    template:
      '<div><button class="cancel" @click="$emit(\'update:modelValue\', false)">取消</button><span>{{error}}</span><slot/><slot name="footer"/></div>',
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
    applyTheme({ name: 'blue', customColor: '#b45309' }, false)
  })
  it('previews selection locally and applies it only on Done', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[1]!.trigger('click')
    expect(readTheme().name).toBe('blue')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(readTheme().name).toBe('teal')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
  it('expands the gradient/hue/HEX controls only while 自定义 is selected', async () => {
    const wrapper = open()
    expect(wrapper.find('.theme-dialog__gradient').exists()).toBe(false)
    await wrapper.findAll('.theme-dialog__presets button')[2]!.trigger('click')
    expect(wrapper.find('.theme-dialog__gradient').exists()).toBe(true)
    expect(wrapper.find('.theme-dialog__hue').exists()).toBe(true)
    expect(wrapper.find('.theme-dialog__hex-input').exists()).toBe(true)

    await wrapper.findAll('.theme-dialog__presets button')[1]!.trigger('click')
    expect(wrapper.find('.theme-dialog__gradient').exists()).toBe(false)
    expect(wrapper.find('.theme-dialog__hue').exists()).toBe(false)
    expect(wrapper.find('.theme-dialog__custom').exists()).toBe(true)
  })
  it('previews the expanded HEX input locally without persisting', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[2]!.trigger('click')
    await wrapper.find('.theme-dialog__hex-input').setValue('#123456')
    expect(wrapper.find('.theme-dialog__preview').attributes('style')).toContain('#123456')
    expect(readTheme().name).toBe('blue')
    await wrapper.find('.cancel').trigger('click')
    expect(readTheme().name).toBe('blue')
  })
  it('rejects invalid custom colors and keeps the dialog open', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[2]!.trigger('click')
    await wrapper.find('input').setValue('#bad')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(wrapper.text()).toContain('请输入六位十六进制颜色')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(readTheme().name).toBe('blue')
  })
  it('rejects a low-contrast custom color', async () => {
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[2]!.trigger('click')
    await wrapper.find('input').setValue('#ffffff')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '完成')!
      .trigger('click')
    expect(wrapper.text()).toContain('主题色需要与白色文字和页面背景保持足够对比度')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(readTheme().name).toBe('blue')
  })
  it('keeps the previous preference when the dialog is cancelled and reloads its draft', async () => {
    applyTheme({ name: 'teal', customColor: '#b45309' })
    const wrapper = open()
    await wrapper.findAll('.theme-dialog__presets button')[0]!.trigger('click')
    await wrapper.find('.cancel').trigger('click')
    expect(readTheme().name).toBe('teal')
    expect(document.documentElement.dataset.theme).toBe('teal')

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.findAll('.theme-dialog__presets button')[0]!.attributes('aria-pressed')).toBe(
      'false',
    )
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
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(readTheme().name).toBe('blue')
  })
})
