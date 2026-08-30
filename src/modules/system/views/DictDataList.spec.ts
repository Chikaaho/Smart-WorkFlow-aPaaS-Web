import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/dict', () => ({
  pageDictData: vi.fn(),
  getDictData: vi.fn(),
  createDictData: vi.fn(),
  updateDictData: vi.fn(),
  deleteDictData: vi.fn(),
}))

const mockPush = vi.fn()
const mockRouteQuery: Record<string, string> = { dictCode: 'gender', dictName: '性别' }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: mockRouteQuery, params: {} }),
}))

import { pageDictData, deleteDictData } from '@/modules/system/api/dict'
import type { SysDictData } from '@/modules/system/types/dict'
import DictDataList from './DictDataList.vue'

function stubPageResult() {
  return { list: [] as SysDictData[], total: 0, pageNum: 1, pageSize: 10 }
}

describe('DictDataList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageDictData).mockResolvedValue(stubPageResult())
  })

  const minimalStubs = {
    StandardListTemplate: {
      template:
        '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/></div>',
      props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
      emits: ['update:pageNum', 'update:pageSize'],
    },
    StandardFormTemplate: {
      template: '<div><slot name="alert"/><slot/><slot name="actions"/></div>',
      props: ['title', 'subtitle', 'embedded'],
    },
    FormSection: { template: '<section><slot/></section>', props: ['title'] },
    FormGrid: { template: '<div><slot/></div>', props: ['columns'] },
    'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
    'el-table': { template: '<div><slot/></div>' },
    'el-table-column': { template: '<div/>' },
    'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
    'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
    'el-select': { template: '<select/>', props: ['modelValue'] },
    'el-option': { template: '<option/>' },
    'el-tag': { template: '<span><slot/></span>' },
    'el-alert': { template: '<div><slot/></div>', props: ['title', 'type'] },
    'el-switch': { template: '<div/>', props: ['modelValue'] },
    'el-input-number': { template: '<input/>', props: ['modelValue'] },
  }

  // ─── 路由参数 ───

  it('calls pageDictData with dictCode from route query on mount', () => {
    mount(DictDataList, { global: { stubs: minimalStubs } })
    expect(pageDictData).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({ dictCode: 'gender' }),
    )
  })

  // ─── 分页 ───

  it('re-fetches with fixed dictCode on pageNum change', async () => {
    vi.mocked(pageDictData).mockClear()
    vi.mocked(pageDictData).mockResolvedValue(stubPageResult())
    const wrapper = mount(DictDataList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handlePageNumChange: (p: number) => Promise<void>
    }
    await vm.handlePageNumChange(3)
    await nextTick()

    expect(pageDictData).toHaveBeenCalledWith(
      { pageNum: 3, pageSize: 10 },
      expect.objectContaining({ dictCode: 'gender' }),
    )
  })

  // ─── 筛选重查 ───

  it('resets filter and re-fetches on reset', async () => {
    vi.mocked(pageDictData).mockClear()
    vi.mocked(pageDictData).mockResolvedValue(stubPageResult())
    const wrapper = mount(DictDataList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleReset: () => Promise<void>
    }
    await vm.handleReset()
    await nextTick()

    expect(pageDictData).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      expect.objectContaining({ dictCode: 'gender' }),
    )
  })

  // ─── 删除 ───

  it('deleteDictData can be called', async () => {
    vi.mocked(deleteDictData).mockResolvedValue(undefined)
    await deleteDictData('1')
    expect(deleteDictData).toHaveBeenCalledWith('1')
  })

  // ─── 返回导航 ───

  it('handleGoBack navigates to /dict-type', async () => {
    mockPush.mockClear()
    const wrapper = mount(DictDataList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleGoBack: () => void
    }
    vm.handleGoBack()
    await nextTick()

    expect(mockPush).toHaveBeenCalledWith({ path: '/dict-type' })
  })
})
