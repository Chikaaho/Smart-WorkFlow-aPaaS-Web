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
const mockGetFormDefinition = vi.fn()

vi.mock('../api/form-def', () => ({
  listFormSnapshots: (...args: unknown[]) => mockListFormSnapshots(...args),
  getFormSnapshotDefinition: (...args: unknown[]) => mockGetFormSnapshotDefinition(...args),
  parseDefinitionAlias: undefined,
}))

vi.mock('@/adapters/form-designer', () => ({
  parseDefinition: vi.fn((raw: string) => JSON.parse(raw)),
}))

vi.mock('../api/form', () => ({
  getFormDefinition: (...args: unknown[]) => mockGetFormDefinition(...args),
}))

import HistoryVersionsDialog from './HistoryVersionsDialog.vue'

/** el-dialog 在 jsdom 下 teleport/懒渲染，用最小桩展开插槽内容；el-table 用真组件。 */
const overlayStubs = {
  'el-dialog': {
    template: '<div><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  PreviewModal: { template: '<div class="stub-preview" />' },
  PublishedSnapshotViewer: {
    name: 'PublishedSnapshotViewer',
    props: ['visible', 'formId', 'formKey', 'snapshot'],
    template: '<div class="stub-published-snapshot" />',
  },
}

const snapshots = [
  { formVersion: 3, createTime: '2026-07-01 16:20:00', status: 'PUBLISHED' },
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

  async function mountOpen(extra: Record<string, unknown> = {}) {
    const wrapper = mount(HistoryVersionsDialog, {
      props: {
        formId: 'uuid-1',
        formKey: 'contract-approval',
        visible: true,
        ...extra,
      },
      global: { stubs: overlayStubs },
    })
    await flushPromises()
    return wrapper
  }

  it('打开时加载快照列表并渲染版本号与发布时间', async () => {
    const wrapper = await mountOpen()

    expect(mockListFormSnapshots).toHaveBeenCalledWith('uuid-1')
    // 卡片式重构后：时间截到分钟、徽标=已发布 v{N}
    expect(wrapper.text()).toContain('2026-05-11 14:00')
    expect(wrapper.text()).toContain('已发布 v3')
    expect(wrapper.text()).toContain('当前草稿')
  })

  it('只读预览读取指定版本 definition，历史标识传给预览层', async () => {
    const wrapper = await mountOpen()

    // 选中历史卡后经『对比当前』打开只读预览
    const card = wrapper
      .findAll('.history-table tbody tr')
      .find((c) => c.text().includes('2026-05-11 14:00'))
    expect(card).toBeTruthy()
    await card!.trigger('click')
    await flushPromises()
    const compareBtn = wrapper.findAll('button').find((b) => b.text().includes('对比当前'))
    expect(compareBtn).toBeTruthy()
    await compareBtn!.trigger('click')
    await flushPromises()

    expect(mockGetFormSnapshotDefinition).toHaveBeenCalledWith('uuid-1', 1)
    // 历史版本标识经 badge 传给只读预览层
    const preview = wrapper.find('.stub-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('badge')).toBe('历史版本 V1 · 只读')
  })

  it('表单从未发布过 → 空态文案，不报错', async () => {
    mockListFormSnapshots.mockResolvedValue([])
    const wrapper = await mountOpen()

    expect(wrapper.text()).toContain('尚未发布过')
  })

  it('服务端未给 status 的快照按已发布呈现，宿主已发布状态不显示当前草稿', async () => {
    mockListFormSnapshots.mockResolvedValue([
      {
        formVersion: 2,
        versionLabel: '3.2',
        createTime: '2026-10-23 10:30:00',
      },
    ])
    const wrapper = await mountOpen({
      formVersion: 2,
      formVersionLabel: '3.2',
      formStatus: 'PUBLISHED',
    })

    const current = wrapper.find('.history-dialog__current')
    expect(current.text()).toContain('当前版本 v3.2')
    expect(current.text()).toContain('已发布')
    expect(current.text()).not.toContain('当前草稿')
    expect(current.text()).not.toContain('未发布')
    expect(wrapper.find('.history-table tbody tr').text()).toContain('已发布 v3.2')
  })

  it('宿主为草稿时仍标记未发布，缺 status 的历史快照不会被带成草稿', async () => {
    mockListFormSnapshots.mockResolvedValue([{ formVersion: 2, createTime: '2026-10-23 10:30:00' }])
    const wrapper = await mountOpen({
      formVersion: 2,
      formStatus: 'DRAFT',
    })

    const current = wrapper.find('.history-dialog__current')
    expect(current.text()).toContain('当前草稿 v2')
    expect(current.text()).toContain('未发布')
    expect(wrapper.find('.history-table tbody tr').text()).toContain('已发布 v2')
  })

  it('把选中版本交给完整只读快照查看器', async () => {
    const wrapper = await mountOpen()
    const card = wrapper
      .findAll('.history-table tbody tr')
      .find((c) => c.text().includes('2026-05-11 14:00'))
    expect(card).toBeTruthy()
    await card!.trigger('click')

    const openButton = wrapper.findAll('button').find((b) => b.text().includes('查看完整快照'))
    expect(openButton).toBeTruthy()
    await openButton!.trigger('click')

    const viewer = wrapper.findComponent({ name: 'PublishedSnapshotViewer' })
    expect(viewer.exists()).toBe(true)
    expect(viewer.props()).toMatchObject({
      visible: true,
      formId: 'uuid-1',
      formKey: 'contract-approval',
      snapshot: expect.objectContaining({ formVersion: 1 }),
    })
  })

  it('组件零回写路径：不引入 save/publish（结构断言）', async () => {
    const source = await import('./HistoryVersionsDialog.vue?raw')
    expect(source.default).not.toMatch(/saveFormConfig|publishFormDef|saveConfig/)
  })

  it('新旧脚本并列：历史快照与当前定义各自读取自身脚本，不合并', async () => {
    mockGetFormSnapshotDefinition.mockResolvedValue({
      formVersion: 2,
      createTime: '2026-06-02 11:30:00',
      definition: JSON.stringify({
        title: '合同审批 V2',
        fields: [
          { name: 'amount', label: '金额', type: 'NUMBER', script: { code: 'return old_amount;' } },
        ],
        events: {
          beforeSubmitHandler: [
            { id: 'old-check', name: '旧提交检查', script: 'return old_check;', enabled: true },
          ],
        },
      }),
    })
    mockGetFormDefinition.mockResolvedValue({
      title: '合同审批 V3',
      fields: [
        { name: 'amount', label: '金额', type: 'NUMBER', script: { code: 'return new_amount;' } },
      ],
      events: {
        beforeSubmitHandler: [
          { id: 'new-check', name: '新提交检查', script: 'return new_check;', enabled: true },
        ],
      },
    })

    const wrapper = await mountOpen()
    const compareButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('对比脚本'))
    expect(compareButton).toBeTruthy()
    await compareButton!.trigger('click')
    await flushPromises()

    expect(mockGetFormSnapshotDefinition).toHaveBeenCalledWith('uuid-1', 2)
    expect(mockGetFormDefinition).toHaveBeenCalledWith('contract-approval')

    const columns = wrapper.findAll('.script-compare__column')
    expect(columns).toHaveLength(2)
    // 左右列各自只含本版本脚本，不混入另一版本
    expect(columns[0].text()).toContain('return old_amount;')
    expect(columns[0].text()).toContain('return old_check;')
    expect(columns[0].text()).not.toContain('return new_amount;')
    expect(columns[1].text()).toContain('return new_amount;')
    expect(columns[1].text()).toContain('return new_check;')
    expect(columns[1].text()).not.toContain('return old_amount;')
  })
})
