import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/form/api/app-center', () => ({
  listAppCenterApps: vi.fn(),
  getAppCenterContent: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { listAppCenterApps } from '@/modules/form/api/app-center'
import type { FormApp } from '@/contracts/app-center'
import AppCenter from './AppCenter.vue'

const minimalStubs = {
  LoadErrorState: { template: '<div/>', props: ['error'] },
  AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
}

function app(partial: Partial<FormApp>): FormApp {
  return {
    id: 'app-1',
    name: '报销应用',
    sortNo: 0,
    visibleScopeType: 'ALL',
    status: 'ENABLED',
    source: 'MANUAL',
    ...partial,
  }
}

describe('AppCenter（用户端）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('挂载即拉取可见应用，并渲染应用卡片', async () => {
    vi.mocked(listAppCenterApps).mockResolvedValue([
      app({ id: 'a1', name: '报销应用', formCount: 3 }),
      app({ id: 'a2', name: '合同应用', formCount: 1 }),
    ])
    const wrapper = mount(AppCenter, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(listAppCenterApps).toHaveBeenCalledTimes(1)
    const cards = wrapper.findAll('[data-testid="app-card"]')
    expect(cards).toHaveLength(2)
    expect(wrapper.text()).toContain('报销应用')
    expect(wrapper.text()).toContain('合同应用')
  })

  it('无可见应用时显示清晰空态', async () => {
    vi.mocked(listAppCenterApps).mockResolvedValue([])
    const wrapper = mount(AppCenter, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="app-center-empty"]').exists()).toBe(true)
  })

  it('加载失败时显示归一化错误态而非空态', async () => {
    vi.mocked(listAppCenterApps).mockRejectedValue(new Error('boom'))
    const wrapper = mount(AppCenter, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="app-center-empty"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('加载失败')
  })
})
