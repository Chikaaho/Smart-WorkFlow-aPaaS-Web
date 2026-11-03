import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppTreeNav from './AppTreeNav.vue'
import type { FormAppDir, FormAppFormItem } from '@/contracts/app-center'

const hasPermMock = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/foundation/permission', () => ({ hasPerm: hasPermMock }))

const form: FormAppFormItem = {
  formId: 'f1',
  formKey: 'form_key_1',
  name: '演练资源清单',
  status: 'PUBLISHED',
  dirId: 'd1',
}

const dirs: FormAppDir[] = [{ id: 'd1', appId: 'app-1', name: '目录一', sortNo: 1, forms: [form] }]

function mountNav() {
  return mount(AppTreeNav, {
    props: {
      dirs,
      directForms: [],
      selectedFormKey: 'form_key_1',
      appName: 'CH 科技',
      backTitle: '返回应用列表',
    },
    global: {
      stubs: {
        'el-icon': { template: '<i><slot/></i>' },
        AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
      },
    },
  })
}

describe('AppTreeNav 整栏收起（设计 272:1296）', () => {
  it('默认展开：应用名行右端有收起按钮，目录树可见', () => {
    const wrapper = mountNav()
    expect(wrapper.find('[data-testid="app-tree-nav-collapse"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-tree-dir"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-tree-nav-expand"]').exists()).toBe(false)
  })

  it('点击收起：整栏进入 is-collapsed，树隐藏，左缘浮动展开按钮出现', async () => {
    const wrapper = mountNav()
    await wrapper.find('[data-testid="app-tree-nav-collapse"]').trigger('click')
    expect(wrapper.find('aside.app-tree-nav.is-collapsed').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-tree-dir"]').exists()).toBe(false)
    const expander = wrapper.find('[data-testid="app-tree-nav-expand"]')
    expect(expander.exists()).toBe(true)
    expect(expander.attributes('aria-label')).toBe('展开目录')
  })

  it('点击展开按钮恢复目录树', async () => {
    const wrapper = mountNav()
    await wrapper.find('[data-testid="app-tree-nav-collapse"]').trigger('click')
    await wrapper.find('[data-testid="app-tree-nav-expand"]').trigger('click')
    expect(wrapper.find('aside.app-tree-nav.is-collapsed').exists()).toBe(false)
    expect(wrapper.find('[data-testid="app-tree-dir"]').exists()).toBe(true)
  })
})

describe('B021-021 管理动作门禁', () => {
  it('用户端视图（缺省 manageable）：即便有管理权限也不渲染目录/表单管理菜单', () => {
    const wrapper = mountNav()
    expect(wrapper.find('[data-testid="dir-more-d1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="form-more-form_key_1"]').exists()).toBe(false)
  })

  it('管理端工作台（manageable + form:app:manage）：管理菜单照常渲染', () => {
    const wrapper = mount(AppTreeNav, {
      props: {
        dirs,
        directForms: [],
        selectedFormKey: 'form_key_1',
        appName: 'CH 科技',
        backTitle: '返回应用列表',
        manageable: true,
      },
      global: {
        stubs: {
          'el-icon': { template: '<i><slot/></i>' },
          AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
        },
      },
    })
    expect(wrapper.find('[data-testid="dir-more-d1"]').exists()).toBe(true)
  })
})
