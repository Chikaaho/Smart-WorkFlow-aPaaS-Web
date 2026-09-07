import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * RelatedProcessesPanel 单测（P52 关联流程工作区）。
 *
 * mock workflow api 层，验证：
 *   - 以 formKey 向后端请求过滤（前端不做本地筛选）；
 *   - 创建关联流程自动带入当前表单身份（服务端持久化契约）；
 *   - 无 formKey（未保存草稿）不发起请求并显示引导态；
 *   - formKey 变化时重置分页重新请求（切表单防串位）。
 */

const mockPageProcessDefs = vi.fn()
const mockCreateProcessDef = vi.fn()

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  createProcessDef: (...args: unknown[]) => mockCreateProcessDef(...args),
}))

import RelatedProcessesPanel from './RelatedProcessesPanel.vue'

/** el-dialog 在 jsdom 下 teleport/懒渲染，用最小桩展开插槽内容；el-table 用真组件。 */
const overlayStubs = {
  'el-dialog': {
    template: '<div class="stub-dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
}

const pageResult = {
  list: [
    {
      id: 2,
      processKey: 'leave_approval',
      name: '请假审批流程',
      formKey: 'leave-request',
      defVersion: 1,
      status: 'PUBLISHED' as const,
      createTime: '2026-07-08 14:20:00',
      updateTime: '2026-07-09 09:10:00',
    },
  ],
  total: 1,
  pageNum: 1,
  pageSize: 10,
}

describe('RelatedProcessesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPageProcessDefs.mockResolvedValue(pageResult)
  })

  it('mount 时以 formKey 请求后端过滤的流程列表', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: { stubs: overlayStubs },
    })
    await flushPromises()

    expect(mockPageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, 'leave-request')
    expect(wrapper.text()).toContain('请假审批流程')
    expect(wrapper.text()).toContain('共 1 条')
  })

  it('无 formKey（未保存草稿）不发起请求，显示保存引导', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: '', formKey: '' },
      global: { stubs: overlayStubs },
    })
    await flushPromises()

    expect(mockPageProcessDefs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('尚未保存')
  })

  it('创建关联流程自动带入当前表单身份并刷新列表', async () => {
    mockCreateProcessDef.mockResolvedValueOnce({ defId: 9, graph: {} })
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: { stubs: overlayStubs },
    })
    await flushPromises()

    // 打开创建弹窗（工具栏「创建关联流程」按钮）并输入名称
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('创建关联流程'))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    const input = wrapper.find('input[placeholder="请输入流程名称"]')
    expect(input.exists()).toBe(true)
    ;(input.element as HTMLInputElement).value = '新审批流程'
    await input.trigger('input')

    const footerButtons = wrapper.findAll('.stub-dialog button')
    const submitBtn = footerButtons.find((b) => b.text().trim() === '创建')
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockCreateProcessDef).toHaveBeenCalledWith({
      name: '新审批流程',
      formKey: 'leave-request',
    })
    // 创建成功后刷新列表（第二次请求）
    expect(mockPageProcessDefs).toHaveBeenCalledTimes(2)
  })

  it('formKey 变化时重置分页并重新请求（切表单防串位）', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: { stubs: overlayStubs },
    })
    await flushPromises()
    expect(mockPageProcessDefs).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ formId: 'uuid-2', formKey: 'purchase-order' })
    await flushPromises()

    expect(mockPageProcessDefs).toHaveBeenLastCalledWith(
      { pageNum: 1, pageSize: 10 },
      'purchase-order',
    )
  })
})
