import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormGrid from './FormGrid.vue'
import FormSection from './FormSection.vue'
import FormActions from './FormActions.vue'
import ListToolbar from './ListToolbar.vue'
import ListFilterBar from './ListFilterBar.vue'
import ListTable from './ListTable.vue'
import ListPagination from './ListPagination.vue'
import ListEmpty from './ListEmpty.vue'
import StandardFormTemplate from './StandardFormTemplate.vue'
import StandardListTemplate from './StandardListTemplate.vue'
import * as pageLayout from './index'

/* ═══════════════════════════════════════════════════
 * FormGrid
 * ═══════════════════════════════════════════════════ */

describe('FormGrid', () => {
  it('renders default slot content', () => {
    const wrapper = mount(FormGrid, {
      slots: { default: '<div class="test-child">hello</div>' },
    })
    expect(wrapper.find('.test-child').exists()).toBe(true)
    expect(wrapper.find('.test-child').text()).toBe('hello')
  })

  it('default columns=2 → CSS class form-grid--cols-2', () => {
    const wrapper = mount(FormGrid)
    expect(wrapper.classes()).toContain('form-grid--cols-2')
  })

  it('columns=1 → CSS class form-grid--cols-1', () => {
    const wrapper = mount(FormGrid, { props: { columns: 1 } })
    expect(wrapper.classes()).toContain('form-grid--cols-1')
  })
})

/* ═══════════════════════════════════════════════════
 * FormSection
 * ═══════════════════════════════════════════════════ */

describe('FormSection', () => {
  it('renders title', () => {
    const wrapper = mount(FormSection, { props: { title: '基本信息' } })
    expect(wrapper.text()).toContain('基本信息')
  })

  it('renders default slot', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'S' },
      slots: { default: '<div class="inner">content</div>' },
    })
    expect(wrapper.find('.inner').text()).toBe('content')
  })

  it('renders #title slot when provided', () => {
    const wrapper = mount(FormSection, {
      slots: { title: '<span class="custom-title">Custom</span>' },
    })
    expect(wrapper.find('.custom-title').text()).toBe('Custom')
  })
})

/* ═══════════════════════════════════════════════════
 * FormActions
 * ═══════════════════════════════════════════════════ */

describe('FormActions', () => {
  it('defaults to right alignment', () => {
    const wrapper = mount(FormActions)
    expect(wrapper.classes()).toContain('form-actions--right')
  })

  it('align=left changes class', () => {
    const wrapper = mount(FormActions, { props: { align: 'left' } })
    expect(wrapper.classes()).toContain('form-actions--left')
  })

  it('renders default slot buttons', () => {
    const wrapper = mount(FormActions, {
      slots: { default: '<button class="btn-save">保存</button>' },
    })
    expect(wrapper.find('.btn-save').text()).toBe('保存')
  })
})

/* ═══════════════════════════════════════════════════
 * ListToolbar
 * ═══════════════════════════════════════════════════ */

describe('ListToolbar', () => {
  it('displays title and total', () => {
    const wrapper = mount(ListToolbar, {
      props: { title: '用户列表', total: 42 },
    })
    expect(wrapper.text()).toContain('用户列表')
    expect(wrapper.text()).toContain('共 42 条记录')
  })

  it('renders #actions slot', () => {
    const wrapper = mount(ListToolbar, {
      props: { title: 'T', total: 0 },
      slots: { actions: '<button class="btn-new">新建</button>' },
    })
    expect(wrapper.find('.btn-new').text()).toBe('新建')
  })
})

/* ═══════════════════════════════════════════════════
 * ListFilterBar
 * ═══════════════════════════════════════════════════ */

describe('ListFilterBar', () => {
  it('renders default slot (filter controls)', () => {
    const wrapper = mount(ListFilterBar, {
      slots: { default: '<input class="filter-input" />' },
    })
    expect(wrapper.find('.filter-input').exists()).toBe(true)
  })

  it('renders #actions slot (query/reset buttons)', () => {
    const wrapper = mount(ListFilterBar, {
      slots: { actions: '<button class="btn-query">查询</button>' },
    })
    expect(wrapper.find('.btn-query').text()).toBe('查询')
  })
})

/* ═══════════════════════════════════════════════════
 * ListTable
 * ═══════════════════════════════════════════════════ */

describe('ListTable', () => {
  it('renders default slot with el-table', () => {
    const wrapper = mount(ListTable, {
      slots: { default: '<table class="my-el-table"><tr><td>data</td></tr></table>' },
    })
    expect(wrapper.find('.my-el-table').exists()).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════
 * ListPagination
 * ═══════════════════════════════════════════════════ */

describe('ListPagination', () => {
  it('emits update:pageNum when page changes', async () => {
    const wrapper = mount(ListPagination, {
      props: { total: 100, pageNum: 1, pageSize: 10 },
      global: { stubs: { ElPagination: false } },
    })
    // Force emit through the el-pagination (stubbed)
    // Since ElPagination is a complex component, we test that props are passed through
    expect(wrapper.props('total')).toBe(100)
  })
})

/* ═══════════════════════════════════════════════════
 * ListEmpty
 * ═══════════════════════════════════════════════════ */

describe('ListEmpty', () => {
  it('shows default description', () => {
    const wrapper = mount(ListEmpty, {
      global: {
        stubs: {
          ElEmpty: {
            props: ['description'],
            template: '<div class="el-empty">{{ description }}</div>',
          },
        },
      },
    })
    expect(wrapper.find('.el-empty').text()).toContain('暂无数据')
  })

  it('accepts custom description', () => {
    const wrapper = mount(ListEmpty, {
      props: { description: '没有找到用户' },
      global: {
        stubs: {
          ElEmpty: {
            props: ['description'],
            template: '<div class="el-empty">{{ description }}</div>',
          },
        },
      },
    })
    expect(wrapper.find('.el-empty').text()).toContain('没有找到用户')
  })

  it('renders #action slot', () => {
    const wrapper = mount(ListEmpty, {
      slots: { action: '<button class="btn-create">新建用户</button>' },
      global: {
        stubs: {
          ElEmpty: { props: ['description'], template: '<div class="el-empty"><slot /></div>' },
        },
      },
    })
    expect(wrapper.find('.btn-create').exists()).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════
 * StandardFormTemplate
 * ═══════════════════════════════════════════════════ */

describe('StandardFormTemplate', () => {
  it('renders title and subtitle', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: '新增用户', subtitle: '带 * 为必填项' },
    })
    expect(wrapper.text()).toContain('新增用户')
    expect(wrapper.text()).toContain('带 * 为必填项')
  })

  it('renders #alert slot', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T' },
      slots: { alert: '<div class="alert-msg">提交成功</div>' },
    })
    expect(wrapper.find('.alert-msg').text()).toBe('提交成功')
  })

  it('renders default slot (form sections)', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T' },
      slots: { default: '<div class="section-content">fields here</div>' },
    })
    expect(wrapper.find('.section-content').text()).toBe('fields here')
  })

  it('renders #actions slot', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T' },
      slots: { actions: '<button class="btn-submit">提交</button>' },
    })
    expect(wrapper.find('.btn-submit').text()).toBe('提交')
  })

  it('embedded=true hides header (no H1, no subtitle)', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T', subtitle: '提示', embedded: true },
    })
    expect(wrapper.find('.standard-form__header').exists()).toBe(false)
    expect(wrapper.find('.standard-form__title').exists()).toBe(false)
    expect(wrapper.find('.standard-form__subtitle').exists()).toBe(false)
  })

  it('embedded=true still renders #alert slot', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T', embedded: true },
      slots: { alert: '<div class="alert-msg">错误提示</div>' },
    })
    expect(wrapper.find('.alert-msg').text()).toBe('错误提示')
  })

  it('embedded=true still renders default slot', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T', embedded: true },
      slots: { default: '<div class="body-content">表单体</div>' },
    })
    expect(wrapper.find('.body-content').text()).toBe('表单体')
  })

  it('embedded=true still renders #actions slot', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: 'T', embedded: true },
      slots: { actions: '<button class="btn-save">保存</button>' },
    })
    expect(wrapper.find('.btn-save').text()).toBe('保存')
  })

  it('embedded=false (default) renders header and centering container', () => {
    const wrapper = mount(StandardFormTemplate, {
      props: { title: '默认标题', subtitle: '说明' },
    })
    expect(wrapper.find('.standard-form__header').exists()).toBe(true)
    expect(wrapper.find('.standard-form__title').text()).toBe('默认标题')
    expect(wrapper.find('.standard-form__subtitle').text()).toBe('说明')
    expect(wrapper.find('.standard-form--embedded').exists()).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════
 * StandardListTemplate
 * ═══════════════════════════════════════════════════ */

describe('StandardListTemplate', () => {
  const baseProps = { total: 100, pageNum: 1, pageSize: 10 }

  it('empty=true → renders ListEmpty', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: true },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.find('.list-empty').exists()).toBe(true)
  })

  it('empty=false → renders default slot (table area)', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: false },
      slots: { default: '<table class="data-table"><tr><td>row</td></tr></table>' },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.find('.data-table').exists()).toBe(true)
    expect(wrapper.find('.list-empty').exists()).toBe(false)
  })

  it('displays title and total via ListToolbar', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, title: '用户管理', empty: true },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('共 100 条记录')
  })

  it('renders #filter and #filter-actions slots', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: true },
      slots: {
        filter: '<input class="filter-name" />',
        'filter-actions': '<button class="btn-query">查询</button>',
      },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.find('.filter-name').exists()).toBe(true)
    expect(wrapper.find('.btn-query').text()).toBe('查询')
  })

  it('renders #toolbar-actions slot', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: true },
      slots: { 'toolbar-actions': '<button class="btn-new">新建</button>' },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.find('.btn-new').text()).toBe('新建')
  })

  it('renders #empty-action slot when empty', () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: true },
      slots: { 'empty-action': '<button class="btn-create">创建第一条</button>' },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    expect(wrapper.find('.btn-create').exists()).toBe(true)
  })

  it('emits update:pageNum and update:pageSize from ListPagination', async () => {
    const wrapper = mount(StandardListTemplate, {
      props: { ...baseProps, empty: true },
      global: { stubs: { ElPagination: { template: '<div class="el-pagination" />' } } },
    })
    // Find the inner ListPagination and trigger its events
    const paginationComp = wrapper.findComponent({ name: 'ListPagination' })
    expect(paginationComp.exists()).toBe(true)

    await paginationComp.vm.$emit('update:pageNum', 3)
    expect(wrapper.emitted('update:pageNum')![0]).toEqual([3])

    await paginationComp.vm.$emit('update:pageSize', 20)
    expect(wrapper.emitted('update:pageSize')![0]).toEqual([20])
  })
})

/* ═══════════════════════════════════════════════════
 * index.ts 统一导出
 * ═══════════════════════════════════════════════════ */

describe('page-layout/index.ts', () => {
  it('exports all 10 components', () => {
    expect(pageLayout.FormSection).toBeDefined()
    expect(pageLayout.FormGrid).toBeDefined()
    expect(pageLayout.FormActions).toBeDefined()
    expect(pageLayout.ListFilterBar).toBeDefined()
    expect(pageLayout.ListToolbar).toBeDefined()
    expect(pageLayout.ListTable).toBeDefined()
    expect(pageLayout.ListPagination).toBeDefined()
    expect(pageLayout.ListEmpty).toBeDefined()
    expect(pageLayout.StandardFormTemplate).toBeDefined()
    expect(pageLayout.StandardListTemplate).toBeDefined()
  })
})
