import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { i18n } from '@/locales'

/**
 * RelatedProcessesPanel 单测（P52 关联流程工作区；BF20261013-043 流程编号设置入口）。
 *
 * mock workflow api 层，验证：
 *   - 以 formKey 向后端请求过滤（前端不做本地筛选）；
 *   - 创建关联流程自动带入当前表单身份（服务端持久化契约）；
 *   - 无 formKey（未保存草稿）不发起请求并显示引导态；
 *   - formKey 变化时重置分页重新请求（切表单防串位）；
 *   - 流程编号设置：单流程直接进入规则编辑器（多流程先选择）。
 */

const mockPageProcessDefs = vi.fn()
const mockCreateProcessDef = vi.fn()
const mockGetProcessDefThemeRule = vi.fn()

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  createProcessDef: (...args: unknown[]) => mockCreateProcessDef(...args),
  getProcessDefThemeRule: (...args: unknown[]) => mockGetProcessDefThemeRule(...args),
  updateProcessDefThemeRule: vi.fn(),
}))

import RelatedProcessesPanel from './RelatedProcessesPanel.vue'

/** el-dialog 在 jsdom 下 teleport/懒渲染，用最小桩展开插槽内容；el-table 用真组件。 */
const overlayStubs = {
  'el-dialog': {
    template: '<div class="stub-dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
}

/** 流程编号弹窗（ThemeRuleDialog）依赖用户会话 store，统一注入 pinia */
const globalOpts = () => ({ stubs: overlayStubs, plugins: [createPinia()] })

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

  it('mount 时以 formKey 请求后端过滤的流程列表；页首无标题/描述/汇总噪音', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    expect(mockPageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 }, 'leave-request')
    expect(wrapper.text()).toContain('请假审批流程')
    // 0.1.7 #25 回归：左上角标题/描述/「共 N 个流程 · 启用 N 个」汇总计数为噪音，全部去除，
    // 筛选栏即本页最顶部（表单可单独存在，该工作区只保留可操作内容）
    expect(wrapper.find('.related-processes__title').exists()).toBe(false)
    expect(wrapper.find('.related-processes__subtitle').exists()).toBe(false)
    expect(wrapper.find('.related-processes__total').exists()).toBe(false)
    const root = wrapper.find('.related-processes')
    expect(root.element.firstElementChild?.className).toContain('related-processes__filter')
  })

  it('查询与新建流程同处筛选栏右侧动作组（新建流程紧随查询）', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    const actions = wrapper.find('.related-processes__filter-actions')
    expect(actions.exists()).toBe(true)
    const labels = actions.findAll('button').map((button) => button.text().trim())
    expect(labels).toEqual([i18n.global.t('common.query'), i18n.global.t('form.createProcess')])
    // 流程编号设置入口已上收设计器工具条右上角，面板内不再有该按钮
    expect(
      wrapper
        .findAll('button')
        .some((button) =>
          button.text().includes(i18n.global.t('form.relatedProcessNumberSetting')),
        ),
    ).toBe(false)
  })

  it('无 formKey（未保存草稿）不发起请求，显示保存引导', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: '', formKey: '' },
      global: globalOpts(),
    })
    await flushPromises()

    expect(mockPageProcessDefs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('尚未保存')
  })

  it('创建关联流程自动带入当前表单身份并刷新列表', async () => {
    mockCreateProcessDef.mockResolvedValueOnce({ defId: 9, graph: {} })
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    // 打开创建弹窗（工具栏按钮）并输入名称；操作标签在 R2a 已统一为「新建」表述，
    // 断言目录文案而不是写死的说法
    const openLabel = i18n.global.t('form.createRelatedProcess')
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes(openLabel))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    const input = wrapper.find('input[placeholder="请输入流程名称"]')
    expect(input.exists()).toBe(true)
    ;(input.element as HTMLInputElement).value = '新审批流程'
    await input.trigger('input')

    const footerButtons = wrapper.findAll('.stub-dialog button')
    // 创建动作标签在 R2a 已统一为「新建」，断言目录文案而不是写死的说法
    const createLabel = i18n.global.t('common.create')
    const submitBtn = footerButtons.find((b) => b.text().trim() === createLabel)
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
      global: globalOpts(),
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

  // BF20261013-043：流程编号设置入口（单流程直接进入规则编辑器，变量按钮同框带入）
  // 0.1.7 #25 回归：入口按钮上收设计器工具条，面板经 defineExpose 暴露同一入口给宿主
  it('流程编号设置：单流程时直接打开规则编辑器并回显当前规则', async () => {
    mockGetProcessDefThemeRule.mockResolvedValueOnce('JRZX_{SEQ:3}')
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()
    ;(wrapper.vm as unknown as { openNumberSettings: () => void }).openNumberSettings()
    // 编号弹窗经异步接缝加载，等待规则请求真正发出（而不是依赖固定 tick 数）
    await vi.waitFor(() => expect(mockGetProcessDefThemeRule).toHaveBeenCalledWith(2))
    await flushPromises()

    const chips = wrapper.findAll('.theme-editor__chip')
    expect(chips.map((chip) => chip.attributes('data-token'))).toEqual(['{SEQ:3}'])
    expect(wrapper.find('.theme-editor').findAll('.theme-editor__add').length).toBe(5)
  })

  it('流程编号设置：无关联流程时入口为空操作（不打开任何弹窗）', async () => {
    mockPageProcessDefs.mockResolvedValueOnce({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()
    ;(wrapper.vm as unknown as { openNumberSettings: () => void }).openNumberSettings()
    await flushPromises()

    // el-dialog 桩无条件渲染插槽，故以「规则请求未发出」为准（真实可见性由 el-dialog 自己管）
    expect(mockGetProcessDefThemeRule).not.toHaveBeenCalled()
  })
})
