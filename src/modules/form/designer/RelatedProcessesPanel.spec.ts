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
const mockGetProcessNodeCapabilities = vi.fn()

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  createProcessDef: (...args: unknown[]) => mockCreateProcessDef(...args),
  getProcessDefThemeRule: (...args: unknown[]) => mockGetProcessDefThemeRule(...args),
  getProcessNodeCapabilities: (...args: unknown[]) => mockGetProcessNodeCapabilities(...args),
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
      creatorName: '系统管理员',
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

  it('列表展示创建人回填名、不展示流程编号', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    expect(wrapper.text()).toContain('系统管理员')
    // 0.1.10：UI 不再展示 processKey/编号，名称列只保留流程名称
    expect(wrapper.text()).not.toContain('leave_approval')
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

    // 0.1.7 #37 要素编排器：要素条按当前规则回显（常量独立成格），选中首要素后配置区与六类要素按钮可见
    const chips = wrapper.findAll('[data-testid="theme-element-chip"]')
    expect(chips.map((chip) => chip.attributes('data-raw'))).toEqual(['JRZX_', '{SEQ:3}'])
    expect(chips[0]!.attributes('data-kind')).toBe('text')
    expect(wrapper.find('[data-testid="theme-element-config"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="theme-element-add-"]').length).toBe(6)
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

  // ── Q56：零关联流程分支展示未配置空画布 + 节点库（纯展示），打开不创建任何定义 ──
  const emptyResult = { list: [], total: 0, pageNum: 1, pageSize: 10 }
  const capabilityResult = [
    {
      type: 'START',
      displayName: '开始',
      description: '',
      category: 'EVENT',
      version: '1',
      topology: {},
      configFields: [],
      supports: { design: true, save: true, publish: true, run: true },
    },
    {
      type: 'APPROVAL',
      displayName: '审批',
      description: '',
      category: 'HUMAN',
      version: '1',
      topology: {},
      configFields: [],
      supports: { design: true, save: true, publish: true, run: true },
    },
  ]

  it('零关联流程：展示节点库 + 未配置空画布 + 创建入口，不展示空表格', async () => {
    mockPageProcessDefs.mockResolvedValueOnce(emptyResult)
    mockGetProcessNodeCapabilities.mockResolvedValue(capabilityResult)
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    // 打开空状态只发起只读 GET（能力目录 + 流程列表），绝不 POST 创建
    expect(mockGetProcessNodeCapabilities).toHaveBeenCalledTimes(1)
    expect(mockCreateProcessDef).not.toHaveBeenCalled()

    expect(wrapper.find('[data-testid="unconfigured-flow-board"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="unconfigured-flow-palette"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="unconfigured-flow-canvas"]').exists()).toBe(true)
    // 节点库复用设计器同一能力投影（分组标题 + 节点名 + 类型标记）
    expect(wrapper.find('[data-node-type="START"]').exists()).toBe(true)
    expect(wrapper.find('[data-node-type="APPROVAL"]').exists()).toBe(true)
    // 空分支不再渲染「暂无数据」表格卡片
    expect(wrapper.find('.related-processes__table-card').exists()).toBe(false)
    // 既有创建入口仍在筛选栏
    expect(wrapper.find('.related-processes__create').exists()).toBe(true)
  })

  it('零关联流程：空画布创建入口只打开命名弹窗，取消不发起创建请求', async () => {
    mockPageProcessDefs.mockResolvedValue(emptyResult)
    mockGetProcessNodeCapabilities.mockResolvedValue(capabilityResult)
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    const boardCreate = wrapper.find('[data-testid="unconfigured-flow-create"]')
    expect(boardCreate.exists()).toBe(true)
    await boardCreate.trigger('click')
    expect(wrapper.find('input[placeholder="请输入流程名称"]').exists()).toBe(true)
    expect(mockCreateProcessDef).not.toHaveBeenCalled()

    const footerButtons = wrapper.findAll('.stub-dialog button')
    const cancelBtn = footerButtons.find((b) => b.text().trim() === i18n.global.t('common.cancel'))
    await cancelBtn!.trigger('click')
    await flushPromises()
    expect(mockCreateProcessDef).not.toHaveBeenCalled()
    // 空状态画布仍在（未做本地持久化，也未跳转设计器）
    expect(wrapper.find('[data-testid="unconfigured-flow-board"]').exists()).toBe(true)
  })

  it('已有关联流程：不渲染未配置空画布（维持既有列表/进设计器行为）', async () => {
    const wrapper = mount(RelatedProcessesPanel, {
      props: { formId: 'uuid-1', formKey: 'leave-request' },
      global: globalOpts(),
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="unconfigured-flow-board"]').exists()).toBe(false)
    expect(wrapper.find('.related-processes__table-card').exists()).toBe(true)
  })
})
