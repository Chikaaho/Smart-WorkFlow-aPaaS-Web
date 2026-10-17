import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/form/api/app-center', () => ({
  getFormAppContent: vi.fn(),
  listFormApps: vi.fn(),
  createFormAppDir: vi.fn(),
  updateFormAppDir: vi.fn(),
  deleteFormAppDir: vi.fn(),
  assignFormMembership: vi.fn(),
}))

vi.mock('@/modules/form/api/form-def', () => ({
  createFormDef: vi.fn(),
  saveFormConfig: vi.fn(),
}))

vi.mock('@/modules/form/api/i2-choices', () => ({
  disableFormDef: vi.fn(),
  enableFormDef: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: { appId: 'app-1' } }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { getFormAppContent } from '@/modules/form/api/app-center'
import type { FormAppContent } from '@/contracts/app-center'
import AppWorkspace from './AppWorkspace.vue'

const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  ListActionsColumn: { template: '<div/>', props: ['actions', 'width'] },
  AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-card': { template: '<div><slot/></div>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': { template: '<input/>', props: ['modelValue'] },
  'el-input-number': { template: '<input/>', props: ['modelValue'] },
  'el-select': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-option': { template: '<div/>' },
  'el-tag': { template: '<span><slot/></span>' },
}

function content(): FormAppContent {
  return {
    app: {
      id: 'app-1',
      name: '报销应用',
      sortNo: 0,
      visibleScopeType: 'ALL',
      status: 'ENABLED',
      source: 'MANUAL',
      formCount: 2,
      dirCount: 1,
    },
    dirs: [
      {
        id: 'dir-1',
        appId: 'app-1',
        name: '差旅',
        sortNo: 0,
        formCount: 1,
        forms: [
          {
            formId: 'f1',
            formKey: 'travel_form',
            name: '差旅报销',
            status: 'PUBLISHED',
            dirId: 'dir-1',
          },
        ],
      },
    ],
    directForms: [
      { formId: 'f2', formKey: 'misc_form', name: '杂项报销', status: 'DRAFT', dirId: null },
    ],
  }
}

describe('AppWorkspace（应用管理上下文）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getFormAppContent).mockResolvedValue(content())
  })

  it('挂载即按应用加载内容（目录 + 表单）', async () => {
    const wrapper = mount(AppWorkspace, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(getFormAppContent).toHaveBeenCalledWith('app-1')
    expect(wrapper.text()).toContain('差旅')
    const vm = wrapper.vm as unknown as {
      directForms: Array<{ name: string }>
      dirs: Array<{ forms?: Array<{ name: string }> | null }>
    }
    expect(vm.directForms.map((f) => f.name)).toContain('杂项报销')
    expect(vm.dirs[0]?.forms?.map((f) => f.name)).toContain('差旅报销')
  })

  it('0.1.7 #34：侧栏头 = 返回箭头 + 应用图标 + 应用名称（名称限 5 字省略号）', async () => {
    const wrapper = mount(AppWorkspace, { global: { stubs: minimalStubs } })
    await nextTick()

    expect(wrapper.find('[data-testid="app-back"]').exists()).toBe(true)
    const name = wrapper.find('[data-testid="app-ws-name"]')
    expect(name.exists()).toBe(true)
    expect(name.text()).toBe('报销应用')
    // 截断只发生在视觉层（CSS 5em + 省略号）：完整名称仍需可读
    expect(name.attributes('title')).toBe('报销应用')
    // 图标组件在测试里以桩渲染：只断言「返回箭头 + 图标 + 名称」三项同排
    expect(wrapper.find('.app-ws__side-head').element.children).toHaveLength(3)
  })

  it('0.1.7 #34：左下角「新建」入口在侧栏底部且占满整栏', async () => {
    const wrapper = mount(AppWorkspace, { global: { stubs: minimalStubs } })
    await nextTick()

    const foot = wrapper.find('.app-ws__side-foot')
    expect(foot.exists()).toBe(true)
    expect(foot.find('[data-testid="app-ws-create"]').exists()).toBe(true)
    // 占满整栏靠 .app-ws__side-foot :deep(.el-dropdown) 撑满包裹层 + 按钮 width:100%
    expect(foot.find('.el-dropdown').exists()).toBe(true)
  })

  it('内容为空：进入空态', async () => {
    vi.mocked(getFormAppContent).mockResolvedValue({
      app: content().app,
      dirs: [],
      directForms: [],
    })
    const wrapper = mount(AppWorkspace, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    const vm = wrapper.vm as unknown as { isEmpty: boolean }
    expect(vm.isEmpty).toBe(true)
  })

  it('加载失败：错误信息可见且不渲染空态假象', async () => {
    vi.mocked(getFormAppContent).mockRejectedValue(new Error('nope'))
    const wrapper = mount(AppWorkspace, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.app-ws__error').exists()).toBe(true)
  })
})
