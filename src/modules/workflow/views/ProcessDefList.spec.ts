import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {} }),
}))

import { pageProcessDefs } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import ProcessDefList from './ProcessDefList.vue'

const stubs = {
  StandardListTemplate: {
    template: '<div><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
}

const mockDefs: ProcessDef[] = [
  {
    id: 1,
    processKey: 'skeleton_approval',
    name: '单节点审批流程',
    formKey: 'it_application',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-05 10:00:00',
    updateTime: '2026-07-05 10:00:00',
  },
  {
    id: 2,
    processKey: 'leave_approval',
    name: '请假审批流程',
    formKey: 'leave-request',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-08 14:20:00',
    updateTime: '2026-07-09 09:10:00',
  },
]

describe('ProcessDefList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls pageProcessDefs with pageNum=1 pageSize=10 on mount', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    expect(pageProcessDefs).toHaveBeenCalledOnce()
    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
  })

  it('re-fetches on pageNum change', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()

    vi.mocked(pageProcessDefs).mockClear()
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: [mockDefs[0]],
      total: 5,
      pageNum: 2,
      pageSize: 10,
    })

    const vm = wrapper.vm as unknown as { handlePageNumChange: (p: number) => Promise<void> }
    await vm.handlePageNumChange(2)
    await nextTick()

    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 2, pageSize: 10 })
  })

  it('resets to page 1 on pageSize change', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()

    vi.mocked(pageProcessDefs).mockClear()
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 20,
    })

    const vm = wrapper.vm as unknown as { handlePageSizeChange: (s: number) => Promise<void> }
    await vm.handlePageSizeChange(20)
    await nextTick()

    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 20 })
  })

  it('shows fallback error message when API fails with non-ApiError', async () => {
    vi.mocked(pageProcessDefs).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm as unknown as { errorMsg: string }).toHaveProperty(
      'errorMsg',
      '加载流程定义列表失败',
    )
  })

  it('displays empty state when list is empty', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm as unknown as { isEmpty: boolean }).toHaveProperty('isEmpty', true)
  })
})
