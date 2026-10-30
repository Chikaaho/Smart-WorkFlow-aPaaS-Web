import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setLocale } from '@/locales'

const permission = vi.hoisted(() => ({ canManage: true }))
const iconStub = vi.hoisted(() => ({ component: { template: '<i />' } }))

vi.mock('@/foundation/permission', () => ({
  hasPerm: () => permission.canManage,
}))

vi.mock('@/modules/system/api/menu', () => ({
  listMenuItems: vi.fn(),
  updateMenuItem: vi.fn(),
}))

vi.mock('@/layouts/menu-icons', () => ({
  MENU_ICON_KEYS: ['Setting', 'User'],
  menuIcon: () => iconStub.component,
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn() },
  }
})

import { listMenuItems, type MenuManageItem } from '@/modules/system/api/menu'
import MenuList from './MenuList.vue'

const system: MenuManageItem = {
  id: '1',
  parentId: null,
  name: 'system',
  title: '系统管理',
  path: 'system',
  icon: null,
  sort: 1,
  hidden: false,
  menuType: 0,
}
const dictDirectory: MenuManageItem = {
  id: '2',
  parentId: '1',
  name: 'dict',
  title: '字典管理',
  path: 'system/dict',
  icon: null,
  sort: 2,
  hidden: false,
  menuType: 0,
}
const dictItems: MenuManageItem = {
  id: '3',
  parentId: '2',
  name: 'dict-data',
  title: '字典项管理',
  path: 'system/dict-data',
  icon: null,
  sort: 1,
  hidden: false,
  menuType: 1,
}
const users: MenuManageItem = {
  id: '4',
  parentId: '1',
  name: 'users',
  title: '用户管理',
  path: 'system/user',
  icon: null,
  sort: 3,
  hidden: false,
  menuType: 1,
}

const menuContentStubs = {
  ListFilterItem: { template: '<label><slot/></label>' },
  ListActionsColumn: { template: '<div class="actions-stub"/>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': { template: '<input/>' },
  'el-input-number': { template: '<input type="number"/>' },
  'el-switch': { template: '<span/>' },
  'el-icon': { template: '<span><slot/></span>' },
  'el-alert': { template: '<div/>' },
}

const stubs = {
  ...menuContentStubs,
  StandardListTemplate: {
    props: { hidePagination: Boolean },
    template:
      '<section class="system-list-stub" :data-hide-pagination="String(hidePagination)"><slot name="table-title"/><slot name="filter"/><slot/></section>',
  },
}

function mountMenu() {
  return mount(MenuList, { global: { stubs } })
}

describe('MenuList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission.canManage = true
    setLocale('zh-CN')
    vi.mocked(listMenuItems).mockResolvedValue([users, dictItems, system, dictDirectory])
  })

  it('树形列表禁用无意义分页，并按后端顺序生成目录', async () => {
    const wrapper = mountMenu()
    await flushPromises()

    expect(listMenuItems).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.system-list-stub').attributes('data-hide-pagination')).toBe('true')
    expect((wrapper.vm as unknown as { tree: unknown[] }).tree).toHaveLength(1)
  })

  it('StandardListTemplate 实际消费 hidePagination 后不渲染分页控件', async () => {
    const wrapper = mount(MenuList, {
      global: {
        stubs: {
          ...menuContentStubs,
          ListPagination: { template: '<div class="pagination-stub" />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.pagination-stub').exists()).toBe(false)
  })

  it('深层子项命中时保留祖先与必要路径，非命中兄弟不进入结果', async () => {
    const wrapper = mountMenu()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      keyword: string
      tree: Array<{ dir: MenuManageItem; subItems: MenuManageItem[] }>
    }

    vm.keyword = '字典项管理'
    await nextTick()

    expect(vm.tree).toHaveLength(1)
    expect(vm.tree[0]!.dir.id).toBe('1')
    expect(vm.tree[0]!.subItems.map((item) => item.id)).toEqual(['2', '3'])
  })

  it('无管理权限时不暴露编辑操作，也不打开编辑弹窗', async () => {
    permission.canManage = false
    const wrapper = mountMenu()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      dialogVisible: boolean
      openEdit: (row: MenuManageItem) => void
      rowActions: (row: MenuManageItem) => Array<{ visible?: boolean }>
    }

    expect(vm.rowActions(system)[0]!.visible).toBe(false)
    vm.openEdit(system)
    await nextTick()
    expect(vm.dialogVisible).toBe(false)
  })

  it('图标选项使用可聚焦按钮并暴露选中状态', async () => {
    const wrapper = mountMenu()
    await flushPromises()
    const vm = wrapper.vm as unknown as { openEdit: (row: MenuManageItem) => void }

    vm.openEdit(system)
    await nextTick()

    const options = wrapper.findAll('.icon-picker__cell')
    expect(options).toHaveLength(2)
    expect(options[0]!.element.tagName).toBe('BUTTON')
    expect(options[0]!.attributes('type')).toBe('button')
    expect(options[0]!.attributes('aria-pressed')).toBe('false')
    expect(options[0]!.attributes('aria-label')).toContain('图标')

    await options[0]!.trigger('click')
    expect(options[0]!.attributes('aria-pressed')).toBe('true')
  })
})
