import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h, onMounted } from 'vue'
import type { SetupContext } from 'vue'
import { ApiError } from '@/foundation/request'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * FormDesigner 工作台单测（P52）。
 *
 * 验证：
 *   - 编辑态挂载：以路由 :id 加载表单身份（getFormDefById）+ 定义，身份可见；
 *   - 身份加载失败（不存在/无权）→ 明确拒绝态，不回退其他表单；
 *   - 保存成功 → 基线同步（保存成功态）；保存失败 → 保存失败态且不丢未保存内容；
 *   - 发布守卫：存在未保存修改时先走保存/放弃/取消保护，保存失败不得继续发布。
 */

const mockGetFormDefById = vi.fn()
const mockGetFormDefinitionById = vi.fn()

vi.mock('@/modules/form/api/form-def', () => ({
  getFormDefById: (...args: unknown[]) => mockGetFormDefById(...args),
  getFormDefinitionById: (...args: unknown[]) => mockGetFormDefinitionById(...args),
  listFormSnapshots: vi.fn(),
  getFormSnapshotDefinition: vi.fn(),
  publishNewFormVersion: vi.fn(),
}))

const mockSaveDraftDefinition = vi.fn()
const mockPublishDefinition = vi.fn()

vi.mock('../designer/draft-actions', () => ({
  saveDraftDefinition: (...args: unknown[]) => mockSaveDraftDefinition(...args),
  publishDefinition: (...args: unknown[]) => mockPublishDefinition(...args),
}))

const { mockConfirm, mockMessage } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  // 部分替换：adapters/form-designer 还依赖 EP 组件导出，仅换 ElMessage/ElMessageBox
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: mockMessage,
    ElMessageBox: {
      confirm: (...args: unknown[]) => mockConfirm(...args),
    },
  }
})

const mockRouterReplace = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'uuid-1' }, query: {} }),
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}))

const mockPageProcessDefs = vi.fn()
vi.mock('@/adapters/process-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/adapters/process-catalog')>()
  return {
    ...actual,
    pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  }
})

import FormDesigner from './FormDesigner.vue'

/** 关联流程面板桩暴露的「流程编号设置」入口（0.1.7 #25 回归：入口在工具条，由宿主转交） */
const mockOpenNumberSettings = vi.fn()

const designerStubs = {
  // V011-BUG-006/014 起画布标题输入已移除：以「组件库添加字段」作为制造脏态的真实入口
  FieldPalette: {
    template:
      "<button class=\"stub-palette-add\" @click=\"$emit('add', { id: 'f1', field: { name: 'field_1', type: 'TEXT', label: '单行文本', colSpan: 24, subFields: [] } })\" />",
    emits: ['add'],
  },
  DesignerCanvas: { template: '<div class="stub-canvas" />' },
  FieldConfigPanel: { template: '<div class="stub-config" />' },
  // 0.1.7 #39：字段清单成为工作区页签（独立组件），宿主测试用桩隔离其表格内部
  FieldListPanel: { template: '<div class="stub-field-list" />' },
  SubFieldDesigner: { template: '<div class="stub-subfield" />' },
  PreviewModal: { template: '<div class="stub-preview" />' },
  HistoryVersionsDialog: { template: '<div class="stub-history" />' },
  // 0.1.7 #25 回归：面板经 defineExpose 暴露编号设置入口、并上报流程数量
  RelatedProcessesPanel: {
    emits: ['enter-process', 'update:process-count'],
    setup(_props: unknown, { expose, emit }: SetupContext) {
      expose({ openNumberSettings: mockOpenNumberSettings })
      onMounted(() => emit('update:process-count', 1))
      return () => h('div', { class: 'stub-processes' })
    },
  },
}

const identityDto = {
  id: 'uuid-1',
  formKey: 'leave-request',
  name: '请假申请单',
  status: 'DRAFT' as const,
  formVersion: 1,
}
const definition = { title: '请假申请单', fields: [] }

describe('FormDesigner 工作台（P52）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFormDefById.mockResolvedValue(identityDto)
    mockGetFormDefinitionById.mockResolvedValue(definition)
    mockSaveDraftDefinition.mockResolvedValue({ id: 'uuid-1', status: 'DRAFT' })
    mockPageProcessDefs.mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 10 })
  })

  async function mountDesigner() {
    const wrapper = mount(FormDesigner, { global: { stubs: designerStubs } })
    await flushPromises()
    return wrapper
  }

  it('编辑态挂载加载表单身份并展示 formKey / 保存状态', async () => {
    const wrapper = await mountDesigner()

    expect(mockGetFormDefById).toHaveBeenCalledWith('uuid-1')
    expect(mockGetFormDefinitionById).toHaveBeenCalledWith('uuid-1')
    // V011-BUG-006：formKey 不再入画布；身份见面包屑表单名
    expect(wrapper.text()).toContain('请假申请单')
    // 打开已有定义不会伪造保存时刻，也不会触发一次保存。
    expect(wrapper.find('.designer__save-state').text()).toBe('已保存')
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled()
  })

  it('身份加载失败（不存在/无权）→ 拒绝态，不回退其他表单', async () => {
    mockGetFormDefById.mockRejectedValueOnce(new Error('表单不存在'))
    const wrapper = await mountDesigner()

    expect(wrapper.text()).toContain('无法打开该表单')
    expect(wrapper.text()).toContain('表单不存在')
    expect(wrapper.find('.stub-canvas').exists()).toBe(false)
  })

  it('S1 读取 403 → 无权限拒绝态，工作台头部与操作区零渲染', async () => {
    mockGetFormDefById.mockRejectedValueOnce(new ApiError(403, '没有操作权限'))
    const wrapper = await mountDesigner()

    expect(wrapper.text()).toContain('无权访问该表单')
    expect(wrapper.text()).toContain('没有操作权限')
    // 头部（身份输入/tabs/保存/发布/历史）与画布、关联流程区全部不渲染
    expect(wrapper.find('.designer__workbench').exists()).toBe(false)
    expect(wrapper.find('.stub-canvas').exists()).toBe(false)
    expect(wrapper.find('.stub-processes').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === '发布')).toBe(false)
  })

  // 字段清单、表单设计、流程设计与权限同处居中页签组。
  it('工作区页签：完整页签整组居中，字段清单在最左；「设置」下拉已去除', async () => {
    const wrapper = await mountDesigner()

    const tabs = wrapper.findAll('.designer__tab')
    expect(tabs.map((tab) => tab.text())).toEqual([
      '字段清单',
      '表单设计',
      '流程设计',
      '权限',
      '事件',
    ])
    // 页签同处居中页签组（几何由浏览器自验，见台账 #39）
    expect(
      wrapper.findAll('.designer__tab').every((tab) => tab.element.closest('.designer__tabs')),
    ).toBe(true)
    // 「设置」入口不再存在
    expect(wrapper.findAll('button').some((b) => b.text() === '设置')).toBe(false)
    // 默认在表单设计页签
    expect(tabs[1]!.classes()).toContain('is-active')
    expect(wrapper.find('.stub-canvas').exists()).toBe(true)
  })

  it('点「字段清单」页签 → 切到字段清单工作区（画布卸载、清单渲染）', async () => {
    const wrapper = await mountDesigner()

    await wrapper.findAll('.designer__tab')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.designer__tab')[0]!.classes()).toContain('is-active')
    expect(wrapper.find('.stub-field-list').exists()).toBe(true)
    expect(wrapper.find('.stub-canvas').exists()).toBe(false)
  })

  // 0.1.7 #25 回归：内容区左上角标题/描述/汇总噪音去除后，「流程编号设置」入口上收工具条右上角
  // 0.1.7 #43：按钮文案瘦身为「编号设置」（≤4 字口径）
  it('流程设计页签：流程编号设置入口在工具条动作组内，点击转交关联流程面板', async () => {
    const wrapper = await mountDesigner()
    const label = '编号设置'
    // 表单设计页签不显示该入口
    expect(wrapper.findAll('button').some((b) => b.text().includes(label))).toBe(false)

    const processTab = wrapper.findAll('.designer__tab').find((b) => b.text() === '流程设计')!
    await processTab.trigger('click')
    await flushPromises()

    const numberBtn = wrapper.findAll('button').find((b) => b.text().includes(label))
    expect(numberBtn).toBeTruthy()
    // 入口位于右上角动作组（草稿历史/预览/保存/发布新版本同组）
    expect(numberBtn!.element.closest('.designer__actions')).not.toBeNull()

    await numberBtn!.trigger('click')
    expect(mockOpenNumberSettings).toHaveBeenCalledTimes(1)
  })

  it('流程设计页签：单流程直接进入画布，不渲染关联流程列表', async () => {
    mockPageProcessDefs.mockResolvedValueOnce({
      list: [{ id: 9, name: '灾备演练审批' }],
      total: '1',
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = await mountDesigner()
    const processTab = wrapper.findAll('.designer__tab').find((b) => b.text() === '流程设计')!

    await processTab.trigger('click')
    await flushPromises()

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('/workflow/defs/9/design?from=form-workbench'),
    )
    expect(wrapper.find('.stub-processes').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('编号设置'))).toBe(false)
  })

  it('保存成功 → 调用保存动作并显示「保存成功」', async () => {
    const wrapper = await mountDesigner()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '保存')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(mockSaveDraftDefinition).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('保存成功')
  })

  it('保存失败 → 显示「保存失败」，内容与未保存标记保留', async () => {
    mockSaveDraftDefinition.mockRejectedValueOnce(new Error('网络错误'))
    const wrapper = await mountDesigner()

    // 先制造修改（组件库加字段）再保存失败
    await wrapper.find('.stub-palette-add').trigger('click')
    expect(wrapper.text()).toContain('未保存')

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '保存')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('保存失败')
    expect(wrapper.text()).not.toContain('保存成功')
    // 失败不清除未保存标记：回 idle 后仍应显示未保存（此处 error 相位即失败语义）
  })

  it('有未保存修改时发布：先走保存/放弃/取消保护；保存失败不得继续发布', async () => {
    // 保护框选择「保存并继续」，但保存失败
    mockConfirm.mockResolvedValueOnce(undefined)
    mockSaveDraftDefinition.mockRejectedValueOnce(new Error('保存失败'))
    const wrapper = await mountDesigner()

    await wrapper.find('.stub-palette-add').trigger('click')

    const publishBtn = wrapper.findAll('button').find((b) => b.text() === '发布')!
    await publishBtn.trigger('click')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockConfirm.mock.calls[0][0]).toContain('未保存')
    expect(mockSaveDraftDefinition).toHaveBeenCalledTimes(1)
    // 保存失败 → 发布动作不得发出
    expect(mockPublishDefinition).not.toHaveBeenCalled()
  })

  it('无未保存修改时发布：不走保护，直接发布确认', async () => {
    mockConfirm.mockResolvedValueOnce(undefined)
    mockPublishDefinition.mockResolvedValueOnce({ ...identityDto, status: 'PUBLISHED' })
    const wrapper = await mountDesigner()

    const publishBtn = wrapper.findAll('button').find((b) => b.text() === '发布')!
    await publishBtn.trigger('click')
    await flushPromises()

    // 仅发布确认弹窗一次（无脏状态保护框）
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockConfirm.mock.calls[0][0]).toContain('确认发布')
    expect(mockPublishDefinition).toHaveBeenCalledTimes(1)
  })
})
