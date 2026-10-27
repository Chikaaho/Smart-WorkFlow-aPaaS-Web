import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: vi.fn(),
  getProcessDefThemeRule: vi.fn(),
  updateProcessDefThemeRule: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {} }),
}))

import { pageProcessDefs } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import ProcessDefList from './ProcessDefList.vue'

const stubs = {
  StandardListTemplate: {
    template: '<div><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': {
    props: ['label', 'width', 'align', 'prop'],
    template:
      '<div class="col" :data-label="label" :data-width="width" :data-align="align" :data-prop="prop" />',
  },
  'el-tag': { template: '<span class="el-tag"><slot/></span>' },
  'el-button': {
    // emits 必须声明：否则父级 @click 会同时作为原生监听落到根元素，点击被触发两次
    emits: ['click'],
    template: '<button class="el-button" @click="$emit(\'click\')"><slot/></button>',
  },
  'el-option': { template: '<div class="el-option" />', props: ['label', 'value'] },
  'el-select': {
    template: '<div class="el-select"><slot/></div>',
    props: ['modelValue'],
  },
  'el-dialog': {
    template: '<div class="el-dialog"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title'],
  },
}

const mockDefs: ProcessDef[] = [
  {
    id: 1,
    processKey: 'skeleton_approval',
    name: '单节点审批流程',
    formKey: 'it_application',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-05 10:00:00',
    updateTime: '2026-07-05 10:00:00',
  },
  {
    id: 2,
    processKey: 'leave_approval',
    name: '请假审批流程',
    formKey: 'leave-request',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-08 14:20:00',
    updateTime: '2026-07-09 09:10:00',
  },
]

/** 流程编号弹窗（ThemeRuleDialog）依赖用户会话 store，统一注入 pinia */
const globalOpts = () => ({ stubs, plugins: [createPinia()] })

describe('ProcessDefList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls pageProcessDefs with pageNum=1 pageSize=10 on mount', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    mount(ProcessDefList, { global: globalOpts() })
    await nextTick()
    expect(pageProcessDefs).toHaveBeenCalledOnce()
    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
  })

  it('re-fetches on pageNum change', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()

    vi.mocked(pageProcessDefs).mockClear()
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: [mockDefs[0]],
      total: 5,
      pageNum: 2,
      pageSize: 10,
    })

    const vm = wrapper.vm as unknown as { handlePageNumChange: (p: number) => Promise<void> }
    await vm.handlePageNumChange(2)
    await nextTick()

    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 2, pageSize: 10 })
  })

  it('resets to page 1 on pageSize change', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()

    vi.mocked(pageProcessDefs).mockClear()
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 5,
      pageNum: 1,
      pageSize: 20,
    })

    const vm = wrapper.vm as unknown as { handlePageSizeChange: (s: number) => Promise<void> }
    await vm.handlePageSizeChange(20)
    await nextTick()

    expect(pageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 20 })
  })

  it('shows fallback error message when API fails with non-ApiError', async () => {
    vi.mocked(pageProcessDefs).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()
    await nextTick()
    expect(wrapper.vm as unknown as { errorMsg: string }).toHaveProperty(
      'errorMsg',
      '加载流程定义列表失败',
    )
  })

  // 6:2 参考列口径：状态居中、更新人与时间合并为单列、操作列 170
  it('renders 状态居中 / 更新人+时间合并列 / 操作列 170', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()
    const cols = wrapper.findAll('.col')
    const labelOf = (label: string) =>
      cols.find((col) => col.attributes('data-label') === label) ?? null

    expect(labelOf('状态')?.attributes('data-align')).toBe('center')
    expect(labelOf('更新人 / 时间')).not.toBeNull()
    expect(labelOf('更新人')).toBeNull()
    expect(labelOf('更新时间')).toBeNull()
    expect(labelOf('操作')?.attributes('data-width')).toBe('170')
  })

  // BF20261013-041/042：流程编号编辑器（ThemeRuleDialog）——变量在输入框内以灰底标识展示，
  // 按钮同框带入，示例随规则实时更新
  it('流程编号规则编辑器：灰底标识回显 + 点按钮带入变量 + 示例预览', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: mockDefs,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    const { getProcessDefThemeRule } = await import('@/modules/workflow/api')
    vi.mocked(getProcessDefThemeRule).mockResolvedValueOnce('JRZX_{YYYYMMDDHHMMSS}_{SEQ:3}')
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()

    const vm = wrapper.vm as unknown as { openThemeRule: (row: ProcessDef) => void }
    vm.openThemeRule(mockDefs[0])
    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    // 回显：要素条按规则拆成「常量 + 要素」，每格带 data-kind/data-raw（0.1.7 #37）
    const chips = wrapper.findAll('[data-testid="theme-element-chip"]')
    expect(chips.map((chip) => chip.attributes('data-raw'))).toEqual([
      'JRZX_',
      '{YYYYMMDDHHMMSS}',
      '_',
      '{SEQ:3}',
    ])
    expect(chips.map((chip) => chip.attributes('data-kind'))).toEqual([
      'text',
      'legacy',
      'text',
      'seq',
    ])

    // 点「流水号」要素按钮：按默认位数带入 {SEQ:3} 要素
    await wrapper.find('[data-testid="theme-element-add-seq"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('[data-testid="theme-element-chip"]')).toHaveLength(5)

    // 模拟编号：规则文本 → 演示值（发起时间补足 14 位、序号补零到 3 位）
    const preview = wrapper.find('[data-testid="theme-preview"]').text()
    expect(preview).toMatch(/\d{14}_001/)
  })

  it('displays empty state when list is empty', async () => {
    vi.mocked(pageProcessDefs).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = mount(ProcessDefList, { global: globalOpts() })
    await nextTick()
    await nextTick()
    expect(wrapper.vm as unknown as { isEmpty: boolean }).toHaveProperty('isEmpty', true)
  })
})
