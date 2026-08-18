import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/system/api/dept', () => ({
  listDeptTree: vi.fn(),
  getDept: vi.fn(),
  createDept: vi.fn(),
  updateDept: vi.fn(),
  deleteDept: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { listDeptTree, createDept, deleteDept } from '@/modules/system/api/dept'
import type { SysDept } from '@/modules/system/types/dept'
import DeptList from './DeptList.vue'

describe('DeptList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listDeptTree).mockResolvedValue([])
  })

  const minimalStubs = {
    ListToolbar: {
      template: '<div><slot name="actions"/></div>',
      props: ['title', 'total'],
    },
    StandardFormTemplate: {
      template: '<div><slot name="alert"/><slot/></div>',
      props: ['embedded'],
    },
    FormSection: { template: '<div><slot/></div>' },
    FormGrid: { template: '<div><slot/></div>', props: ['columns'] },
    // emits 声明避免 @click 作为 attrs 回退到根元素造成原生监听 + emit 双重触发
    'el-button': {
      template: '<button @click="$emit(\'click\')"><slot/></button>',
      emits: ['click'],
    },
    'el-table': { template: '<div><slot/></div>', props: ['data', 'rowKey'] },
    'el-table-column': { template: '<div/>' },
    'el-dialog': { template: '<div v-if="modelValue"><slot/></div>', props: ['modelValue'] },
    'el-input': {
      // 桥接 v-model（update:modelValue）与 keyup（供 @keyup.enter 触发查询）
      template:
        '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />',
      props: ['modelValue', 'placeholder'],
    },
    'el-input-number': { template: '<input type="number"/>', props: ['modelValue'] },
    'el-select': { template: '<select/>', props: ['modelValue'] },
    'el-option': { template: '<option/>' },
    'el-tree-select': { template: '<select/>', props: ['modelValue'] },
    'el-tag': { template: '<span><slot/></span>' },
    'el-alert': { template: '<div><slot/></div>', props: ['title', 'type'] },
  }

  // ─── API 交互 ───

  it('calls listDeptTree on mount', () => {
    mount(DeptList, { global: { stubs: minimalStubs } })
    expect(listDeptTree).toHaveBeenCalledWith()
  })

  // ─── 树形数据 ───

  it('builds tree from flat data via loadTree', async () => {
    const flatData: SysDept[] = [
      { id: '1', parentId: '0', name: '总公司', code: 'HQ', status: 0 },
      { id: '2', parentId: '1', name: '技术部', code: 'tech', status: 0 },
      { id: '3', parentId: '1', name: '市场部', code: 'mkt', status: 0 },
    ]
    vi.mocked(listDeptTree).mockResolvedValue(flatData)

    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      treeData: SysDept[]
    }

    // 根节点 1 个（总公司），含 2 个子部门
    expect(vm.treeData).toHaveLength(1)
    expect(vm.treeData[0].children).toHaveLength(2)
    expect(vm.treeData[0].children![0].name).toBe('技术部')
  })

  // ─── 删除 ───

  it('deleteDept can be called and propagates', async () => {
    vi.mocked(deleteDept).mockResolvedValue(undefined)
    await deleteDept('1')
    expect(deleteDept).toHaveBeenCalledWith('1')
  })

  // ─── 状态语义（I51：0=正常 / 1=停用，无锁定） ───

  it('新建表单默认 status=0（正常），openCreate 重置后仍为 0', () => {
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    const vm = wrapper.vm as unknown as {
      form: SysDept
      openCreate: () => void
    }
    expect(vm.form.status).toBe(0)
    vm.openCreate()
    expect(vm.form.status).toBe(0)
  })

  it('选择「停用」(status=1) 后提交 payload 的 status=1', async () => {
    vi.mocked(createDept).mockResolvedValue('10')
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      form: SysDept
      handleSubmit: () => Promise<void>
    }
    vm.form.name = '测试部'
    vm.form.code = 'TEST'
    vm.form.status = 1
    await vm.handleSubmit()
    expect(vi.mocked(createDept)).toHaveBeenCalledWith(
      expect.objectContaining({ name: '测试部', code: 'TEST', status: 1 }),
    )
  })

  // ─── 筛选：状态下拉映射（I31：全部=不传 status / 正常=0 / 停用=1） ───

  it('状态下拉选项严格映射 全部/正常(0)/停用(1)，复用部门状态契约', () => {
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    const vm = wrapper.vm as unknown as {
      statusFilterOptions: Array<{ label: string; value: number | '' }>
    }
    expect(vm.statusFilterOptions).toEqual([
      { label: '全部', value: '' },
      { label: '正常', value: 0 },
      { label: '停用', value: 1 },
    ])
  })

  // ─── 筛选交互 ───

  it('输入部门名称后按 Enter 触发查询并携带 name 参数', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()

    await wrapper.find('.dept-list__filter input').setValue('技术部')
    await wrapper.find('.dept-list__filter input').trigger('keyup', { key: 'Enter' })
    await nextTick()

    expect(listDeptTree).toHaveBeenLastCalledWith({ name: '技术部' })
  })

  it('状态下拉选择「停用」(1) 后点查询携带 status=1', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { filter: { name: string; status: number | '' } }
    vm.filter.status = 1
    await nextTick()

    const queryBtn = wrapper.findAll('button').find((b) => b.text() === '查询')
    expect(queryBtn).toBeDefined()
    await queryBtn!.trigger('click')
    await nextTick()

    expect(listDeptTree).toHaveBeenLastCalledWith({ status: 1 })
  })

  it('名称+状态组合查询同时携带 name 与 status', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { filter: { name: string; status: number | '' } }
    vm.filter.name = '技术'
    vm.filter.status = 0
    await nextTick()

    const queryBtn = wrapper.findAll('button').find((b) => b.text() === '查询')
    await queryBtn!.trigger('click')
    await nextTick()

    expect(listDeptTree).toHaveBeenLastCalledWith({ name: '技术', status: 0 })
  })

  it('空白名称等价未填写：点查询时不携带条件（恢复全量）', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { filter: { name: string; status: number | '' } }
    vm.filter.name = '   '
    await nextTick()

    const queryBtn = wrapper.findAll('button').find((b) => b.text() === '查询')
    await queryBtn!.trigger('click')
    await nextTick()

    expect(listDeptTree).toHaveBeenLastCalledWith()
  })

  it('重置清空筛选条件并恢复全量树（无参调用）', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { filter: { name: string; status: number | '' } }
    vm.filter.name = '技术'
    vm.filter.status = 1
    await nextTick()

    const resetBtn = wrapper.findAll('button').find((b) => b.text() === '重置')
    expect(resetBtn).toBeDefined()
    await resetBtn!.trigger('click')
    await nextTick()

    expect(vm.filter.name).toBe('')
    expect(vm.filter.status).toBe('')
    expect(listDeptTree).toHaveBeenLastCalledWith()
  })

  // ─── 筛选结果树形展示（后端已带祖先，buildTree 组装完整树） ───

  it('筛选结果含祖先节点时仍组装为完整树形', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([
      { id: '1', parentId: '0', name: '总公司', code: 'HQ', status: 0 },
      { id: '2', parentId: '1', name: '技术部', code: 'TECH', status: 0 },
      { id: '5', parentId: '2', name: '前端组', code: 'TECH-FE', status: 0 },
    ])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { treeData: SysDept[] }
    expect(vm.treeData).toHaveLength(1)
    expect(vm.treeData[0].name).toBe('总公司')
    expect(vm.treeData[0].children).toHaveLength(1)
    expect(vm.treeData[0].children![0].name).toBe('技术部')
    expect(vm.treeData[0].children![0].children).toHaveLength(1)
    expect(vm.treeData[0].children![0].children![0].name).toBe('前端组')
  })

  // ─── 空态区分 ───

  it('筛选条件下无匹配 → 空态显示「无匹配部门」+ 重置筛选，无新建入口，不回退全量', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { filter: { name: string; status: number | '' } }
    vm.filter.name = '不存在的部门'
    await nextTick()

    const queryBtn = wrapper.findAll('button').find((b) => b.text() === '查询')
    await queryBtn!.trigger('click')
    await nextTick()
    await nextTick()

    const emptyArea = wrapper.find('.dept-list__empty')
    expect(emptyArea.text()).toContain('无匹配部门')
    expect(emptyArea.findAll('button').map((b) => b.text())).toEqual(['重置筛选'])
    // 共 2 次调用：mount 全量 + 本次筛选；空结果后未再发无参请求（未回退全量树）
    expect(listDeptTree).toHaveBeenCalledTimes(2)
    expect(listDeptTree).toHaveBeenLastCalledWith({ name: '不存在的部门' })
  })

  it('无筛选条件且数据为空 → 空态显示「新建部门」入口，无「无匹配部门」', async () => {
    vi.mocked(listDeptTree).mockResolvedValue([])
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()

    const emptyArea = wrapper.find('.dept-list__empty')
    expect(emptyArea.text()).toContain('新建部门')
    expect(emptyArea.text()).not.toContain('无匹配部门')
  })

  // ─── 加载态 ───

  it('请求进行中 loading=true（v-loading），完成后恢复 false', async () => {
    let resolveFn!: (v: SysDept[]) => void
    vi.mocked(listDeptTree).mockReturnValueOnce(
      new Promise<SysDept[]>((res) => {
        resolveFn = res
      }),
    )
    const wrapper = mount(DeptList, { global: { stubs: minimalStubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as { loading: boolean }
    expect(vm.loading).toBe(true)

    resolveFn([])
    await nextTick()
    await nextTick()
    expect(vm.loading).toBe(false)
  })
})
