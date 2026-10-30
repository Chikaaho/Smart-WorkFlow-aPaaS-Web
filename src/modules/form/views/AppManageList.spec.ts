import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/form/api/app-center', () => ({
  listFormApps: vi.fn(),
  createFormApp: vi.fn(),
  updateFormApp: vi.fn(),
  deleteFormApp: vi.fn(),
  disableFormApp: vi.fn(),
  enableFormApp: vi.fn(),
  getFormAppContent: vi.fn(),
  createFormAppDir: vi.fn(),
  updateFormAppDir: vi.fn(),
  deleteFormAppDir: vi.fn(),
  assignFormMembership: vi.fn(),
  listAppCenterApps: vi.fn(),
  getAppCenterContent: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ user: { id: '1', username: 'admin' } }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { listFormApps } from '@/modules/form/api/app-center'
import type { FormApp } from '@/contracts/app-center'
import AppManageList from './AppManageList.vue'

const minimalStubs = {
  LoadErrorState: { template: '<div/>', props: ['error'] },
  UserRemoteSelect: { template: '<div/>', props: ['modelValue', 'multiple'] },
  AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div><slot :row="{}"/></div>' },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
  'el-input-number': { template: '<input/>', props: ['modelValue'] },
  'el-radio-group': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-radio': { template: '<label><slot/></label>', props: ['value'] },
  'el-tag': { template: '<span><slot/></span>' },
}

function app(partial: Partial<FormApp>): FormApp {
  return {
    id: 'app-1',
    name: '报销应用',
    sortNo: 0,
    visibleScopeType: 'SPECIFIED',
    visibleUserIds: [],
    status: 'ENABLED',
    source: 'MANUAL',
    ...partial,
  }
}

describe('AppManageList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listFormApps).mockResolvedValue([])
  })

  it('挂载即加载应用列表（管理端含停用）', () => {
    mount(AppManageList, { global: { stubs: minimalStubs } })
    expect(listFormApps).toHaveBeenCalledTimes(1)
  })

  it('应用渲染为卡片，工具栏保留可达的新建应用入口', async () => {
    vi.mocked(listFormApps).mockResolvedValue([
      app({ id: 'a1', name: '全员' }),
      app({ id: 'a2', name: '指定' }),
    ])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    const cards = wrapper.findAll('[data-testid="app-card"]')
    expect(cards).toHaveLength(2)
    expect(wrapper.find('[data-testid="app-create"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('全员')
  })

  it('空列表仍可从工具栏新建应用', async () => {
    vi.mocked(listFormApps).mockResolvedValue([])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('[data-testid="app-card"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="app-create"]').exists()).toBe(true)
  })
})
