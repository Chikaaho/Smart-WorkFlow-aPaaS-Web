import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

/**
 * R2c-N 常驻回归：批量通知结果面板（总量 / 成功 / 失败 / 处理中 + 安全逐项失败明细）。
 *
 * 钉死的不变量：
 * - 四项计数一律取服务端返回值，不按本地明细行数推算（服务端返回的 failureCount 与
 *   明细数组长度不一致时，页面仍以服务端计数为准，不得自行改数）；
 * - 有失败项时不把「整体请求成功」显示成逐项全成功；
 * - 失败明细只展示服务端已脱敏结论，渲染文本零原始异常特征。
 */

vi.mock('@/modules/notify/api', () => ({
  batchSendNotify: vi.fn(),
  resolveCountNotify: vi.fn().mockResolvedValue({ recipientCount: 0 }),
  pageNotifyTemplates: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

const mockElMessageBox = vi.fn()

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: (...args: unknown[]) => mockElMessageBox(...args) },
  }
})

import { batchSendNotify } from '@/modules/notify/api'
import { ElMessage } from 'element-plus'
import NotifyBatchSend from './NotifyBatchSend.vue'

const stubs = {
  StandardFormTemplate: {
    template:
      '<div class="standard-form"><div class="form-body"><slot/></div><slot name="alert"/><div class="form-actions"><slot name="actions"/></div></div>',
    props: ['title', 'subtitle'],
  },
  FormSection: { template: '<div class="form-section"><slot/></div>', props: ['title'] },
  'el-alert': { template: '<div class="el-alert"/>', props: ['title', 'type'] },
  'el-tabs': {
    template: '<div><slot/></div>',
    props: ['modelValue', 'type'],
    emits: ['update:modelValue'],
  },
  'el-tab-pane': { template: '<div><slot/></div>', props: ['label', 'name'] },
  'el-input': { template: '<div/>', props: ['modelValue', 'placeholder', 'type', 'rows'] },
  'el-select': { template: '<div/>', props: ['modelValue', 'placeholder'] },
  'el-option': { template: '<div/>' },
  'el-button': {
    template: '<button :disabled="disabled"><slot/></button>',
    props: ['type', 'loading', 'disabled'],
    emits: ['click'],
  },
  'el-tag': { template: '<span><slot/></span>', props: ['closable'] },
  'el-checkbox-group': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-checkbox': { template: '<label><slot/></label>', props: ['label'] },
  'el-tree': { template: '<div/>', props: ['data', 'showCheckbox', 'nodeKey', 'props'] },
  // 结果面板依赖的组件：dialog 只在 modelValue 为真时渲染内容（与真实 el-dialog 一致）
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width'],
  },
  'el-table': {
    // 真实 el-table 的单元格由 column+prop 渲染；桩组件改为把绑定的行数据原样呈现，
    // 这样“页面把哪份数据交给了表格”是可断言的，且渲染文本等于服务端载荷本身。
    template: '<div class="el-table"><slot/>{{ JSON.stringify(data) }}</div>',
    props: ['data', 'size'],
  },
  'el-table-column': {
    template: '<div class="el-table-column" :data-label="label"/>',
    props: ['label', 'prop', 'width'],
  },
}

interface BatchVm {
  selectedUsers: Array<{ id: string; realName: string }>
  directTitle: string
  directContent: string
  contentMode: string
  serverCount: number
  handleSend: () => Promise<void>
  batchResult: {
    totalCount: number
    successCount: number
    failureCount: number
    processingCount: number
    failures: Array<{ recipientRef: string; category: string; errorKey: string; message: string }>
  } | null
}

async function sendWith(result: Record<string, unknown>) {
  vi.mocked(batchSendNotify).mockResolvedValueOnce(result as never)
  mockElMessageBox.mockResolvedValueOnce(undefined)

  const wrapper = mount(NotifyBatchSend, { global: { stubs } })
  await nextTick()
  const vm = wrapper.vm as unknown as BatchVm
  vm.selectedUsers = [{ id: '1', realName: '张三' }]
  vm.directTitle = '标题'
  vm.directContent = '正文'
  vm.contentMode = 'direct'
  vm.serverCount = 1
  await nextTick()
  await vm.handleSend()
  await nextTick()
  return { wrapper, vm }
}

describe('NotifyBatchSend R2c-N 批量结果面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染服务端四项计数，失败项可下钻且不显示为全成功', async () => {
    const { wrapper } = await sendWith({
      recipientCount: 1,
      phase: 'SEND_RESULT',
      totalCount: 2,
      successCount: 1,
      failureCount: 1,
      processingCount: 0,
      failures: [
        {
          recipientRef: '999999',
          category: 'RECIPIENT_NOT_DELIVERABLE',
          errorKey: 'notify.batch.recipient_not_deliverable',
          message: '接收对象无效或不可投递',
        },
      ],
    })

    expect(wrapper.get('[data-testid="batch-result-total"]').text()).toBe('2')
    expect(wrapper.get('[data-testid="batch-result-success"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="batch-result-failure"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="batch-result-processing"]').text()).toBe('0')

    // 失败明细下钻：接收对象 + 安全原因
    const rows = wrapper.findAll('.el-table-column')
    expect(rows.map((r) => r.attributes('data-label'))).toEqual(['接收对象', '原因'])

    // 有失败项时不得报“成功发送”
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('计数以服务端为准，明细行数与 failureCount 不一致时不自行改数', async () => {
    const { vm } = await sendWith({
      recipientCount: 2,
      phase: 'SEND_RESULT',
      totalCount: 3,
      successCount: 2,
      failureCount: 1,
      processingCount: 0,
      failures: [],
    })

    expect(vm.batchResult?.failureCount).toBe(1)
    expect(vm.batchResult?.failures).toHaveLength(0)
    // 勾稽关系原样保留服务端判定结果
    expect(vm.batchResult?.totalCount).toBe(3)
  })

  it('零失败时给出成功提示，处理中 0 有显式说明', async () => {
    const { wrapper } = await sendWith({
      recipientCount: 3,
      phase: 'SEND_RESULT',
      totalCount: 3,
      successCount: 3,
      failureCount: 0,
      processingCount: 0,
      failures: [],
    })

    expect(ElMessage.success).toHaveBeenCalledWith('成功向 3 人发送通知')
    expect(wrapper.get('[data-testid="batch-result-processing-note"]').text()).toContain(
      '本次批次没有处理中的接收人',
    )
  })

  it('失败明细渲染文本零原始异常特征', async () => {
    const { wrapper } = await sendWith({
      recipientCount: 1,
      phase: 'SEND_RESULT',
      totalCount: 2,
      successCount: 1,
      failureCount: 1,
      processingCount: 0,
      failures: [
        {
          recipientRef: '888',
          category: 'DELIVERY_FAILED',
          errorKey: 'notify.batch.delivery_failed',
          message: '投递失败，请稍后重试',
        },
      ],
    })

    const text = wrapper.text()
    for (const leak of ['Exception', 'java.', 'com.sw', 'SELECT', ' at ', '\\']) {
      expect(text).not.toContain(leak)
    }
    expect(text).toContain('投递失败，请稍后重试')
  })

  it('保留兼容字段：响应只有 recipientCount 时按全成功呈现', async () => {
    const { vm } = await sendWith({ recipientCount: 2 })

    expect(vm.batchResult?.successCount).toBe(2)
    expect(vm.batchResult?.failureCount).toBe(0)
    expect(vm.batchResult?.totalCount).toBe(2)
  })
})
