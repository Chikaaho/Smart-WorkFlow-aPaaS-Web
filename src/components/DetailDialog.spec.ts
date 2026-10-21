import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailDialog from './DetailDialog.vue'

const stubs = {
  'el-dialog': {
    template:
      '<div class="stub-dialog"><span class="stub-title">{{ title }}</span><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width', 'destroyOnClose'],
  },
  'el-alert': {
    template: '<div class="stub-alert">{{ title }}</div>',
    props: ['title', 'type'],
  },
  'el-button': {
    template: '<button class="stub-close" @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
}

describe('DetailDialog', () => {
  it('渲染标题与正文插槽', () => {
    const wrapper = mount(DetailDialog, {
      props: { modelValue: true, title: '执行详情' },
      slots: { default: '<p class="body-text">正文</p>' },
      global: { stubs },
    })
    expect(wrapper.find('.stub-dialog').text()).toContain('执行详情')
    expect(wrapper.find('.body-text').text()).toBe('正文')
  })

  it('错误以 alert 呈现，加载态交给 v-loading', () => {
    const wrapper = mount(DetailDialog, {
      props: { modelValue: true, error: '加载失败' },
      global: { stubs },
    })
    expect(wrapper.find('.stub-alert').text()).toBe('加载失败')
  })

  it('默认 footer 关闭按钮回写 modelValue=false', async () => {
    const wrapper = mount(DetailDialog, {
      props: { modelValue: true },
      global: { stubs },
    })
    const close = wrapper.find('.stub-close')
    expect(close.text()).toBe('关闭')
    await close.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('showFooter=false 时不渲染 footer', () => {
    const wrapper = mount(DetailDialog, {
      props: { modelValue: true, showFooter: false },
      global: { stubs },
    })
    expect(wrapper.find('.stub-close').exists()).toBe(false)
  })
})
