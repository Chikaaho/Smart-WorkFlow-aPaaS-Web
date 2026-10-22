import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'

vi.mock('@/modules/system/api/tenant', () => ({
  pageTenants: vi.fn(),
  createTenant: vi.fn(),
  renameTenant: vi.fn(),
  updateTenantStatus: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import { pageTenants, createTenant, updateTenantStatus } from '@/modules/system/api/tenant'
import { useUserStore } from '@/stores/user'
import type { SysTenant } from '@/modules/system/types/tenant'
import TenantList from './TenantList.vue'

function stubPageResult(rows: SysTenant[] = []) {
  return { list: rows, total: rows.length, pageNum: 1, pageSize: 10 }
}

const genericStub = { template: '<div><slot/><slot name="default"/></div>' }

const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  ListFilterItem: { template: '<div><slot/></div>', props: ['label'] },
  ListActionsColumn: { template: '<div/>', props: ['actions', 'width'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title'],
  },
  'el-form': genericStub,
  'el-form-item': { template: '<div><slot/></div>', props: ['label'] },
  'el-row': genericStub,
  'el-col': genericStub,
  'el-descriptions': genericStub,
  'el-descriptions-item': genericStub,
  'el-input': { template: '<input/>', props: ['modelValue', 'placeholder', 'type'] },
  'el-select': { template: '<select/>', props: ['modelValue'] },
  'el-option': { template: '<option/>' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-alert': { template: '<div><slot/></div>', props: ['title', 'type'] },
}

function mountPage() {
  return mount(TenantList, { global: { stubs: minimalStubs } })
}

describe('TenantList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUserStore().superAdmin = true
    vi.mocked(pageTenants).mockResolvedValue(stubPageResult())
  })

  it('loads the first page on mount', async () => {
    mountPage()
    await nextTick()
    expect(pageTenants).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  it('submits the new tenant with name, administrator and initial password', async () => {
    vi.mocked(createTenant).mockResolvedValue('100')
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      form: { name: string; adminUsername: string; adminPassword: string }
      handleSubmit: () => Promise<void>
    }
    vm.openCreate()
    vm.form.name = '深圳中心'
    vm.form.adminUsername = 'sz_admin'
    vm.form.adminPassword = 'secret123'
    await vm.handleSubmit()
    expect(createTenant).toHaveBeenCalledWith({
      name: '深圳中心',
      adminUsername: 'sz_admin',
      adminPassword: 'secret123',
    })
  })

  it('keeps the root tenant read-only in the action column', async () => {
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      rowActions: (row: SysTenant) => { key: string }[]
    }
    const actions = vm.rowActions({ id: '0', name: '超管', status: 0 })
    expect(actions.map((a) => a.key)).toEqual(['view'])
  })

  it('toggles a normal tenant status through the API', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    vi.mocked(updateTenantStatus).mockResolvedValue(undefined)
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      toggleStatus: (row: SysTenant) => Promise<void>
    }
    await vm.toggleStatus({ id: '2', name: '深圳中心', status: 0 })
    expect(updateTenantStatus).toHaveBeenCalledWith('2', 1)
  })
})
