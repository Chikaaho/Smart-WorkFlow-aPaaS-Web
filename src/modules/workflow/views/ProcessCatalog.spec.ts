import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

vi.mock('@/modules/workflow/api/oa', () => ({
  queryCatalogItems: vi.fn(),
  queryCategoryCounts: vi.fn(),
  queryCatalogItem: vi.fn(),
  listPortalCategories: vi.fn(),
  listMyFavorites: vi.fn(),
  favoriteProcess: vi.fn(),
  unfavoriteProcess: vi.fn(),
  frequentlyStarted: vi.fn(),
  recentlyUsed: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import {
  queryCatalogItems,
  queryCategoryCounts,
  listPortalCategories,
  listMyFavorites,
  frequentlyStarted,
  recentlyUsed,
} from '@/modules/workflow/api/oa'
import ProcessCatalog from './ProcessCatalog.vue'

const stubs = {
  CategorySidebar: { template: '<aside class="category-sidebar"><slot/></aside>' },
  ListPagination: { template: '<div />' },
  'el-tooltip': { template: '<div class="el-tooltip-stub"><slot/></div>' },
  'el-input': { template: '<div />', props: ['modelValue'] },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
    props: ['loading', 'disabled'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-empty': { template: '<div />' },
}

function mountPage() {
  return mount(ProcessCatalog, {
    global: { stubs, directives: { loading: {} } },
  })
}

async function seedCatalog() {
  vi.mocked(queryCatalogItems).mockResolvedValue({
    list: [
      {
        itemKey: 'a16',
        name: 'A16 全链流程',
        formKey: 'form_a16',
        categoryId: 1,
        description: null,
      },
    ],
    total: 3,
    pageNum: 1,
    pageSize: 20,
  } as never)
  vi.mocked(listPortalCategories).mockResolvedValue([{ id: 1, name: '行政办公' }] as never)
  vi.mocked(queryCategoryCounts).mockResolvedValue({ '1': 2, '0': 1 } as never)
  vi.mocked(listMyFavorites).mockResolvedValue([] as never)
  vi.mocked(frequentlyStarted).mockResolvedValue([] as never)
  vi.mocked(recentlyUsed).mockResolvedValue([] as never)
}

describe('ProcessCatalog.vue 分类侧栏', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushSpy.mockClear()
  })

  it('渲染分类行：全部/分类/未分类带数量徽标，名称左对齐数量靠右', async () => {
    await seedCatalog()
    const wrapper = mountPage()
    await flushPromises()
    const rows = wrapper.findAll('.catalog-tree__item')
    expect(rows.length).toBe(3)
    expect(rows[0].text()).toContain('全部')
    expect(rows[0].find('.catalog-tree__count').text()).toBe('3')
    expect(rows[1].text()).toContain('行政办公')
    expect(rows[1].find('.catalog-tree__count').text()).toBe('2')
    expect(rows[2].text()).toContain('未分类')
    expect(rows[2].find('.catalog-tree__count').text()).toBe('1')
    expect(wrapper.find('.catalog-tree__title').text()).toBe('流程分类')
  })

  it('点击分类行走同一过滤链路（categoryId 传参、页码复位）', async () => {
    await seedCatalog()
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('.catalog-tree__item')[1].trigger('click')
    await flushPromises()
    expect(queryCatalogItems).toHaveBeenCalledTimes(2)
    const secondCall = vi.mocked(queryCatalogItems).mock.calls[1]
    // 雪花分类 ID 按字符串透传（避免 JS 安全整数精度丢失），断言原值不丢
    expect(secondCall?.[1]?.categoryId).toBe('1')
    expect(wrapper.findAll('.catalog-tree__item')[1].classes()).toContain('is-active')
  })

  it('底部开关切换收起态：列宽类、首字兜底与提示内容', async () => {
    await seedCatalog()
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.catalog-layout').classes()).not.toContain('catalog-layout--collapsed')
    await wrapper.find('.catalog-tree__toggle').trigger('click')
    await nextTick()
    expect(wrapper.find('.catalog-layout').classes()).toContain('catalog-layout--collapsed')
    expect(wrapper.find('.catalog-tree').classes()).toContain('catalog-tree--collapsed')
    const glyphs = wrapper.findAll('.catalog-tree__glyph')
    expect(glyphs.length).toBe(3)
    expect(glyphs[1].text()).toBe('行')
    expect(wrapper.findAll('.catalog-tree__count').length).toBe(0)
    const tooltip = wrapper.findAll('.el-tooltip-stub')[1]
    expect(tooltip.attributes('content')).toBe('行政办公 2')
    await wrapper.find('.catalog-tree__toggle').trigger('click')
    await nextTick()
    expect(wrapper.find('.catalog-layout').classes()).not.toContain('catalog-layout--collapsed')
    // 0.2.0 参考节点 97:2：展开态首字为纯文字（无灰底方块），收起态同一首字兜底。
    const expandedGlyphs = wrapper.findAll('.catalog-tree__glyph')
    expect(expandedGlyphs.length).toBe(3)
    expect(expandedGlyphs[1].text()).toBe('行')
    expect(expandedGlyphs[1].classes()).not.toContain('catalog-tree__glyph--chip')
    expect(wrapper.findAll('.catalog-tree__count').length).toBe(3)
  })
})
