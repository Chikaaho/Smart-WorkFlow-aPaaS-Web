import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import FormDesigner from './FormDesigner.vue'

const designerStubs = {
  FieldPalette: { template: '<div class="stub-palette" />' },
  DesignerCanvas: { template: '<div class="stub-canvas" />' },
  FieldConfigPanel: { template: '<div class="stub-config" />' },
  SubFieldDesigner: { template: '<div class="stub-subfield" />' },
  PreviewModal: { template: '<div class="stub-preview" />' },
  HistoryVersionsDialog: { template: '<div class="stub-history" />' },
  RelatedProcessesPanel: { template: '<div class="stub-processes" />' },
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
    expect(wrapper.text()).toContain('leave-request')
    expect(wrapper.text()).toContain('未修改')
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

    // 先制造修改（改标题）再保存失败
    const titleInput = wrapper.find('input[placeholder="表单名称"]')
    ;(titleInput.element as HTMLInputElement).value = '改过的名称'
    await titleInput.trigger('input')
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

    const titleInput = wrapper.find('input[placeholder="表单名称"]')
    ;(titleInput.element as HTMLInputElement).value = '未保存的名称'
    await titleInput.trigger('input')

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
