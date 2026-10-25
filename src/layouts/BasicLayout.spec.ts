import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * BasicLayout 深色侧栏渲染口径（0.1.7 #33 Owner 裁决）。
 *
 * 应用管理列表页 /form/app-manage 的分区菜单只有「应用管理」自身一个条目
 * （sys_menu 9130，parent_id=0），侧栏是自指的无效导航 → 该路径不渲染深色侧栏，
 * 内容区顶栏全宽；其余后台页面保持原口径（侧栏照常渲染）。
 * 0.2.0（Owner 反馈 + 401:8637 SidebarToggle 规范）：侧栏收起/展开入口在
 * 侧栏与正文交界处（.basic-layout__sidebar-toggle），顶栏主导航不含该入口。
 */
let mockPath = '/form/app-manage'
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return mockPath
    },
  }),
}))

const appStoreMock = vi.hoisted(() => ({
  sidebarCollapsed: false,
  toggleSidebar: vi.fn(),
}))
vi.mock('@/stores/app', () => ({
  useAppStore: () => appStoreMock,
}))

vi.mock('@/locales', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import BasicLayout from './BasicLayout.vue'

const stubs = {
  AppLogo: { template: '<div class="logo-stub" />' },
  AppMainNav: { template: '<nav class="nav-stub" />' },
  AppTopbar: { template: '<div class="topbar-stub" />' },
  AppSidebar: { template: '<div class="sidebar-stub" />' },
  'router-view': { template: '<div class="router-view-stub" />' },
}

function mountLayout() {
  return mount(BasicLayout, { global: { stubs } })
}

describe('BasicLayout 深色侧栏渲染口径', () => {
  beforeEach(() => {
    appStoreMock.sidebarCollapsed = false
    appStoreMock.toggleSidebar.mockClear()
  })

  it('应用管理列表页不渲染侧栏（该分区仅自身一个菜单项）', () => {
    mockPath = '/form/app-manage'
    const wrapper = mountLayout()

    expect(wrapper.find('.basic-layout__aside').exists()).toBe(false)
    expect(wrapper.find('.sidebar-stub').exists()).toBe(false)
    // 交界入口随侧栏一起不渲染
    expect(wrapper.find('.basic-layout__sidebar-toggle').exists()).toBe(false)
    // 内容区仍在（顶栏全宽）
    expect(wrapper.find('.basic-layout__content').exists()).toBe(true)
  })

  it('应用详情深链仍用应用专属侧栏（通用深色侧栏不渲染，口径不回归）', () => {
    mockPath = '/form/app-manage/app-1'
    expect(mountLayout().find('.basic-layout__aside').exists()).toBe(false)
  })

  it('其他后台页保持原口径：侧栏照常渲染，交界入口在侧栏与正文之间', () => {
    mockPath = '/workflow/defs'
    const wrapper = mountLayout()

    expect(wrapper.find('.basic-layout__aside').exists()).toBe(true)
    expect(wrapper.find('.sidebar-stub').exists()).toBe(true)
    const toggle = wrapper.get('.basic-layout__sidebar-toggle')
    expect(toggle.attributes('aria-controls')).toBe('app-sidebar')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('前台工作台仍不渲染侧栏（既有口径回归保护）', () => {
    mockPath = '/portal'
    const wrapper = mountLayout()
    expect(wrapper.find('.basic-layout__aside').exists()).toBe(false)
    expect(wrapper.find('.basic-layout__sidebar-toggle').exists()).toBe(false)
  })

  it('转发侧栏收起状态，点击交界入口调用唯一侧栏状态动作', async () => {
    mockPath = '/system/user'
    appStoreMock.sidebarCollapsed = true
    const wrapper = mountLayout()

    expect(wrapper.find('.basic-layout__aside--collapsed').exists()).toBe(true)
    expect(wrapper.find('#app-sidebar').exists()).toBe(true)
    const toggle = wrapper.get('.basic-layout__sidebar-toggle')
    expect(toggle.classes()).toContain('is-collapsed')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(appStoreMock.toggleSidebar).toHaveBeenCalledTimes(1)
  })
})
