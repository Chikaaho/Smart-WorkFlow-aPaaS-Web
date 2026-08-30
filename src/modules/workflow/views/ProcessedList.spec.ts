import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

vi.mock('@/modules/workflow/api', () => ({
  queryProcessedTasks: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  }
})

import { queryProcessedTasks } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessedTask } from '@/contracts/bpm'
import ProcessedList from './ProcessedList.vue'

const stubs = {
  StandardListTemplate: {
    template: '<div><slot/><slot name="toolbar-actions"/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
}

const mockRecords: ProcessedTask[] = [
  {
    taskId: 't1',
    taskName: '审批',
    processInstanceId: 'pi-001',
    processName: '单节点审批',
    formKey: 'leave-request',
    businessKey: 'fd_001',
    createTime: '2026-07-16T10:00:00',
    endTime: '2026-07-16T11:00:00',
  },
]

const mockPageResult = {
  list: mockRecords,
  total: 1,
  pageNum: 1,
  pageSize: 10,
}

describe('ProcessedList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls queryProcessedTasks with pageNum=1 pageSize=10 on mount', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce(mockPageResult)
    mount(ProcessedList, { global: { stubs } })
    await nextTick()
    expect(queryProcessedTasks).toHaveBeenCalledOnce()
    expect(queryProcessedTasks).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
  })

  it('re-fetches on pageNum change', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()

    vi.mocked(queryProcessedTasks).mockClear()
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce({
      list: [mockRecords[0]],
      total: 1,
      pageNum: 2,
      pageSize: 10,
    })

    const vm = wrapper.vm as unknown as { handlePageNumChange: (p: number) => Promise<void> }
    await vm.handlePageNumChange(2)
    await nextTick()

    expect(queryProcessedTasks).toHaveBeenCalledWith({ pageNum: 2, pageSize: 10 })
  })

  it('resets to page 1 on pageSize change', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()

    vi.mocked(queryProcessedTasks).mockClear()
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce({
      list: mockRecords,
      total: 1,
      pageNum: 1,
      pageSize: 20,
    })

    const vm = wrapper.vm as unknown as { handlePageSizeChange: (s: number) => Promise<void> }
    await vm.handlePageSizeChange(20)
    await nextTick()

    expect(queryProcessedTasks).toHaveBeenCalledWith({ pageNum: 1, pageSize: 20 })
  })

  it('shows fallback error on non-ApiError', async () => {
    vi.mocked(queryProcessedTasks).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '加载已办任务失败')
  })

  it('shows ApiError message on business error', async () => {
    vi.mocked(queryProcessedTasks).mockRejectedValueOnce(new ApiError(2001, '已办列表为空'))
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm).toHaveProperty('errorMsg', '已办列表为空')
  })

  it('displays empty state when list is empty', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.vm as unknown as { isEmpty: boolean }).toHaveProperty('isEmpty', true)
  })

  it('renders endTime as - when null', async () => {
    const recordsWithNullEnd = [{ ...mockRecords[0], endTime: null }]
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce({
      list: recordsWithNullEnd,
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { list: ProcessedTask[] }
    expect(vm.list[0].endTime).toBeNull()
  })

  it('navigates to TaskDetail on row click', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { handleRowClick: (r: ProcessedTask) => void }
    vm.handleRowClick(mockRecords[0])

    expect(mockPush).toHaveBeenCalledWith({
      name: 'TaskDetail',
      params: { taskId: 't1' },
    })
  })

  it('navigates to TodoList on toolbar button click', async () => {
    vi.mocked(queryProcessedTasks).mockResolvedValueOnce(mockPageResult)
    const wrapper = mount(ProcessedList, { global: { stubs } })
    await nextTick()

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(mockPush).toHaveBeenCalledWith({ name: 'TodoList' })
  })
})
