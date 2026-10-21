import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const { granted } = vi.hoisted(() => ({ granted: new Set<string>() }))

vi.mock('@/modules/form/api/form', () => ({
  getFormDefinition: vi.fn(),
  getFormDef: vi.fn(),
  queryFormData: vi.fn(),
}))

vi.mock('@/modules/form/api/i2-choices', () => ({
  getListConfig: vi.fn().mockResolvedValue(null),
  loadUserChoices: vi.fn().mockResolvedValue([]),
  loadDeptChoices: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/foundation/permission', () => ({
  usePermission: () => ({
    hasPerm: (code: string) => granted.has(code),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: { appId: 'app-1' }, params: { formKey: 'leave_request' } }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { getFormDefinition, queryFormData } from '@/modules/form/api/form'
import FormDataList from '@/modules/form/components/FormDataList.vue'

const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  LoadErrorState: { template: '<div/>', props: ['error'] },
  ListActionsColumn: { template: '<div/>', props: ['actions', 'width'] },
  DictSelect: { template: '<div/>', props: ['modelValue', 'type'] },
  DictTag: { template: '<span/>', props: ['type', 'value'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-input': { template: '<input/>', props: ['modelValue'] },
  'el-select': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-option': { template: '<div/>' },
  'el-date-picker': { template: '<div/>', props: ['modelValue'] },
  'el-tag': { template: '<span><slot/></span>' },
}

describe('FormDataList（管理端/用户端共用数据列表）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    granted.clear()
    vi.mocked(getFormDefinition).mockResolvedValue({
      title: '请假申请',
      fields: [{ name: 'days', label: '天数', type: 'NUMBER' }],
    } as never)
  })

  const mountList = () =>
    mount(FormDataList, {
      props: { formKey: 'leave_request' },
      global: { stubs: minimalStubs },
    })

  it('有 form:data:query 权限：按 formKey 查询真实数据列表', async () => {
    granted.add('form:data:query')
    vi.mocked(queryFormData).mockResolvedValue({
      list: [{ id: 'r1', days: 2 }],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    mountList()
    await flushPromises()
    expect(queryFormData).toHaveBeenCalledTimes(1)
    expect(vi.mocked(queryFormData).mock.calls[0][0]).toBe('leave_request')
  })

  it('无 form:data:query 权限：不请求数据，有提交权限时保留填写入口', async () => {
    granted.add('form:data:submit')
    const wrapper = mountList()
    await flushPromises()
    expect(queryFormData).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="data-forbidden"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-data-create"]').exists()).toBe(true)
  })

  it('无 form:data:submit 权限：不展示新增入口', async () => {
    const wrapper = mountList()
    await flushPromises()
    expect(wrapper.find('[data-testid="form-data-create"]').exists()).toBe(false)
  })

  it('查询结果为零：显示空列表（isEmpty 为真），不用演示数据代替', async () => {
    granted.add('form:data:query')
    vi.mocked(queryFormData).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    const wrapper = mountList()
    await flushPromises()
    const vm = wrapper.vm as unknown as { isEmpty: boolean }
    expect(vm.isEmpty).toBe(true)
  })

  it('查询失败：错误态与空态互斥（失败不伪装为空数据）', async () => {
    granted.add('form:data:query')
    vi.mocked(queryFormData).mockRejectedValue(new Error('backend down'))
    const wrapper = mountList()
    await flushPromises()
    const vm = wrapper.vm as unknown as { isEmpty: boolean }
    expect(vm.isEmpty).toBe(false)
  })

  it('表头设置：隐藏列与顺序写入本机偏好，表格按偏好渲染', async () => {
    granted.add('form:data:query')
    vi.mocked(getFormDefinition).mockResolvedValue({
      title: '请假申请',
      fields: [
        { name: 'days', label: '天数', type: 'NUMBER' },
        { name: 'reason', label: '事由', type: 'TEXT' },
      ],
    } as never)
    vi.mocked(queryFormData).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = mountList()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openColumnSettings: () => void
      applyColumnSettings: () => void
      draftColumns: Array<{ prop: string; label: string; visible: boolean }>
      displayColumns: Array<{ prop: string }>
    }
    vm.openColumnSettings()
    await nextTick()
    expect(vm.draftColumns.map((c) => c.label)).toEqual(['天数', '事由', '创建时间'])

    vm.draftColumns[1]!.visible = false
    vm.applyColumnSettings()
    await nextTick()
    expect(vm.displayColumns.map((c) => c.prop)).toEqual(['days', 'create_time'])
    expect(setItem).toHaveBeenCalledWith(
      'sw:app-form-columns:leave_request',
      expect.stringContaining('"reason"'),
    )
    setItem.mockRestore()
  })

  it('表头设置：至少保留一列（全部取消不生效）', async () => {
    granted.add('form:data:query')
    vi.mocked(queryFormData).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    const wrapper = mountList()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      openColumnSettings: () => void
      applyColumnSettings: () => void
      draftColumns: Array<{ prop: string; label: string; visible: boolean }>
      displayColumns: Array<{ prop: string }>
    }
    vm.openColumnSettings()
    await nextTick()
    for (const col of vm.draftColumns) col.visible = false
    vm.applyColumnSettings()
    await nextTick()
    expect(vm.displayColumns.length).toBeGreaterThan(0)
  })
})
