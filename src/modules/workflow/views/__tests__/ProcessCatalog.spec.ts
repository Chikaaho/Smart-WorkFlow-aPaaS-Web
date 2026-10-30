import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ─── Mock 依赖：只保留链路断言所需的边界 ───
// 注：工厂被 hoist 到文件顶部，内部不能引用模块级变量，故桩函数在工厂里现建。

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

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

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import * as oa from '@/modules/workflow/api/oa'
import ProcessCatalog from '@/modules/workflow/views/ProcessCatalog.vue'
import { useUserStore } from '@/stores/user'
import type { CatalogCategory } from '@/modules/workflow/api/oa'

// ─── 桩组件 ───

const stubs = {
  'el-input': {
    template:
      '<input class="el-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />',
    props: ['modelValue', 'placeholder', 'maxlength', 'clearable'],
    emits: ['update:modelValue', 'keyup'],
  },
  'el-button': {
    template: '<button :disabled="disabled"><slot/></button>',
    props: ['disabled', 'type', 'link', 'size', 'loading'],
  },
  'el-empty': {
    template: '<div class="el-empty">{{ description }}</div>',
    props: ['description', 'imageSize'],
  },
  ListPagination: {
    template:
      '<button class="pagination-stub" @click="$emit(\'update:pageNum\', 2)">page2</button>',
    props: ['total', 'pageNum', 'pageSize'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
}

function mountCatalog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useUserStore().superAdmin = true
  return mount(ProcessCatalog, {
    global: { plugins: [pinia], stubs, directives: { loading: {} } },
  })
}

const CATEGORY: CatalogCategory = { id: 9, name: '财务', sortNo: 0, itemCount: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(oa.queryCatalogItems).mockResolvedValue({
    list: [],
    total: 0,
    pageNum: 1,
    pageSize: 60,
  })
  vi.mocked(oa.listPortalCategories).mockResolvedValue([])
  vi.mocked(oa.queryCategoryCounts).mockResolvedValue({})
  vi.mocked(oa.listMyFavorites).mockResolvedValue([])
  vi.mocked(oa.frequentlyStarted).mockResolvedValue([])
  vi.mocked(oa.recentlyUsed).mockResolvedValue([])
})

describe('ProcessCatalog 前台流程中心（BF20261013-051：分类维护移交管理端）', () => {
  it('分类维护入口不再出现在前台（超管身份也不出现，且无该文案）', async () => {
    const wrapper = mountCatalog()
    await flushPromises()

    expect(wrapper.find('.catalog-tree__manage').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('管理分类')
    // 弹窗本体（含新建/重命名/删除）随入口一并退场
    expect(wrapper.find('.category-manage').exists()).toBe(false)
  })

  it('分类树仍按服务端分类渲染并按分类过滤（只读浏览能力保留）', async () => {
    vi.mocked(oa.listPortalCategories).mockResolvedValue([CATEGORY])
    const wrapper = mountCatalog()
    await flushPromises()

    const items = wrapper.findAll('.catalog-tree__item')
    // 「全部」+ 分类「财务」+ 固定「未分类」入口（参考 97:2 计数 0 也保留）
    expect(items.length).toBe(3)
    expect(items[1]!.text()).toContain('财务')
    expect(items[2]!.text()).toContain('未分类')

    await items[1]!.trigger('click')
    await flushPromises()
    const lastCall = vi.mocked(oa.queryCatalogItems).mock.calls.at(-1)!
    // 雪花分类 ID 按字符串透传（避免 JS 安全整数精度丢失），断言原值不丢
    expect(lastCall[1]).toMatchObject({ categoryId: '9' })
  })

  it('流程中心的搜索框保留（Owner：流程中心保留搜索）', async () => {
    const wrapper = mountCatalog()
    await flushPromises()

    expect(wrapper.find('.catalog-page__search').exists()).toBe(true)
  })

  it('分页可请求第二页且首次查询使用 10 条分页', async () => {
    vi.mocked(oa.queryCatalogItems).mockResolvedValue({
      list: [
        {
          itemKey: 'f1',
          name: '流程一',
          formKey: 'form_f1',
          categoryId: null,
          status: 'PUBLISHED',
          formPublished: true,
          bindingActive: true,
        },
      ],
      total: 21,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mountCatalog()
    await flushPromises()
    expect(vi.mocked(oa.queryCatalogItems).mock.calls.at(-1)?.[0]).toMatchObject({
      pageNum: 1,
      pageSize: 10,
    })

    await wrapper.find('.pagination-stub').trigger('click')
    await flushPromises()
    expect(vi.mocked(oa.queryCatalogItems).mock.calls.at(-1)?.[0]).toMatchObject({
      pageNum: 2,
      pageSize: 10,
    })
  })

  // 0.1.7 #25 回归：左上角标题/描述与「可发起 N 个流程」「全部流程 · N 个可发起」汇总计数为噪音
  it('#25：页首无标题/描述/汇总计数噪音，分类树与搜索工具栏即页首', async () => {
    vi.mocked(oa.queryCatalogItems).mockResolvedValue({
      list: [],
      total: 3,
      pageNum: 1,
      pageSize: 60,
    })
    const wrapper = mountCatalog()
    await flushPromises()

    expect(wrapper.find('.catalog-page__title').exists()).toBe(false)
    expect(wrapper.find('.catalog-page__subtitle').exists()).toBe(false)
    expect(wrapper.find('.catalog-page__count').exists()).toBe(false)
    expect(wrapper.find('.catalog-page__result-title').exists()).toBe(false)
    const root = wrapper.find('.catalog-page')
    expect(root.element.firstElementChild?.className).toContain('catalog-layout')
  })
})
