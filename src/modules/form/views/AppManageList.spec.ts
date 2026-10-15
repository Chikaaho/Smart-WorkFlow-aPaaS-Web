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
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
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

  it('可见范围展示语义：全部用户 / 指定 N 人 / 无人可见', async () => {
    vi.mocked(listFormApps).mockResolvedValue([
      app({ id: 'a1', name: '全员', visibleScopeType: 'ALL', visibleUserIds: null }),
      app({ id: 'a2', name: '指定', visibleScopeType: 'SPECIFIED', visibleUserIds: [5, 8] }),
      app({ id: 'a3', name: '空集', visibleScopeType: 'SPECIFIED', visibleUserIds: [] }),
    ])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    const vm = wrapper.vm as unknown as { scopeLabel: (row: FormApp) => string }
    expect(vm.scopeLabel(app({ visibleScopeType: 'ALL' }))).toBe('全部用户')
    expect(vm.scopeLabel(app({ visibleScopeType: 'SPECIFIED', visibleUserIds: [5, 8] }))).toBe(
      '指定 2 人',
    )
    expect(vm.scopeLabel(app({ visibleScopeType: 'SPECIFIED', visibleUserIds: [] }))).toBe(
      '无人可见',
    )
  })

  it('来源标注区分手动创建与存量承接', async () => {
    vi.mocked(listFormApps).mockResolvedValue([])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { sourceLabel: (row: FormApp) => string }
    expect(vm.sourceLabel(app({ source: 'MANUAL' }))).toBe('手动创建')
    expect(vm.sourceLabel(app({ source: 'LEGACY_CATEGORY' }))).toBe('存量分类承接')
    expect(vm.sourceLabel(app({ source: 'LEGACY_UNCATEGORIZED' }))).toBe('存量未分类承接')
  })

  it('空列表时进入空态（不误报加载中）', async () => {
    vi.mocked(listFormApps).mockResolvedValue([])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    const vm = wrapper.vm as unknown as { isEmpty: boolean }
    expect(vm.isEmpty).toBe(true)
  })
})
