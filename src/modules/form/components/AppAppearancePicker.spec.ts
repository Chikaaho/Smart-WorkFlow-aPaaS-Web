import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppAppearancePicker from './AppAppearancePicker.vue'

const stubs = {
  DetailDialog: {
    props: ['modelValue', 'error'],
    template: '<div v-if="modelValue"><span>{{error}}</span><slot/><slot name="footer"/></div>',
  },
  AppIcon: { template: '<i />' },
  'el-color-picker-panel': { template: '<div />' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)" />',
  },
  'el-button': { template: '<button><slot/></button>' },
}
const open = () =>
  mount(AppAppearancePicker, { props: { icon: 'Grid', color: '#2563eb' }, global: { stubs } })
const button = (wrapper: ReturnType<typeof open>, name: string) =>
  wrapper.findAll('button').find((b) => b.text() === name)!

describe('application appearance selection', () => {
  it('searches icons and confirms the icon without changing the color', async () => {
    const wrapper = open()
    await wrapper.findAll('.app-appearance__control')[0]!.trigger('click')
    await wrapper.find('input').setValue('日历')
    expect(wrapper.findAll('.app-appearance-icons__grid button')).toHaveLength(1)
    await wrapper.find('[aria-label="日历"]').trigger('click')
    expect(wrapper.emitted('update:icon')).toBeUndefined()
    await button(wrapper, '确定').trigger('click')
    wrapper.findComponent(stubs.DetailDialog).vm.$emit('closed')
    expect(wrapper.emitted('update:icon')).toEqual([['Calendar']])
    expect(wrapper.emitted('update:color')).toBeUndefined()
    expect(wrapper.emitted('active')).toEqual([[true], [false]])
  })
  it('cancels color changes without changing the parent draft', async () => {
    const wrapper = open()
    await wrapper.findAll('.app-appearance__control')[1]!.trigger('click')
    await wrapper.find('[aria-label="#dc2626"]').trigger('click')
    await button(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:color')).toBeUndefined()
    expect(wrapper.emitted('update:icon')).toBeUndefined()
  })
  it('rejects malformed HEX, then confirms a corrected color independently', async () => {
    const wrapper = open()
    await wrapper.findAll('.app-appearance__control')[1]!.trigger('click')
    await wrapper.find('input#app-color-hex').setValue('#bad')
    await button(wrapper, '确定').trigger('click')
    expect(wrapper.text()).toContain('请输入六位十六进制颜色')
    expect(wrapper.emitted('update:color')).toBeUndefined()
    await wrapper.find('input#app-color-hex').setValue('#059669')
    await button(wrapper, '确定').trigger('click')
    expect(wrapper.emitted('update:color')).toEqual([['#059669']])
    expect(wrapper.emitted('update:icon')).toBeUndefined()
  })
})
