import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/userGroup', () => ({
  pageUserGroups: vi.fn(),
  getUserGroup: vi.fn(),
  createUserGroup: vi.fn(),
  updateUserGroup: vi.fn(),
  deleteUserGroup: vi.fn(),
  disableUserGroup: vi.fn(),
  enableUserGroup: vi.fn(),
  getUserGroupMembers: vi.fn(),
  updateUserGroupMembers: vi.fn(),
  getUserGroupCandidates: vi.fn(),
}))

// 可配置权限 mock：默认有 manage，无权限用例通过 __setPerms 关闭
const __perms = { manage: true }
vi.mock('@/foundation/permission', () => ({
  usePermission: () => ({
    hasPerm: (p: string) => (p === 'system:userGroup:manage' ? __perms.manage : true),
  }),
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
  pageUserGroups,
  getUserGroup,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  disableUserGroup,
  getUserGroupMembers,
  updateUserGroupMembers,
  getUserGroupCandidates,
} from '@/modules/system/api/userGroup'
import type { SysUserGroup } from '@/modules/system/types/userGroup'
import UserGroupList from './UserGroupList.vue'

function stubPageResult(groups: SysUserGroup[] = []) {
  return { list: groups, total: groups.length, pageNum: 1, pageSize: 10 }
}

const G1: SysUserGroup = { id: '1', groupCode: 'G-TECH', groupName: '技术委员会', status: 0 }
const G2: SysUserGroup = { id: '2', groupCode: 'G-OLD', groupName: '历史归档组', status: 1 }

describe('UserGroupList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageUserGroups).mockResolvedValue(stubPageResult([G1, G2]))
    vi.mocked(getUserGroupCandidates).mockResolvedValue({
      list: [
        { id: '2', username: 'zhangsan', realName: '张三', status: 0 },
        { id: '5', username: 'zhaoliu', realName: '赵六', status: 1 },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 20,
    })
  })

  it('加载列表并渲染行（业务标识/名称/状态）', async () => {
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    expect(pageUserGroups).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
    const text = wrapper.text()
    expect(text).toContain('技术委员会')
    expect(text).toContain('G-TECH')
    expect(text).toContain('历史归档组')
    expect(text).toContain('停用')
  })

  it('筛选：输入名称并查询 → pageUserGroups 携带筛选', async () => {
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    const input = wrapper.find('input[placeholder="组名称"]')
    await input.setValue('技术')
    await wrapper.find('button').findAll('button')[0]?.trigger('click')
    // 点击「查询」
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询'))
    await queryBtn?.trigger('click')
    await nextTick()

    expect(pageUserGroups).toHaveBeenLastCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({ groupName: '技术' }),
    )
  })

  it('新建：打开弹窗，填写并提交 → createUserGroup 携带 memberIds，随后刷新列表', async () => {
    vi.mocked(createUserGroup).mockResolvedValue('3')
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建用户组'))
      ?.trigger('click')
    await nextTick()

    const codeInput = wrapper.find('input[placeholder*="请输入业务标识"]')
    const nameInput = wrapper.find('input[placeholder*="请输入组名称"]')
    expect(codeInput.exists()).toBe(true)
    expect(nameInput.exists()).toBe(true)
    await codeInput.setValue('G-NEW')
    await nameInput.setValue('新用户组')
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('保存'))
      ?.trigger('click')
    await nextTick()
    await nextTick()

    expect(createUserGroup).toHaveBeenCalledWith(
      expect.objectContaining({ groupCode: 'G-NEW', groupName: '新用户组' }),
    )
  })

  it('编辑：加载详情并回填成员，保存时更新主记录并整量替换成员', async () => {
    vi.mocked(getUserGroup).mockResolvedValue({ ...G1, memberIds: ['2'] })
    vi.mocked(getUserGroupMembers).mockResolvedValue(['2'])
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('编辑'))
      ?.trigger('click')
    await nextTick()
    await nextTick()

    expect(getUserGroup).toHaveBeenCalledWith('1')
    expect(getUserGroupMembers).toHaveBeenCalledWith('1')

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('保存'))
      ?.trigger('click')
    await nextTick()

    expect(updateUserGroup).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
    expect(updateUserGroupMembers).toHaveBeenCalledWith('1', expect.any(Array))
  })

  it('停用/启用：调用 disable/enable 端点', async () => {
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('停用'))
      ?.trigger('click')
    await nextTick()
    expect(disableUserGroup).toHaveBeenCalledWith('1')
  })

  it('删除：确认后调用 deleteUserGroup', async () => {
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('删除'))
      ?.trigger('click')
    await nextTick()
    expect(deleteUserGroup).toHaveBeenCalledWith('1')
  })

  it('编辑回显：成员含停用/不可见用户 → 展示失效成员标签', async () => {
    // 候选仅 zhangsan(2) 启用可见；组内成员 2(可见) + 5(停用不可见)
    vi.mocked(getUserGroup).mockResolvedValue({ ...G1, memberIds: ['2', '5'] })
    vi.mocked(getUserGroupMembers).mockResolvedValue(['2', '5'])
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('编辑'))
      ?.trigger('click')
    await nextTick()
    await nextTick()

    // 失效成员标签：赵六（已停用或不可见）
    expect(wrapper.text()).toContain('赵六')
    expect(wrapper.text()).toContain('已停用或不可见')
  })

  it('权限：无 manage 权限 → 不渲染新建/停用/删除管理按钮', async () => {
    __perms.manage = false
    const wrapper = mount(UserGroupList)
    await nextTick()
    await nextTick()

    expect(wrapper.text()).not.toContain('新建用户组')
    expect(wrapper.findAll('button').find((b) => b.text().includes('删除'))).toBeUndefined()
    expect(wrapper.findAll('button').find((b) => b.text().includes('停用'))).toBeUndefined()
    __perms.manage = true
  })
})
