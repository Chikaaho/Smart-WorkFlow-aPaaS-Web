import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { i18n } from '@/locales'

describe('App', () => {
  it('mounts without crashing', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [i18n],
        stubs: ['router-view'],
      },
    })
    expect(wrapper.exists()).toBe(true)
  })
})
