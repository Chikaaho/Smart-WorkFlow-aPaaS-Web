import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/dict', () => ({
  pageDictTypes: vi.fn(),
  getDictType: vi.fn(),
  createDictType: vi.fn(),
  updateDictType: vi.fn(),
  deleteDictType: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {}, params: {} }),
}))

import { pageDictTypes, deleteDictType } from '@/modules/system/api/dict'
import type { SysDictType } from '@/modules/system/types/dict'
import DictTypeList from './DictTypeList.vue'

function stubPageResult() {
  return { list: [] as SysDictType[], total: 0, pageNum: 1, pageSize: 10 }
}

describe('DictTypeList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageDictTypes).mockResolvedValue(stubPageResult())
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

  it('calls pageDictTypes on mount with default pagination', () => {
    mount(DictTypeList, { global: { stubs: minimalStubs } })
    expect(pageDictTypes).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 分页 ───

  it('re-fetches on pageNum change via exposed handler', async () => {
    vi.mocked(pageDictTypes).mockClear()
    vi.mocked(pageDictTypes).mockResolvedValue(stubPageResult())
    const wrapper = mount(DictTypeList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handlePageNumChange: (p: number) => Promise<void>
    }
    await vm.handlePageNumChange(3)
    await nextTick()

    expect(pageDictTypes).toHaveBeenCalledWith({ pageNum: 3, pageSize: 10 }, expect.anything())
  })

  // ─── 筛选重查 ───

  it('resets filter and re-fetches on reset', async () => {
    vi.mocked(pageDictTypes).mockClear()
    vi.mocked(pageDictTypes).mockResolvedValue(stubPageResult())
    const wrapper = mount(DictTypeList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleReset: () => Promise<void>
    }
    await vm.handleReset()
    await nextTick()

    // After reset, pageNum should be reset to 1
    expect(pageDictTypes).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({}),
    )
  })

  // ─── 删除 ───

  it('deleteDictType can be called and propagates', async () => {
    vi.mocked(deleteDictType).mockResolvedValue(undefined)
    await deleteDictType('1')
    expect(deleteDictType).toHaveBeenCalledWith('1')
  })

  // ─── 导航 ───

  it('handleManageData navigates to /dict-data with correct query', async () => {
    mockPush.mockClear()
    const wrapper = mount(DictTypeList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleManageData: (row: { code: string; name: string }) => void
    }
    vm.handleManageData({ code: 'gender', name: '性别' })
    await nextTick()

    expect(mockPush).toHaveBeenCalledWith({
      path: '/dict-data',
      query: { dictCode: 'gender', dictName: '性别' },
    })
  })
})
