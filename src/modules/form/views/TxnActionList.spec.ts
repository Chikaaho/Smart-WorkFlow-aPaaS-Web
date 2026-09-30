import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, type PropType } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/locales'

/**
 * TxnActionList 组件 smoke：表单选择 → 动作列表渲染（状态/类型业务标签）→ 空态提示。
 * 详细交互（发布错误定位/调用/台账）由浏览器验收与后端行为测试覆盖。
 */

vi.mock('@/modules/form/api/txn-action', () => ({
  listTxnActions: vi.fn(),
  createTxnAction: vi.fn(),
  updateTxnAction: vi.fn(),
  validateTxnAction: vi.fn(),
  publishTxnAction: vi.fn(),
  disableTxnAction: vi.fn(),
  enableTxnAction: vi.fn(),
  getC1Policy: vi.fn(),
  saveC1Policy: vi.fn(),
  invokeTxnAction: vi.fn(),
  pageTxnInvocations: vi.fn(),
  pageTxnReservations: vi.fn(),
  pageTxnLedger: vi.fn(),
}))

vi.mock('@/modules/form/api/form-def', () => ({
  pageFormDefs: vi.fn(),
  getFormDefinitionById: vi.fn(),
}))

vi.mock('@/foundation/permission', () => ({
  hasPerm: vi.fn(() => true),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { listTxnActions, getC1Policy } from '@/modules/form/api/txn-action'
import { pageFormDefs, getFormDefinitionById } from '@/modules/form/api/form-def'
import TxnActionList from './TxnActionList.vue'

const ROW_KEY = Symbol('stubRow')

/** 表格行上下文：行 stub provide，列 stub inject，向默认插槽传递 row（可断言单元格业务文本）。 */
// eslint-disable-next-line vue/one-component-per-file -- 测试型行上下文 stub（单元格业务文本断言需要）
const StubTableRow = defineComponent({
  provide() {
    return { [ROW_KEY]: this.row }
  },
  props: {
    row: {
      type: Object as PropType<Record<string, unknown> | undefined>,
      required: false,
      default: undefined,
    },
  },
  template: '<div class="stub-row"><slot/></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型表格 stub（按 data 逐行渲染）
const StubTable = defineComponent({
  components: { StubTableRow },
  props: {
    data: {
      type: Array as PropType<Record<string, unknown>[]>,
      required: false,
      default: () => [],
    },
  },
  template:
    '<div class="stub-table"><StubTableRow v-for="(row, i) in data" :key="i" :row="row"><slot/></StubTableRow></div>',
})

// eslint-disable-next-line vue/one-component-per-file -- 测试型列 stub（透传行上下文）
const StubTableColumn = defineComponent({
  inject: { row: { from: ROW_KEY, default: undefined } },
  props: { prop: { type: String, required: false, default: '' } },
  template: '<div class="stub-cell">{{ row?.[prop] }}<slot :row="row"/></div>',
})

const stubs = {
  StandardListTemplate: {
    template: '<div><slot name="toolbar-actions"/><slot/><slot name="empty-action"/></div>',
  },
  ListActionsColumn: true,
  'el-select': { template: '<div><slot/></div>' },
  'el-option': true,
  'el-button': { template: '<button><slot/></button>' },
  'el-table': StubTable,
  'el-table-column': StubTableColumn,
  'el-alert': { template: '<div><slot/></div>' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
  'el-drawer': { template: '<div><slot/></div>' },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': true,
  'el-switch': true,
}

function mountPage() {
  return mount(TxnActionList, {
    global: { plugins: [i18n], stubs },
  })
}

describe('modules/form/views/TxnActionList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(pageFormDefs).mockResolvedValue({
      list: [
        {
          id: 'form-1',
          formKey: 'stock_form',
          name: '库存表',
          logicalTableName: 'stock',
          status: 'PUBLISHED',
          physicalTableName: 'sw_form_txnstock01',
          formVersion: 1,
          description: '',
          createTime: '2026-09-30T10:00:00',
          updateTime: '2026-09-30T10:00:00',
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 200,
    })
    vi.mocked(getFormDefinitionById).mockResolvedValue({
      schemaVersion: 1,
      title: '库存表',
      fields: [
        { name: 'material', type: 'TEXT', label: '物料' },
        { name: 'qty_available', type: 'NUMBER', label: '可用量' },
        { name: 'qty_reserved', type: 'NUMBER', label: '预占量' },
      ],
    })
    vi.mocked(getC1Policy).mockResolvedValue({
      id: null,
      formId: 'form-1',
      enabled: false,
      policyJson: null,
      appliedAt: null,
      updateTime: null,
    })
  })

  it('默认加载已发布表单并渲染动作列表（类型/状态业务化）', async () => {
    vi.mocked(listTxnActions).mockResolvedValue([
      {
        id: 'a1',
        formId: 'form-1',
        actionKey: 'stock_reserve',
        name: '库存预占',
        actionType: 'RESERVE',
        status: 'PUBLISHED',
        currentVersion: 2,
        description: null,
        configJson: JSON.stringify({
          balanceField: 'qty_available',
          reservedField: 'qty_reserved',
          expiresInSeconds: 900,
        }),
        updateTime: '2026-09-30T10:00:00',
      },
    ])
    const wrapper = mountPage()
    await flushPromises()

    expect(listTxnActions).toHaveBeenCalledWith('form-1')
    expect(wrapper.text()).toContain('事务动作')
    expect(wrapper.text()).toContain('库存预占')
    expect(wrapper.text()).toContain('已发布')
    // 时效按等级展示（不暴露原始秒数 900）
    expect(wrapper.text()).toContain('短时（15 分钟）')
    expect(wrapper.text()).not.toContain('900')
    // 业务化类型标签
    expect(wrapper.text()).toContain('预占')
  })

  it('无动作时显示引导空态', async () => {
    vi.mocked(listTxnActions).mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无事务动作')
  })
})
