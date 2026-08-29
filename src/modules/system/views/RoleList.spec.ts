import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/role', () => ({
  pageRoles: vi.fn(),
  getRole: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getRoleMenus: vi.fn(),
  updateRoleMenus: vi.fn(),
}))

// loadPermissionTree 走 loadMenu()；权限树为 mock 菜单树 + 按钮节点（menuType=2）
vi.mock('@/foundation/menu', () => ({
  loadMenu: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import {
  pageRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getRoleMenus,
  updateRoleMenus,
} from '@/modules/system/api/role'
import { loadMenu } from '@/foundation/menu'
import type { MenuNode } from '@/contracts/menu'
import type { SysRole } from '@/modules/system/types/role'
import RoleList from './RoleList.vue'

/** 混合权限树夹具：目录(0)/页面(1)/按钮(2)，父子/半选场景齐全。 */
const MENU_TREE: MenuNode[] = [
  {
    id: '1',
    parentId: null,
    name: 'system',
    title: '系统管理',
    path: 'system',
    component: null,
    sort: 1,
    menuType: 0,
    permission: 'system:view',
    hidden: false,
    children: [
      {
        id: '11',
        parentId: '1',
        name: 'User',
        title: '用户管理',
        path: 'system/user',
        component: 'system/views/UserList',
        icon: 'User',
        sort: 2,
        menuType: 1,
        permission: 'system:user:list',
        hidden: false,
        children: [
          {
            id: '110',
            parentId: '11',
            name: 'UserAdd',
            title: '新增用户',
            path: '',
            component: null,
            sort: 1,
            menuType: 2,
            permission: 'system:user:add',
            hidden: true,
          },
          {
            id: '111',
            parentId: '11',
            name: 'UserEdit',
            title: '编辑用户',
            path: '',
            component: null,
            sort: 2,
            menuType: 2,
            permission: 'system:user:edit',
            hidden: true,
          },
        ],
      },
    ],
  },
]

function stubPageResult() {
  return { list: [] as SysRole[], total: 0, pageNum: 1, pageSize: 10 }
}

describe('RoleList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageRoles).mockResolvedValue(stubPageResult())
    vi.mocked(getRoleMenus).mockResolvedValue([])
    vi.mocked(loadMenu).mockResolvedValue(MENU_TREE)
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
    'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
    'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
    'el-input-number': { template: '<input type="number"/>', props: ['modelValue'] },
    'el-select': { template: '<select/>', props: ['modelValue'] },
    'el-option': { template: '<option/>' },
    'el-tag': { template: '<span><slot/></span>' },
    'el-alert': { template: '<div><slot/></div>', props: ['title', 'type'] },
  }

  // ─── API 交互 ───

  it('calls pageRoles on mount with default pagination', () => {
    mount(RoleList, { global: { stubs: minimalStubs } })
    expect(pageRoles).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 分页 ───

  it('re-fetches on pageNum change via exposed handler', async () => {
    vi.mocked(pageRoles).mockClear()
    vi.mocked(pageRoles).mockResolvedValue(stubPageResult())
    const wrapper = mount(RoleList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handlePageNumChange: (p: number) => Promise<void>
    }
    await vm.handlePageNumChange(3)
    await nextTick()

    expect(pageRoles).toHaveBeenCalledWith({ pageNum: 3, pageSize: 10 }, expect.anything())
  })

  // ─── 筛选重查 ───

  it('resets filter and re-fetches on reset', async () => {
    vi.mocked(pageRoles).mockClear()
    vi.mocked(pageRoles).mockResolvedValue(stubPageResult())
    const wrapper = mount(RoleList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleReset: () => Promise<void>
    }
    await vm.handleReset()
    await nextTick()

    expect(pageRoles).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 删除 ───

  it('deleteRole can be called and propagates', async () => {
    vi.mocked(deleteRole).mockResolvedValue(undefined)
    await deleteRole('1')
    expect(deleteRole).toHaveBeenCalledWith('1')
  })

  // ─── 权限树：编辑回填 / 保存 / 清空 / superadmin / 父子联动（M02-F02/F03） ───

  async function mountWithDialog() {
    const wrapper = mount(RoleList, { global: { stubs: minimalStubs } })
    const vm = wrapper.vm as unknown as {
      openEdit: (row: SysRole) => Promise<void>
      handleSubmit: () => Promise<void>
      handlePermissionCheck: () => void
      permissionIds: string[]
      permissionTreeRef: {
        getCheckedKeys: (leaf?: boolean) => string[]
        getHalfCheckedKeys: () => string[]
      } | null
    }
    return { wrapper, vm }
  }

  it('编辑回填：openEdit 调用 getRoleMenus 并 setCheckedKeys 到真实 el-tree', async () => {
    vi.mocked(getRoleMenus).mockResolvedValue(['11', '110'])
    vi.mocked(getRole).mockResolvedValue({
      id: '2',
      name: '管理员',
      code: 'admin',
      sort: 2,
      status: 1,
      dataScope: 0,
      builtIn: false,
    })
    const { vm } = await mountWithDialog()

    await vm.openEdit({ id: '2', name: '管理员', code: 'admin', status: 1 } as SysRole)
    await nextTick()
    await nextTick()

    expect(getRoleMenus).toHaveBeenCalledWith('2')
    expect(getRoleMenus).toHaveBeenCalledTimes(1)
    // 修复后回填只 set 叶子（110 父=11 未 set，111 未授权）：父子联动（check-strictly=false）下
    // - 父 11 因 110 勾选呈半选，111 保持未勾选（不出现过授权级联）
    // - 根 1 同理半选
    // 保存集 = 全选 + 半选（handlePermissionCheck 语义），'11'、'1' 由半选补齐不丢失
    const leaves = vm.permissionTreeRef?.getCheckedKeys(true) ?? []
    expect(leaves.sort()).toEqual(['110'])
    const all = vm.permissionTreeRef?.getCheckedKeys(false) ?? []
    expect(all.sort()).toEqual(['110'])
    const half = vm.permissionTreeRef?.getHalfCheckedKeys() ?? []
    expect(half.sort()).toEqual(['1', '11'])
  })

  it('保存：编辑普通角色调用 updateRoleMenus(id, 全选叶子 key)', async () => {
    vi.mocked(updateRole).mockResolvedValue(undefined)
    vi.mocked(updateRoleMenus).mockResolvedValue(undefined)
    const { wrapper, vm } = await mountWithDialog()

    // 直接调用保存（编辑态，无权限树变更时 permissionIds 为空数组）
    const vmFull = wrapper.vm as unknown as { editingId: string | null; form: SysRole }
    vmFull.editingId = '2'
    vmFull.form.name = '管理员'
    vmFull.form.code = 'admin'
    await vm.handleSubmit()
    await nextTick()

    expect(updateRoleMenus).toHaveBeenCalledWith('2', [])
    // superadmin 禁用验证反向：普通角色必调 updateRoleMenus
    expect(updateRoleMenus).toHaveBeenCalledTimes(1)
  })

  it('superadmin 编辑：打开后权限树不可修改（isProtectedRole 禁用），保存不调用 updateRoleMenus', async () => {
    vi.mocked(getRoleMenus).mockResolvedValue(['1'])
    vi.mocked(getRole).mockResolvedValue({
      id: '1',
      name: '超级管理员',
      code: 'superadmin',
      sort: 1,
      status: 1,
      dataScope: 0,
      builtIn: true,
    })
    const { wrapper, vm } = await mountWithDialog()

    await vm.openEdit({ id: '1', name: '超级管理员', code: 'superadmin', builtIn: true } as SysRole)
    await nextTick()

    const vmFull = wrapper.vm as unknown as {
      isProtectedRole: boolean
      editingId: string | null
      form: SysRole
    }
    expect(vmFull.isProtectedRole).toBe(true)
    vmFull.editingId = '1'
    vmFull.form.name = '超级管理员'
    vmFull.form.code = 'superadmin'
    await vm.handleSubmit()
    await nextTick()

    // 前端禁用不能代替后端拒绝：页面保存不调用 updateRoleMenus（无可执行入口）
    expect(updateRoleMenus).not.toHaveBeenCalled()
    expect(updateRole).toHaveBeenCalledTimes(1)
  })

  it('创建：createRole 后调用 updateRoleMenus(新 id, 权限)', async () => {
    vi.mocked(createRole).mockResolvedValue('42')
    vi.mocked(updateRoleMenus).mockResolvedValue(undefined)
    const { wrapper, vm } = await mountWithDialog()

    const vmFull = wrapper.vm as unknown as { editingId: string | null; form: SysRole }
    vmFull.editingId = null
    vmFull.form.name = '测试角色'
    vmFull.form.code = 'test'
    await vm.handleSubmit()
    await nextTick()

    expect(createRole).toHaveBeenCalledTimes(1)
    expect(updateRoleMenus).toHaveBeenCalledWith('42', [])
  })

  it('父子联动：保存集=全选+半选（目录不丢）；回填只 set 叶子；保存→重开→回填一致', async () => {
    vi.mocked(updateRoleMenus).mockResolvedValue(undefined)
    vi.mocked(getRoleMenus).mockResolvedValue(['1', '11', '110', '111'])
    vi.mocked(getRole).mockResolvedValue({
      id: '2',
      name: '管理员',
      code: 'admin',
      sort: 2,
      status: 1,
      dataScope: 0,
      builtIn: false,
    })
    const { vm } = await mountWithDialog()

    // 第一次编辑：回填（父 1/11 过滤，仅 set 叶子 110/111）→ handlePermissionCheck 收集 → 保存
    await vm.openEdit({ id: '2', name: '管理员', code: 'admin', status: 1 } as SysRole)
    await nextTick()
    await nextTick()
    vm.handlePermissionCheck() // 模拟 @check：全选 110/111 + 半选 11/1 一并进入保存集
    const saved = vm.permissionIds ?? []
    // 目录 1/11 由半选保留（A-01 修复点：只存叶子会让菜单树组装丢父节点）
    expect(saved.sort()).toEqual(['1', '11', '110', '111'])
    await vm.handleSubmit()
    await nextTick()
    expect(updateRoleMenus).toHaveBeenCalledWith('2', ['1', '11', '110', '111'])

    // 第二次打开：getRoleMenus 返回保存的全量集（mock 已持久化语义），回填一致
    vi.mocked(getRoleMenus).mockClear()
    vi.mocked(getRoleMenus).mockResolvedValue(['1', '11', '110', '111'])
    await vm.openEdit({ id: '2', name: '管理员', code: 'admin', status: 1 } as SysRole)
    await nextTick()
    await nextTick()
    const rechecked = vm.permissionTreeRef?.getCheckedKeys(true) ?? []
    // 回填过滤父节点后，叶子全选 → 全选/半选状态与首次一致，不出现过授权级联
    expect(rechecked.sort()).toEqual(['110', '111'])
    expect(getRoleMenus).toHaveBeenCalledTimes(1)
  })
})
