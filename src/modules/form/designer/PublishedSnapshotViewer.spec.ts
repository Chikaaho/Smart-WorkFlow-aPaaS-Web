import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockGetFormSnapshotDefinition = vi.fn()
const mockLoadCandidates = vi.fn()
const mockLoadGraph = vi.fn()

vi.mock('../api/form-def', () => ({
  getFormSnapshotDefinition: (...args: unknown[]) => mockGetFormSnapshotDefinition(...args),
}))

vi.mock('@/adapters/published-snapshot', () => ({
  loadSnapshotProcessVersionCandidates: (...args: unknown[]) => mockLoadCandidates(...args),
  loadSnapshotProcessVersionGraph: (...args: unknown[]) => mockLoadGraph(...args),
}))

import PublishedSnapshotViewer from './PublishedSnapshotViewer.vue'

const snapshot = {
  formVersion: 5,
  versionLabel: '3.2',
  createTime: '2026-10-23 10:30:00',
  status: 'PUBLISHED' as const,
  author: '陈曦',
  note: '冻结发布',
}

const definition = {
  title: '资产采购申请',
  description: '冻结表单',
  schemaVersion: 7,
  fields: [
    {
      name: 'title',
      label: '采购名称',
      type: 'TEXT',
      required: true,
      minLength: 2,
      length: 80,
      pattern: '^A',
      patternMessage: '需以 A 开头',
      colSpan: 12,
      description: '采购事项',
      script: { code: 'return #获取字段值("title");' },
    },
    {
      name: 'items',
      label: '采购明细',
      type: 'TABLE',
      subFields: [{ name: 'amount', label: '金额', type: 'NUMBER', required: true }],
    },
  ],
  rules: {
    visibility: [
      {
        target: 'title',
        logic: 'ALL',
        conditions: [{ field: 'items.amount', op: 'NOT_EMPTY' }],
      },
    ],
  },
  fieldPermissions: {
    title: { view: ['role:buyer'], edit: ['role:purchaser'] },
  },
  actionPermissions: {
    submit: ['role:purchaser'],
  },
  events: {
    beforeSubmitHandler: [
      {
        id: 'before-check',
        name: '提交前检查',
        enabled: true,
        order: 1,
        script: 'return true;',
      },
    ],
  },
  listConfig: {
    columns: [{ name: 'title', label: '采购名称', width: 220 }],
    filters: [{ name: 'title', op: 'LIKE' }],
    defaultSort: { name: 'title', desc: true },
    actions: ['view', 'edit'],
  },
}

const processCandidate = {
  def: {
    id: 17,
    processKey: 'asset_purchase',
    name: '资产采购审批',
    formKey: 'asset-purchase',
    defVersion: 4,
    status: 'PUBLISHED',
    createTime: '2026-09-01 09:00:00',
    updateTime: '2026-10-23 10:30:00',
  },
  version: {
    id: 91,
    defId: 17,
    graphVersion: 4,
    status: 'PUBLISHED',
    name: '资产采购审批',
    formVersion: '3.2',
    publishedAt: '2026-10-23 10:30:00',
    publisherName: '陈曦',
  },
}

const processGraph = {
  processKey: 'asset_purchase',
  name: '资产采购审批',
  formKey: 'asset-purchase',
  version: 4,
  elements: [
    { id: 'start', kind: 'node', type: 'START', config: { name: '开始' } },
    {
      id: 'approve',
      kind: 'node',
      type: 'APPROVAL',
      config: {
        name: '部门审批',
        approvalMode: 'ALL',
        participant: { strategy: 'EXPRESSION', value: 'return ["2"];' },
        listeners: [{ label: '审批完成监听', script: 'return #获取流程变量("var_ok");' }],
      },
    },
    { id: 'edge-1', kind: 'edge', source: 'start', target: 'approve' },
  ],
  variables: [
    {
      varId: 'var_ok',
      name: '是否通过',
      type: 'BOOLEAN',
      source: 'MAIN_FORM',
      sourceField: 'approved',
    },
  ],
  triggers: [
    {
      triggerId: 'trg_node_enter',
      name: '节点开始前检查',
      enabled: true,
      event: 'NODE_ENTERING',
      nodeKey: 'approve',
      script: 'return 1;',
      variables: ['var_ok'],
      branches: [{ branchId: 'yes', matchType: 'NUMBER', matchValue: '1', actions: [] }],
    },
  ],
  advancedConfig: {
    startListener: 'assetStartListener',
    notifyChannels: ['站内消息'],
  },
}

const detailDialogStub = {
  props: ['modelValue', 'title', 'loading', 'error', 'showFooter'],
  template:
    '<section class="detail-dialog-stub"><h1>{{ title }}</h1><p v-if="error" class="detail-error">{{ error }}</p><div v-if="!loading"><slot /></div></section>',
}

async function mountViewer(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(PublishedSnapshotViewer, {
    props: {
      visible: true,
      formId: 'form-1',
      formKey: 'asset-purchase',
      snapshot,
      ...overrides,
    },
    global: {
      stubs: {
        DetailDialog: detailDialogStub,
        FormPreview: {
          props: ['schema', 'mode'],
          template: '<div class="fc-stub" :data-mode="mode" />',
        },
      },
    },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

async function openSection(wrapper: Awaited<ReturnType<typeof mountViewer>>, label: string) {
  const button = wrapper
    .findAll('.snapshot-nav__item')
    .find((candidate) => candidate.text().includes(label))
  expect(button).toBeTruthy()
  await button!.trigger('click')
}

describe('PublishedSnapshotViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFormSnapshotDefinition.mockResolvedValue({
      ...snapshot,
      definition: JSON.stringify(definition),
    })
    mockLoadCandidates.mockResolvedValue({ items: [processCandidate], failures: [] })
    mockLoadGraph.mockResolvedValue(processGraph)
  })

  it('按表单版本读取表单与关系冻结流程，并在概览中给出完整身份', async () => {
    const wrapper = await mountViewer()

    expect(mockGetFormSnapshotDefinition).toHaveBeenCalledWith('form-1', 5)
    expect(mockLoadCandidates).toHaveBeenCalledWith('asset-purchase')
    expect(mockLoadGraph).toHaveBeenCalledWith(17, 4)
    expect(wrapper.text()).toContain('资产采购申请')
    expect(wrapper.text()).toContain('v3.2')
    expect(wrapper.text()).toContain('资产采购审批')
    expect(wrapper.text()).toContain('asset_purchase · v4')
    expect(wrapper.text()).toContain('原始冻结定义')
  })

  it('表单设计 section renders frozen description and fields', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '表单设计')

    expect(wrapper.find('.snapshot-design__description').text()).toBe('冻结表单')
    expect(wrapper.findAll('.fc-stub')).toHaveLength(2)
    expect(
      wrapper.findAll('.fc-stub').every((node) => node.attributes('data-mode') === 'design'),
    ).toBe(true)
  })

  it('脚本与校验行可打开只读详情', async () => {
    const wrapper = await mountViewer()
    const vm = wrapper.vm as unknown as {
      scripts: Array<Record<string, unknown>>
      constraints: Array<Record<string, unknown>>
      openScriptDetail: (row: Record<string, unknown>) => void
      openValidationDetail: (row: Record<string, unknown>) => void
      scriptDetailVisible: boolean
      scriptDetailCode: string
      validationDetailVisible: boolean
    }

    vm.openScriptDetail(vm.scripts[0])
    expect(vm.scriptDetailVisible).toBe(true)
    expect(vm.scriptDetailCode).toContain('获取字段值')

    vm.openValidationDetail(vm.constraints[0])
    expect(vm.validationDetailVisible).toBe(true)
  })

  it('冻结字段同时展示主表、子表和完整字段配置', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '冻结字段')

    expect(wrapper.text()).toContain('title')
    expect(wrapper.text()).toContain('items.amount')
    expect(wrapper.text()).toContain('采购明细')
    expect(wrapper.text()).toContain('"subFields"')
  })

  it('校验、显隐和字段/动作权限来自快照 definition', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '校验')
    expect(wrapper.text()).toContain('最小长度')
    expect(wrapper.text()).toContain('正则约束')
    expect(wrapper.text()).toContain('需以 A 开头')

    await openSection(wrapper, '显隐')
    expect(wrapper.text()).toContain('items.amount')
    expect(wrapper.text()).toContain('NOT_EMPTY')

    await openSection(wrapper, '字段权限')
    expect(wrapper.text()).toContain('role:buyer')
    expect(wrapper.text()).toContain('role:purchaser')
    expect(wrapper.text()).toContain('submit')
  })

  it('版本化列配置只读取 definition 中的冻结值', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '列表列配置')

    expect(wrapper.text()).toContain('采购名称')
    expect(wrapper.text()).toContain('LIKE')
    expect(wrapper.text()).toContain('DESC')
    expect(wrapper.text()).toContain('view、edit')
  })

  it('没有冻结列配置时明确说明限制，不回退当前列表配置', async () => {
    const noListConfig = { ...definition }
    delete (noListConfig as { listConfig?: unknown }).listConfig
    mockGetFormSnapshotDefinition.mockResolvedValue({
      ...snapshot,
      definition: JSON.stringify(noListConfig),
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '列表列配置')

    expect(wrapper.text()).toContain('该历史版本未保存列表配置，无法展示。')
  })

  it('脚本区展示字段脚本、表单事件、监听脚本和审批人表达式', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '脚本')

    expect(wrapper.text()).toContain('return #获取字段值("title");')
    expect(wrapper.text()).toContain('提交前检查')
    expect(wrapper.text()).toContain('return #获取流程变量("var_ok");')
    expect(wrapper.text()).toContain('return ["2"];')

    await openSection(wrapper, '审批人脚本')
    expect(wrapper.text()).toContain('return ["2"];')
    expect(wrapper.text()).toContain('return 1;')
  })

  it('节点、高级配置、变量和触发器均来自冻结流程版本', async () => {
    const wrapper = await mountViewer()

    await openSection(wrapper, '节点配置')
    expect(wrapper.text()).toContain('部门审批')
    expect(wrapper.text()).toContain('approvalMode')
    expect(wrapper.text()).toContain('assetStartListener')

    await openSection(wrapper, '变量')
    expect(wrapper.text()).toContain('var_ok')
    expect(wrapper.text()).toContain('是否通过')

    await openSection(wrapper, '触发器')
    expect(wrapper.text()).toContain('节点开始前检查')
    expect(wrapper.text()).toContain('节点开始前')
  })

  it('关联流程读取失败只形成可见警告，不丢弃已加载表单快照', async () => {
    mockLoadCandidates.mockRejectedValue(new Error('workflow history unavailable'))
    const wrapper = await mountViewer()

    expect(wrapper.text()).toContain('资产采购申请')
    expect(wrapper.text()).toContain('workflow history unavailable')
  })

  it('只加载 formVersion 匹配的冻结流程，不把当前流程版本当作历史值', async () => {
    mockLoadCandidates.mockResolvedValue({
      items: [
        {
          ...processCandidate,
          version: { ...processCandidate.version, graphVersion: 9, formVersion: '9.9' },
        },
      ],
      failures: [],
    })
    const wrapper = await mountViewer()

    expect(mockLoadGraph).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('没有找到与该表单版本匹配的冻结流程版本')
  })

  it('只读结构不引入保存、发布或恢复冻结定义的回写路径', async () => {
    const source = await import('./PublishedSnapshotViewer.vue?raw')
    expect(source.default).not.toMatch(
      /saveFormConfig|publishFormDef|publishNewFormVersion|updateFormSnapshot/,
    )
  })
})
