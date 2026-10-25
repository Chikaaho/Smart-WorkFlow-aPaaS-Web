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
  queryTenantAdministrators: vi.fn(),
  assignTenantAdministrator: vi.fn(),
  createTenantAdministrator: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import {
  pageTenants,
  createTenant,
  updateTenantStatus,
  queryTenantAdministrators,
  assignTenantAdministrator,
  createTenantAdministrator,
} from '@/modules/system/api/tenant'
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

  it('非系统超管不发起租户分页请求并显示权限说明', async () => {
    useUserStore().superAdmin = false
    const wrapper = mountPage()
    await nextTick()
    expect(pageTenants).not.toHaveBeenCalled()
    const vm = wrapper.vm as unknown as { errorMsg: string }
    expect(vm.errorMsg).toContain('仅系统超级管理员')
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
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/),
    })
  })

  it('retains one creation request ID across an uncertain response and retry', async () => {
    vi.mocked(createTenant)
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce('100')
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      form: { name: string; adminUsername: string; adminPassword: string }
      handleSubmit: () => Promise<void>
    }
    vm.openCreate()
    Object.assign(vm.form, {
      name: '深圳中心',
      adminUsername: 'sz_admin',
      adminPassword: 'secret123',
    })
    await vm.handleSubmit()
    await vm.handleSubmit()
    const requests = vi.mocked(createTenant).mock.calls
    expect(requests).toHaveLength(2)
    expect(requests[0]![0].requestId).toBe(requests[1]![0].requestId)
    vm.openCreate()
    Object.assign(vm.form, {
      name: '下一租户',
      adminUsername: 'next_admin',
      adminPassword: 'secret123',
    })
    await vm.handleSubmit()
    expect(vi.mocked(createTenant).mock.calls[2]![0].requestId).not.toBe(requests[0]![0].requestId)
    wrapper.unmount()
  })

  it('loads and assigns an administrator only for the selected tenant', async () => {
    vi.mocked(queryTenantAdministrators).mockResolvedValue([
      { id: '82001', username: 'target_admin' },
    ])
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      openAdministrator: (row: SysTenant) => Promise<void>
      administrator: { id: string }
      saveAdministrator: () => Promise<void>
    }
    await vm.openAdministrator({ id: '82', name: '目标租户', adminUserId: null })
    vm.administrator.id = '82001'
    await vm.saveAdministrator()
    expect(queryTenantAdministrators).toHaveBeenCalledWith('82')
    expect(assignTenantAdministrator).toHaveBeenCalledWith('82', '82001')
    expect(createTenantAdministrator).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('creates a first administrator for an unconfigured tenant and keeps root read-only', async () => {
    vi.mocked(queryTenantAdministrators).mockResolvedValue([])
    vi.mocked(createTenantAdministrator).mockResolvedValue('83001')
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      openAdministrator: (row: SysTenant) => Promise<void>
      administrator: { username: string; password: string }
      saveAdministrator: () => Promise<void>
    }
    await vm.openAdministrator({ id: '0', name: '超管' })
    expect(queryTenantAdministrators).not.toHaveBeenCalled()
    await vm.openAdministrator({ id: '83', name: '存量租户', adminUserId: null })
    Object.assign(vm.administrator, { username: 'initial_admin', password: 'test-only-password' })
    await vm.saveAdministrator()
    expect(createTenantAdministrator).toHaveBeenCalledWith(
      '83',
      'initial_admin',
      'test-only-password',
    )
    expect(assignTenantAdministrator).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores administrator options that arrive after switching to another tenant', async () => {
    let finishFirst!: (rows: { id: string; username: string }[]) => void
    vi.mocked(queryTenantAdministrators).mockImplementation((id) =>
      id === '81'
        ? new Promise((resolve) => {
            finishFirst = resolve
          })
        : Promise.resolve([{ id: '82001', username: 'tenant_b_admin' }]),
    )
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      openAdministrator: (row: SysTenant) => Promise<void>
      adminCandidates: { id: string }[]
      administrator: { id: string }
      saveAdministrator: () => Promise<void>
    }
    const first = vm.openAdministrator({ id: '81', name: '租户 A' })
    await vm.openAdministrator({ id: '82', name: '租户 B' })
    finishFirst([{ id: '81001', username: 'tenant_a_admin' }])
    await first
    expect(vm.adminCandidates.map((user) => user.id)).toEqual(['82001'])
    vm.administrator.id = '82001'
    await vm.saveAdministrator()
    expect(assignTenantAdministrator).toHaveBeenCalledWith('82', '82001')
    wrapper.unmount()
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
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '季度暂停' } as never)
    vi.mocked(updateTenantStatus).mockResolvedValue(undefined)
    const wrapper = mountPage()
    const vm = wrapper.vm as unknown as {
      toggleStatus: (row: SysTenant) => Promise<void>
    }
    await vm.toggleStatus({ id: '2', name: '深圳中心', status: 0 })
    expect(updateTenantStatus).toHaveBeenCalledWith('2', 1, '季度暂停')
  })
})
