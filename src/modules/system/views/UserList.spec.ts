import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/user', () => ({
  pageUsers: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getUserRoles: vi.fn(),
  updateUserRoles: vi.fn(),
  getUserPosts: vi.fn(),
  updateUserPosts: vi.fn(),
}))

vi.mock('@/modules/system/api/role', () => ({
  pageRoles: vi.fn(),
}))

vi.mock('@/modules/system/api/post', () => ({
  pagePosts: vi.fn(),
}))

vi.mock('@/modules/system/api/dept', () => ({
  listDeptTree: vi.fn(),
}))

const tenantStore = vi.hoisted(() => ({ user: { tenantId: '0' }, superAdmin: false }))
vi.mock('@/stores/user', () => ({ useUserStore: () => tenantStore }))
vi.mock('@/modules/system/api/tenant-context', () => ({
  currentTenantContext: vi.fn(),
  tenantContextOptions: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import {
  pageUsers,
  getUser,
  createUser,
  deleteUser,
  getUserRoles,
  getUserPosts,
} from '@/modules/system/api/user'
import { currentTenantContext, tenantContextOptions } from '@/modules/system/api/tenant-context'
import { pageRoles } from '@/modules/system/api/role'
import { pagePosts } from '@/modules/system/api/post'
import { listDeptTree } from '@/modules/system/api/dept'
import type { SysUser, UserFormRequest } from '@/modules/system/types/user'
import type { SysRole } from '@/modules/system/types/role'
import UserList from './UserList.vue'

function stubPageResult() {
  return { list: [] as SysUser[], total: 0, pageNum: 1, pageSize: 10 }
}

describe('UserList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantStore.superAdmin = false
    vi.mocked(currentTenantContext).mockResolvedValue({
      id: '0',
      name: '当前租户',
      code: 'tenant-0',
      writable: true,
    })
    vi.mocked(tenantContextOptions).mockResolvedValue([
      { id: '0', name: '当前租户', code: 'tenant-0', writable: true },
    ])
    vi.mocked(pageUsers).mockResolvedValue(stubPageResult())
    vi.mocked(pageRoles).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 200 })
    vi.mocked(pagePosts).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 200 })
    vi.mocked(listDeptTree).mockResolvedValue([])
    vi.mocked(getUserRoles).mockResolvedValue([])
    vi.mocked(getUserPosts).mockResolvedValue([])
  })

  const minimalStubs = {
    StandardListTemplate: {
      template:
        '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/></div>',
      props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
      emits: ['update:pageNum', 'update:pageSize'],
    },
    'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
    'el-table': { template: '<div><slot/></div>' },
    'el-table-column': { template: '<div/>' },
    'el-dialog': {
      template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
      props: ['modelValue'],
    },
    'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
    'el-select': { template: '<select/>', props: ['modelValue'] },
    'el-option': { template: '<option/>' },
    'el-tag': { template: '<span><slot/></span>' },
    'el-checkbox-group': { template: '<div><slot/></div>', props: ['modelValue'] },
    'el-checkbox': { template: '<label><slot/></label>', props: ['value'] },
    'el-alert': { template: '<div><slot/></div>', props: ['title', 'type'] },
  }

  // ─── API 交互 ───

  it('calls pageUsers on mount with default pagination', () => {
    mount(UserList, { global: { stubs: minimalStubs } })
    expect(pageUsers).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 分页 ───

  it('re-fetches on pageNum change via exposed handler', async () => {
    vi.mocked(pageUsers).mockClear()
    vi.mocked(pageUsers).mockResolvedValue(stubPageResult())
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handlePageNumChange: (p: number) => Promise<void>
    }
    await vm.handlePageNumChange(3)
    await nextTick()

    expect(pageUsers).toHaveBeenCalledWith({ pageNum: 3, pageSize: 10 }, expect.anything())
  })

  // ─── 筛选重查 ───

  it('resets filter and re-fetches on reset', async () => {
    vi.mocked(pageUsers).mockClear()
    vi.mocked(pageUsers).mockResolvedValue(stubPageResult())
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleReset: () => Promise<void>
    }
    await vm.handleReset()
    await nextTick()

    expect(pageUsers).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 删除 ───

  it('deleteUser can be called and propagates', async () => {
    vi.mocked(deleteUser).mockResolvedValue(undefined)
    await deleteUser('1')
    expect(deleteUser).toHaveBeenCalledWith('1')
  })

  // ─── 状态语义（I51：0=正常 / 1=停用 / 2=锁定） ───

  it('新建表单默认 status=0（正常），openCreate 重置后仍为 0', () => {
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    const vm = wrapper.vm as unknown as {
      form: UserFormRequest
      openCreate: () => void
    }
    expect(vm.form.status).toBe(0)
    vm.openCreate()
    expect(vm.form.status).toBe(0)
  })

  it('编辑回填 status=1（停用）后表单值正确', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: '1',
      username: 'admin',
      tenantId: '0',
      tenantName: '当前租户',
      realName: '管理员',
      status: 1,
    } as SysUser)
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { openEdit: (row: SysUser) => Promise<void> }
    await vm.openEdit({ id: '1', username: 'admin' } as SysUser)
    const formVm = wrapper.vm as unknown as { form: UserFormRequest }
    expect(formVm.form.status).toBe(1)
  })

  it('编辑回填 status=2（锁定）后表单值正确', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: '1',
      username: 'admin',
      tenantId: '0',
      tenantName: '当前租户',
      realName: '管理员',
      status: 2,
    } as SysUser)
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { openEdit: (row: SysUser) => Promise<void> }
    await vm.openEdit({ id: '1', username: 'admin' } as SysUser)
    const formVm = wrapper.vm as unknown as { form: UserFormRequest }
    expect(formVm.form.status).toBe(2)
  })

  it('选择「停用」(status=1) 后提交 payload 的 status=1', async () => {
    vi.mocked(createUser).mockResolvedValue('99')
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      form: UserFormRequest
      handleSubmit: () => Promise<void>
      openCreate: () => Promise<void>
    }
    await vm.openCreate()
    vm.form.username = 'testuser'
    vm.form.status = 1
    await vm.handleSubmit()
    expect(vi.mocked(createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'testuser', status: 1 }),
    )
  })

  it('选择「正常」(status=0) 后提交 payload 的 status=0', async () => {
    vi.mocked(createUser).mockResolvedValue('99')
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      form: UserFormRequest
      handleSubmit: () => Promise<void>
      openCreate: () => Promise<void>
    }
    await vm.openCreate()
    vm.form.username = 'testuser'
    vm.form.status = 0
    await vm.handleSubmit()
    expect(vi.mocked(createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'testuser', status: 0 }),
    )
  })

  // ─── 配置角色：按目标用户租户取角色 ───

  it('编辑用户时按该用户所属租户加载角色', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: '2',
      username: 'demo_a_hq_1',
      tenantId: '9001',
      status: 0,
    } as SysUser)
    vi.mocked(getUserRoles).mockResolvedValue(['11'])
    vi.mocked(pageRoles).mockResolvedValue({
      list: [{ id: '11', name: '租户管理员', code: 'demo_admin', tenantId: '9001' }],
      total: 1,
      pageNum: 1,
      pageSize: 200,
    })

    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { openEdit: (row: SysUser) => Promise<void> }
    await vm.openEdit({ id: '2', username: 'demo_a_hq_1' } as SysUser)

    expect(pageRoles).toHaveBeenCalledWith({ pageNum: 1, pageSize: 200 }, { tenantId: '9001' })
  })

  it('新建用户时按当前登录租户加载角色', async () => {
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { openCreate: () => void }
    vm.openCreate()
    await flushPromises()

    expect(pageRoles).toHaveBeenCalledWith({ pageNum: 1, pageSize: 200 }, { tenantId: '0' })
  })

  it('配置角色弹窗确认后把勾选结果写回表单', async () => {
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      openRoleDialog: () => void
      confirmRoleDialog: () => void
      roleIds: string[]
      roleDraft: string[]
    }
    vm.openCreate()
    await flushPromises()

    vm.openRoleDialog()
    vm.roleDraft = ['11', '12']
    vm.confirmRoleDialog()

    expect(vm.roleIds).toEqual(['11', '12'])
  })

  it('新建用户时内置超管不可勾选，全选只纳入可分配角色', async () => {
    vi.mocked(pageRoles).mockResolvedValue({
      list: [
        {
          id: '1',
          name: '超级管理员',
          code: 'superadmin',
          tenantId: '0',
          builtIn: true,
          status: 1,
        },
        { id: '2', name: '管理员', code: 'admin', tenantId: '0', status: 1 },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 200,
    })

    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      openRoleDialog: () => void
      selectAllRoles: () => void
      isRoleLocked: (role: SysRole) => boolean
      roleDraft: string[]
    }
    vm.openCreate()
    await flushPromises()

    expect(vm.isRoleLocked({ id: '1', name: '超级管理员', code: 'superadmin', status: 1 })).toBe(
      true,
    )
    expect(
      vm.isRoleLocked({ id: '2', name: '管理员', code: 'admin', tenantId: '0', status: 1 }),
    ).toBe(false)

    vm.openRoleDialog()
    vm.selectAllRoles()
    expect(vm.roleDraft).toEqual(['2'])
  })
  it('超管全部租户新增先选目标，选择后一次提交用户及关联且保持 Long 字符串', async () => {
    tenantStore.superAdmin = true
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      openCreate: () => Promise<void>
      selectTarget: (target: object) => void
      pickerVisible: boolean
      dialogVisible: boolean
      targetTenantId: string
      form: UserFormRequest
      roleIds: string[]
      postIds: string[]
      postDeptMap: Record<string, string>
      handleSubmit: () => Promise<void>
    }
    const opening = vm.openCreate()
    await flushPromises()
    expect(vm.pickerVisible).toBe(true)
    expect(vm.dialogVisible).toBe(false)
    expect(pageRoles).not.toHaveBeenCalled()
    vm.selectTarget({ id: '2113285377233043457', name: '明确目标', code: 'target', writable: true })
    await opening
    expect(vm.targetTenantId).toBe('2113285377233043457')
    expect(pageRoles).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 200 },
      { tenantId: '2113285377233043457' },
    )
    expect(listDeptTree).toHaveBeenCalledWith({ tenantId: '2113285377233043457' })
    vm.form.username = 'target_user'
    vm.roleIds = ['2113285377233043458']
    vm.postIds = ['2113285377233043459']
    vm.postDeptMap['2113285377233043459'] = '2113285377233043460'
    vi.mocked(createUser).mockResolvedValue('2113285377233043461')
    await vm.handleSubmit()
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: '2113285377233043457',
        roleIds: ['2113285377233043458'],
        posts: [{ postId: '2113285377233043459', deptId: '2113285377233043460' }],
      }),
    )
  })

  it('单一租户查询后新增继承该目标，弹窗名称只读；编辑取对象归属', async () => {
    tenantStore.superAdmin = true
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      filterTenant: object
      handleQuery: () => void
      openCreate: () => Promise<void>
      pickerVisible: boolean
      targetTenantId: string
      openEdit: (row: SysUser) => Promise<void>
    }
    vm.filterTenant = { id: '9001', name: '租户甲', code: 'a', writable: true }
    vm.handleQuery()
    await vm.openCreate()
    expect(vm.pickerVisible).toBe(false)
    expect(vm.targetTenantId).toBe('9001')
    const tenantInput = wrapper.find('input[aria-label="所属租户"]')
    expect(tenantInput.attributes('readonly')).toBeDefined()
    vi.mocked(getUser).mockResolvedValue({
      id: '2',
      username: 'owner',
      tenantId: '9002',
      tenantName: '租户乙',
    })
    await vm.openEdit({ id: '2', username: 'owner' })
    expect(vm.targetTenantId).toBe('9002')
  })

  it('取消目标选择不打开新建窗口，不静默采用租户 0', async () => {
    tenantStore.superAdmin = true
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      openCreate: () => Promise<void>
      closePicker: (value: boolean) => void
      dialogVisible: boolean
    }
    const opening = vm.openCreate()
    await flushPromises()
    vm.closePicker(false)
    await opening
    expect(vm.dialogVisible).toBe(false)
    expect(createUser).not.toHaveBeenCalled()
  })
  it('保留的系统超级管理员行仅提供查看', async () => {
    const wrapper = mount(UserList, { global: { stubs: minimalStubs } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      rowActions: (row: SysUser) => { key: string; onClick: () => void }[]
      protectedDetailsVisible: boolean
    }
    const actions = vm.rowActions({
      id: '1',
      username: 'admin',
      tenantId: '0',
      protectedAccount: true,
    })
    expect(actions.map((action) => action.key)).toEqual(['view'])
    actions[0].onClick()
    expect(vm.protectedDetailsVisible).toBe(true)
  })
})
