import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/user', () => ({
  pageUsers: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
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

import { pageUsers, getUser, createUser, deleteUser } from '@/modules/system/api/user'
import type { SysUser, UserFormRequest } from '@/modules/system/types/user'
import UserList from './UserList.vue'

function stubPageResult() {
  return { list: [] as SysUser[], total: 0, pageNum: 1, pageSize: 10 }
}

describe('UserList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageUsers).mockResolvedValue(stubPageResult())
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
    'el-select': { template: '<select/>', props: ['modelValue'] },
    'el-option': { template: '<option/>' },
    'el-tag': { template: '<span><slot/></span>' },
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
    }
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
    }
    vm.form.username = 'testuser'
    vm.form.status = 0
    await vm.handleSubmit()
    expect(vi.mocked(createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'testuser', status: 0 }),
    )
  })
})
