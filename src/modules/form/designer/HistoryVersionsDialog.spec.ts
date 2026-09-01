import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * HistoryVersionsDialog 单测（P52 历史版本工作台）。
 *
 * mock form-def api 层，验证：
 *   - 打开时加载快照列表（版本倒序由数据源保证）；
 *   - 只读预览读取指定版本 definition，并向 PreviewModal 传明确的历史版本标识；
 *   - 零回写路径：组件不调用任何 save/publish 接口。
 */

const mockListFormSnapshots = vi.fn()
const mockGetFormSnapshotDefinition = vi.fn()

vi.mock('../api/form-def', () => ({
  listFormSnapshots: (...args: unknown[]) => mockListFormSnapshots(...args),
  getFormSnapshotDefinition: (...args: unknown[]) => mockGetFormSnapshotDefinition(...args),
  parseDefinitionAlias: undefined,
}))

vi.mock('@/adapters/form-designer', () => ({
  parseDefinition: vi.fn((raw: string) => JSON.parse(raw)),
}))

import HistoryVersionsDialog from './HistoryVersionsDialog.vue'

/** el-dialog 在 jsdom 下 teleport/懒渲染，用最小桩展开插槽内容；el-table 用真组件。 */
const overlayStubs = {
  'el-dialog': {
    template: '<div><slot /></div>',
    props: ['modelValue'],
  },
  PreviewModal: { template: '<div class="stub-preview" />' },
}

const snapshots = [
  { formVersion: 3, createTime: '2026-07-01 16:20:00' },
  { formVersion: 2, createTime: '2026-06-02 11:30:00' },
  { formVersion: 1, createTime: '2026-05-11 14:00:00' },
]

describe('HistoryVersionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListFormSnapshots.mockResolvedValue(snapshots)
    mockGetFormSnapshotDefinition.mockResolvedValue({
      formVersion: 2,
      createTime: '2026-06-02 11:30:00',
      definition: '{"title":"合同审批 V2","fields":[]}',
    })
  })

  async function mountOpen() {
    const wrapper = mount(HistoryVersionsDialog, {
      props: { formId: 'uuid-1', formKey: 'contract-approval', visible: true },
      global: { stubs: overlayStubs },
    })
    await flushPromises()
    return wrapper
  }

  it('打开时加载快照列表并渲染版本号与发布时间', async () => {
    const wrapper = await mountOpen()

    expect(mockListFormSnapshots).toHaveBeenCalledWith('uuid-1')
    expect(wrapper.text()).toContain('V3')
    expect(wrapper.text()).toContain('2026-05-11 14:00:00')
    expect(wrapper.text()).toContain('已发布')
  })

  it('只读预览读取指定版本 definition，历史标识传给预览层', async () => {
    const wrapper = await mountOpen()

    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('只读预览'))
    expect(previewBtn).toBeTruthy()
    // 点击列表首行（V3）
    await previewBtn!.trigger('click')
    await flushPromises()

    expect(mockGetFormSnapshotDefinition).toHaveBeenCalledWith('uuid-1', 3)
    // 历史版本标识经 badge 传给只读预览层
    const preview = wrapper.find('.stub-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('badge')).toBe('历史版本 V3 · 只读')
  })

  it('表单从未发布过 → 空态文案，不报错', async () => {
    mockListFormSnapshots.mockResolvedValue([])
    const wrapper = await mountOpen()

    expect(wrapper.text()).toContain('尚未发布过')
  })

  it('组件零回写路径：不引入 save/publish（结构断言）', async () => {
    const source = await import('./HistoryVersionsDialog.vue?raw')
    expect(source.default).not.toMatch(/saveFormConfig|publishFormDef|saveConfig/)
  })
})
