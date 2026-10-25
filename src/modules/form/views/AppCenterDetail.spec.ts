import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { replace, push, route } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  route: { params: { appId: 'app-1' }, query: {} as Record<string, unknown> },
}))

vi.mock('@/modules/form/api/app-center', () => ({
  listAppCenterApps: vi.fn(),
  getAppCenterContent: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => route,
}))

vi.mock('@/foundation/permission', () => ({
  hasPerm: () => false,
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { getAppCenterContent } from '@/modules/form/api/app-center'
import AppCenterDetail from './AppCenterDetail.vue'

const panelStub = {
  name: 'AppFormData',
  props: ['formKey', 'appId', 'embedded'],
  template: '<div data-testid="panel" :data-form-key="formKey" :data-app-id="appId" />',
}

const minimalStubs = {
  AppFormData: panelStub,
  AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
}

function content() {
  return {
    app: { id: 'app-1', name: '报销应用', sortNo: 0, visibleScopeType: 'ALL', status: 'ENABLED' },
    dirs: [
      {
        id: 'dir-1',
        appId: 'app-1',
        name: '差旅',
        sortNo: 0,
        forms: [{ formId: 'f1', formKey: 'travel_form', name: '差旅申请' }],
      },
    ],
    directForms: [{ formId: 'f2', formKey: 'direct_form', name: '直接归属表单' }],
  }
}

describe('AppCenterDetail（应用内页：目录/表单导航 + 数据列表）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    vi.mocked(getAppCenterContent).mockResolvedValue(content() as never)
  })

  it('渲染目录与表单导航，并默认选中首个表单（右侧数据列表）', async () => {
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    expect(getAppCenterContent).toHaveBeenCalledWith('app-1')
    const dirs = wrapper.findAll('[data-testid="app-tree-dir"]')
    expect(dirs).toHaveLength(1)
    expect(dirs[0]!.text()).toContain('差旅')

    const forms = wrapper.findAll('[data-testid="app-tree-form"]')
    expect(forms.map((f) => f.text())).toEqual(['差旅申请', '直接归属表单'])
    expect(forms[0]!.classes()).toContain('is-active')

    const panel = wrapper.find('[data-testid="panel"]')
    expect(panel.attributes('data-form-key')).toBe('travel_form')
    expect(panel.attributes('data-app-id')).toBe('app-1')
  })

  it('页头展示应用图标与名称，与管理端应用工作台一致', async () => {
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="app-detail-back"]').exists()).toBe(true)
    const name = wrapper.find('[data-testid="app-detail-name"]')
    expect(name.exists()).toBe(true)
    expect(name.text()).toBe('报销应用')
    expect(name.attributes('title')).toBe('报销应用')
    // 返回箭头 + 图标（测试桩）+ 名称 + 整栏收起按钮四项同排（设计 272:1296）
    expect(wrapper.find('.app-tree-nav__head').element.children).toHaveLength(4)
    expect(wrapper.find('[data-testid="app-tree-nav-collapse"]').exists()).toBe(true)
  })

  it('选中态跟随路由 query.formKey（刷新后仍停留在同一表单）', async () => {
    route.query = { formKey: 'direct_form' }
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    const active = wrapper.find('.app-tree-nav__form.is-active')
    expect(active.text()).toBe('直接归属表单')
    expect(wrapper.find('[data-testid="panel"]').attributes('data-form-key')).toBe('direct_form')
  })

  it('点击另一表单：写回路由 query（不新增历史），面板随之切换', async () => {
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    const target = wrapper.find('[data-form-key="direct_form"]')
    await target.trigger('click')

    expect(replace).toHaveBeenCalledWith({ query: { formKey: 'direct_form' } })
  })

  it('路由 query 指向已移除的表单：回落首个表单并纠正 query', async () => {
    route.query = { formKey: 'removed_form' }
    mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ query: { formKey: 'travel_form' } })
  })

  it('应用无可用内容：显示空态而非空白列表', async () => {
    vi.mocked(getAppCenterContent).mockResolvedValue({
      app: { id: 'app-1', name: '空应用' },
      dirs: [],
      directForms: [],
    } as never)
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="app-detail-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="panel"]').exists()).toBe(false)
  })

  it('不可见/不存在应用：显示服务端归一化错误而非空态', async () => {
    vi.mocked(getAppCenterContent).mockRejectedValue(
      Object.assign(new Error('not visible'), { code: 1404 }),
    )
    const wrapper = mount(AppCenterDetail, { global: { stubs: minimalStubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="app-detail-empty"]').exists()).toBe(false)
    expect(wrapper.find('.app-detail__error').exists()).toBe(true)
  })
})
