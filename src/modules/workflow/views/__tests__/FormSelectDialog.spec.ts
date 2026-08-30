import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock API 层
vi.mock('@/modules/form/api/form-def', () => ({
  pageFormDefs: vi.fn(),
}))

vi.mock('@/modules/form/utils/form-def-status', () => ({
  getFormDefStatusLabel: (status: string) => (status === 'PUBLISHED' ? '已发布' : '草稿'),
  getFormDefStatusType: (status: string) => (status === 'PUBLISHED' ? 'success' : 'info'),
}))

import { pageFormDefs } from '@/modules/form/api/form-def'
import FormSelectDialog from '@/modules/workflow/views/FormSelectDialog.vue'
import type { FormDefListItem } from '@/modules/form/api/form-def'

// ─── 桩组件 ───

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'destroyOnClose'],
  },
  'el-alert': {
    template: '<div class="el-alert"><slot name="title" />{{ title }}</div>',
    props: ['title', 'type', 'closable', 'showIcon'],
  },
  'el-input': {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'clearable', 'readonly'],
    emits: ['update:modelValue', 'keyup', 'clear'],
  },
  'el-button': {
    template: '<button :disabled="disabled"><slot/></button>',
    props: ['disabled', 'type'],
  },
  'el-table': {
    template: '<div><slot v-for="item in data" :row="item" :$index="0" /></div>',
    props: ['data', 'stripe', 'highlightCurrentRow', 'maxHeight'],
  },
  'el-table-column': {
    template:
      "<div><slot :row=\"row || { formKey: 'fk1', name: 'test', status: 'PUBLISHED' }\" /></div>",
    props: ['prop', 'label', 'minWidth', 'width', 'showOverflowTooltip'],
  },
  'el-tag': { template: '<span><slot/></span>', props: ['type', 'size'] },
  'el-pagination': {
    template: '<div />',
    props: ['currentPage', 'pageSize', 'total', 'pageSizes', 'layout', 'background', 'small'],
  },
  'el-icon': { template: '<span><slot/></span>' },
}

// ─── 造数据 ───

const PUBLISHED_FORM: FormDefListItem = {
  id: '1',
  formKey: 'form_leave',
  name: '请假表单',
  logicalTableName: 'sw_form_leave',
  status: 'PUBLISHED',
  physicalTableName: 'sw_form_leave',
  formVersion: 1,
  description: '请假申请表单',
  createTime: '2026-01-01',
  updateTime: '2026-01-02',
}

const DRAFT_FORM: FormDefListItem = {
  id: '2',
  formKey: 'form_draft',
  name: '草稿表单',
  logicalTableName: 'sw_form_draft',
  status: 'DRAFT',
  physicalTableName: 'sw_form_draft',
  formVersion: 1,
  description: '草稿表单',
  createTime: '2026-01-01',
  updateTime: '2026-01-01',
}

function mockPageResult(forms: FormDefListItem[] = [PUBLISHED_FORM, DRAFT_FORM]) {
  vi.mocked(pageFormDefs).mockResolvedValue({
    list: forms,
    total: forms.length,
    pageNum: 1,
    pageSize: 10,
  })
}

// VM 类型辅助
interface Vm {
  list: FormDefListItem[]
  selectedFormKey: string | null
  keyword: string
  pageNum: number
  loadList: () => Promise<void>
  handleRowClick: (row: FormDefListItem) => void
  confirmSelection: () => void
  handleSearch: () => void
  handleReset: () => void
}

/** 打开弹窗并等待加载完成 */
async function openDialog(wrapper: ReturnType<typeof mount>) {
  await wrapper.setProps({ visible: true })
  await nextTick()
  await nextTick()
}

// ═══════════════════════════════════════

describe('FormSelectDialog.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPageResult()
  })

  // ─── 1. 弹窗打开时加载列表 ───

  it('loads form list when dialog opens', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    expect(pageFormDefs).toHaveBeenCalledTimes(1)
    expect(pageFormDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, undefined)
  })

  // ─── 2. 只展示已发布表单 ───

  it('filters to only show PUBLISHED forms', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    expect(vm.list).toHaveLength(1)
    expect(vm.list[0].formKey).toBe('form_leave')
    expect(vm.list[0].status).toBe('PUBLISHED')
  })

  // ─── 3. 行点击选中 ───

  it('selects form on row click', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    expect(vm.selectedFormKey).toBeNull()

    vm.handleRowClick(PUBLISHED_FORM)
    expect(vm.selectedFormKey).toBe('form_leave')
  })

  // ─── 4. 确认选择后 emit select 事件 ───

  it('emits select event on confirm', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    vm.handleRowClick(PUBLISHED_FORM)
    vm.confirmSelection()

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['form_leave', '请假表单'])
  })

  // ─── 5. 确认选择后关闭弹窗 ───

  it('closes dialog after confirm', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    vm.handleRowClick(PUBLISHED_FORM)
    vm.confirmSelection()

    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0]).toEqual([false])
  })

  // ─── 6. 未选中时确认不 emit ───

  it('does not emit select when no form selected', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    vm.confirmSelection()

    expect(wrapper.emitted('select')).toBeFalsy()
  })

  // ─── 7. currentFormKey 回显高亮 ───

  it('preselects form based on currentFormKey prop', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false, currentFormKey: 'form_leave' },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    expect(vm.selectedFormKey).toBe('form_leave')
  })

  // ─── 8. 搜索功能 ───

  it('searches with keyword', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    vm.keyword = '请假'
    vm.handleSearch()

    expect(pageFormDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, '请假')
  })

  // ─── 9. 重置搜索 ───

  it('resets search keyword', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    vm.keyword = '请假'
    vm.handleSearch()
    await nextTick()

    vm.handleReset()
    expect(vm.keyword).toBe('')
    expect(pageFormDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, undefined)
  })

  // ─── 10. API 错误时列表为空 ───

  it('sets empty list on API error', async () => {
    vi.mocked(pageFormDefs).mockRejectedValueOnce(new Error('网络错误'))

    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    expect(vm.list).toHaveLength(0)
  })

  // ─── 11. 弹窗关闭后重新打开时重置状态 ───

  it('resets state when dialog reopens', async () => {
    const wrapper = mount(FormSelectDialog, {
      props: { visible: false },
      global: { stubs },
    })

    // 打开弹窗
    await openDialog(wrapper)

    const vm = wrapper.vm as unknown as Vm
    expect(vm.keyword).toBe('')
    expect(vm.selectedFormKey).toBeNull()
    expect(vm.pageNum).toBe(1)
  })
})
