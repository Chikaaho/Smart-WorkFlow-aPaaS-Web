import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// ─── Mock 依赖：只保留链路断言所需的边界 ───
// 注：工厂被 hoist 到文件顶部，内部不能引用模块级变量，故桩函数在工厂里现建。

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/modules/workflow/api/oa', () => ({
  queryCatalogItems: vi.fn(),
  queryCategoryCounts: vi.fn(),
  queryCatalogItem: vi.fn(),
  listPortalCategories: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listMyFavorites: vi.fn(),
  favoriteProcess: vi.fn(),
  unfavoriteProcess: vi.fn(),
  frequentlyStarted: vi.fn(),
  recentlyUsed: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import * as oa from '@/modules/workflow/api/oa'
import { ElMessage } from 'element-plus'
import ProcessCatalog from '@/modules/workflow/views/ProcessCatalog.vue'
import { useUserStore } from '@/stores/user'
import type { CatalogCategory } from '@/modules/workflow/api/oa'

// ─── 桩组件 ───

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width'],
  },
  'el-input': {
    // 桥接 v-model（update:modelValue）与 keyup（供 @keyup.enter 触发新建）
    template:
      '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />',
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
}

function mountCatalog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  // 分类维护入口按 workflow:catalog:manage 权限呈现，用超管身份挂载
  useUserStore().superAdmin = true
  return mount(ProcessCatalog, {
    global: { plugins: [pinia], stubs, directives: { loading: {} } },
  })
}

const CATEGORY: CatalogCategory = { id: 9, name: '财务', sortNo: 0, itemCount: 0 }

async function openManageDialog(wrapper: ReturnType<typeof mountCatalog>) {
  await wrapper.get('.catalog-tree__manage').trigger('click')
  await nextTick()
  await nextTick()
}

function createButtonOf(wrapper: ReturnType<typeof mountCatalog>) {
  return wrapper.get('.category-manage__new button')
}

function nameInputOf(wrapper: ReturnType<typeof mountCatalog>) {
  return wrapper.get('.category-manage__new input')
}

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
  vi.mocked(oa.listCategories).mockResolvedValue([])
  vi.mocked(oa.createCategory).mockResolvedValue(CATEGORY)
})

describe('ProcessCatalog 管理分类（BF20261013-049）', () => {
  it('名称为空时「新建」按钮禁用，不会发出请求', async () => {
    const wrapper = mountCatalog()
    await openManageDialog(wrapper)

    expect(createButtonOf(wrapper).attributes('disabled')).toBeDefined()

    await nameInputOf(wrapper).setValue('   ')
    await nextTick()
    expect(createButtonOf(wrapper).attributes('disabled')).toBeDefined()

    await nameInputOf(wrapper).setValue('财务')
    await nextTick()
    expect(createButtonOf(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('名称为空时回车：提示必填且不发创建请求（原实现静默无反馈）', async () => {
    const wrapper = mountCatalog()
    await openManageDialog(wrapper)

    await nameInputOf(wrapper).trigger('keyup', { key: 'Enter' })
    await nextTick()

    expect(oa.createCategory).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalledWith('分类名称不能为空')
  })

  it('填写名称后「新建」：创建分类、刷新列表与左树、清空输入并提示成功', async () => {
    const wrapper = mountCatalog()
    await openManageDialog(wrapper)
    const listCallsBefore = vi.mocked(oa.listCategories).mock.calls.length

    await nameInputOf(wrapper).setValue('财务')
    await nextTick()
    await createButtonOf(wrapper).trigger('click')
    await flushPromises()
    await nextTick()

    expect(oa.createCategory).toHaveBeenCalledTimes(1)
    expect(oa.createCategory).toHaveBeenCalledWith({ name: '财务' })
    expect(vi.mocked(oa.listCategories).mock.calls.length).toBeGreaterThan(listCallsBefore)
    expect(oa.queryCatalogItems).toHaveBeenCalledTimes(2)
    expect((nameInputOf(wrapper).element as HTMLInputElement).value).toBe('')
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('分类已创建')
  })

  it('分类为空时弹窗展示「暂无分类」而非「暂无可发起的事项」', async () => {
    const wrapper = mountCatalog()
    await openManageDialog(wrapper)

    expect(wrapper.get('.category-manage__list .el-empty').text()).toBe('暂无分类')
  })

  it('已有分类时展示分类行（含重命名/删除入口）', async () => {
    vi.mocked(oa.listCategories).mockResolvedValue([CATEGORY])
    const wrapper = mountCatalog()
    await openManageDialog(wrapper)

    const rows = wrapper.findAll('.category-manage__row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('财务')
    expect(rows[0]!.text()).toContain('重命名')
    expect(rows[0]!.text()).toContain('删除')
    expect(wrapper.find('.category-manage__list .el-empty').exists()).toBe(false)
  })
})
