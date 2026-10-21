import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/modules/system/api/post-delegate', () => ({
  pagePostDelegates: vi.fn(),
  createPostDelegate: vi.fn(),
  updatePostDelegate: vi.fn(),
  changePostDelegateStatus: vi.fn(),
  deletePostDelegate: vi.fn(),
}))

vi.mock('@/modules/system/api/post', () => ({
  pagePosts: vi.fn(),
}))

vi.mock('@/modules/system/api/dept', () => ({
  listDeptTree: vi.fn(),
}))

vi.mock('@/foundation/permission', () => ({
  hasPerm: vi.fn(() => true),
}))

import { pagePostDelegates } from '@/modules/system/api/post-delegate'
import { pagePosts } from '@/modules/system/api/post'
import { listDeptTree } from '@/modules/system/api/dept'
import { hasPerm } from '@/foundation/permission'
import type { PostDelegateRow } from '@/contracts/p64'
import PostDelegateList from './PostDelegateList.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="empty-action"/><div class="list-body"><slot/></div></div>',
    props: ['total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  ListActionsColumn: { template: '<div/>', props: ['actions', 'width'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-dialog': { template: '<div><slot/><slot name="footer"/></div>', props: ['modelValue'] },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-select': { template: '<select><slot/></select>' },
  'el-option': { template: '<option/>' },
  'el-radio-group': { template: '<div><slot/></div>' },
  'el-radio': { template: '<label><slot/></label>' },
  'el-input': { template: '<input/>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
}

const directives = { perm: { mounted() {} } }

const row: PostDelegateRow = {
  id: '1',
  sourcePostId: '10',
  targetPostId: '20',
  scopeType: 'ORG',
  status: 'ENABLED',
}

type Vm = {
  total: number
  pageNum: number
  pageSize: number
  filter: { status: string; scopeType: string }
  rowActions: (r: unknown) => Array<{ key: string; label: string; visible?: boolean }>
  handlePageNumChange: (page: number) => Promise<void>
  handleQuery: () => void
}

describe('PostDelegateList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pagePosts).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 200 })
    vi.mocked(listDeptTree).mockResolvedValue([])
    vi.mocked(pagePostDelegates).mockResolvedValue({
      list: [row],
      // 后端 Long → JSON string：列表页必须自行归一为 number
      total: '42' as unknown as number,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(hasPerm).mockReturnValue(true)
  })

  it('首屏按默认分页加载，total 字符串归一为 number', async () => {
    const wrapper = mount(PostDelegateList, {
      global: { stubs, directives },
    })
    await flushPromises()

    expect(pagePostDelegates).toHaveBeenCalledWith(1, 10, {})
    expect((wrapper.vm as unknown as Vm).total).toBe(42)
  })

  it('查询时携带状态与范围条件，并回到第一页', async () => {
    const wrapper = mount(PostDelegateList, { global: { stubs, directives } })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    vm.pageNum = 3
    vm.filter.status = 'ENABLED'
    vm.filter.scopeType = 'DEPT'
    vm.handleQuery()

    expect(pagePostDelegates).toHaveBeenLastCalledWith(1, 10, {
      status: 'ENABLED',
      scopeType: 'DEPT',
    })
  })

  it('翻页后按新页码重新加载', async () => {
    const wrapper = mount(PostDelegateList, { global: { stubs, directives } })
    await flushPromises()

    await (wrapper.vm as unknown as Vm).handlePageNumChange(2)
    expect(pagePostDelegates).toHaveBeenLastCalledWith(2, 10, {})
  })

  it('操作列：编辑 / 启停 / 删除，启停文案跟随状态', async () => {
    const wrapper = mount(PostDelegateList, { global: { stubs, directives } })
    await flushPromises()

    const actions = (wrapper.vm as unknown as Vm).rowActions(row)
    expect(actions.map((action) => action.key)).toEqual(['edit', 'toggle', 'delete'])
    expect(actions[1]!.label).toBe('停用')

    const disabled = (wrapper.vm as unknown as Vm).rowActions({ ...row, status: 'DISABLED' })
    expect(disabled[1]!.label).toBe('启用')
  })

  it('无权限时操作项全部隐藏（服务端仍是最终权威）', async () => {
    vi.mocked(hasPerm).mockReturnValue(false)
    const wrapper = mount(PostDelegateList, { global: { stubs, directives } })
    await flushPromises()

    const actions = (wrapper.vm as unknown as Vm).rowActions(row)
    expect(actions.every((action) => action.visible === false)).toBe(true)
  })
})
