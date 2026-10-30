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
  props: ['modelValue', 'title', 'loading', 'error', 'showFooter', 'width'],
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
    .findAll('.snapshot-tabs__item')
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

  it('按表单版本读取表单与关系冻结流程，并在全屏外壳页签中给出完整身份', async () => {
    const wrapper = await mountViewer()

    expect(mockGetFormSnapshotDefinition).toHaveBeenCalledWith('form-1', 5)
    expect(mockLoadCandidates).toHaveBeenCalledWith('asset-purchase')
    expect(mockLoadGraph).toHaveBeenCalledWith(17, 4)
    // 顶条：发布快照 + 表单名 + 版本
    expect(wrapper.text()).toContain('发布快照')
    expect(wrapper.text()).toContain('资产采购申请')
    expect(wrapper.text()).toContain('v3.2')
    // 流程设计页签：左列冻结流程版本 + 中列选中流程元信息
    await openSection(wrapper, '流程设计')
    expect(wrapper.text()).toContain('资产采购审批')
    expect(wrapper.text()).toContain('asset_purchase · v4')
    // 字段清单页签：基础信息承接原始冻结定义
    await openSection(wrapper, '字段清单')
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

  it('表单设计右属性外壳展示冻结字段属性并随点选切换', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '表单设计')

    const props = wrapper.find('.snapshot-side--props')
    expect(props.exists()).toBe(true)
    // 默认选中第一个字段：TEXT 的冻结配置以只读控件表面展示（执行提示14）
    const inputs = props.findAll('.snapshot-props-surface__input')
    // 审查23 501:19159：数据与规则前三值（标识/类型/最大长度）承接为只读输入框
    expect(inputs).toHaveLength(8)
    expect((inputs[0].element as HTMLInputElement).value).toBe('采购名称')
    expect((inputs[5].element as HTMLInputElement).value).toBe('title')
    expect((inputs[6].element as HTMLInputElement).value).toBe('TEXT')
    expect((inputs[7].element as HTMLInputElement).value).toBe('80')

    // 点选 TABLE 字段：子字段数/行配置切换显示
    const cells = wrapper.findAll('.snapshot-design__cell')
    expect(cells).toHaveLength(2)
    await cells[1].trigger('click')
    expect(
      (props.findAll('.snapshot-props-surface__input')[0].element as HTMLInputElement).value,
    ).toBe('采购明细')
    expect(
      (props.findAll('.snapshot-props-surface__input')[6].element as HTMLInputElement).value,
    ).toBe('TABLE')
    // 冻结字段属性面板不提供保存/编辑入口（「查看」为只读详情）
    const saving = wrapper
      .find('.snapshot-side--props')
      .findAll('button')
      .filter((b) => /保存|恢复|发布/.test(b.text()))
    expect(saving).toHaveLength(0)
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
    await openSection(wrapper, '字段清单')

    expect(wrapper.text()).toContain('title')
    expect(wrapper.text()).toContain('items.amount')
    expect(wrapper.text()).toContain('采购明细')
    expect(wrapper.text()).toContain('"subFields"')
  })

  it('校验、显隐和字段/动作权限来自快照 definition', async () => {
    const wrapper = await mountViewer()
    // 校验/显隐归入字段清单页签
    await openSection(wrapper, '字段清单')
    expect(wrapper.text()).toContain('最小长度')
    expect(wrapper.text()).toContain('正则约束')
    expect(wrapper.text()).toContain('需以 A 开头')
    expect(wrapper.text()).toContain('items.amount')
    expect(wrapper.text()).toContain('NOT_EMPTY')

    // 权限承接在字段清单页签的真实语义入口
    expect(wrapper.text()).toContain('role:buyer')
    expect(wrapper.text()).toContain('role:purchaser')
    expect(wrapper.text()).toContain('submit')
  })

  it('版本化列配置只读取 definition 中的冻结值（字段清单语义入口）', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '字段清单')

    expect(wrapper.text()).toContain('采购名称')
    expect(wrapper.text()).toContain('LIKE')
    expect(wrapper.text()).toContain('DESC')
    expect(wrapper.text()).toContain('view、edit')
  })

  it('没有冻结列配置/编号规则时明确说明限制，不回退当前数据', async () => {
    const noListConfig = { ...definition }
    delete (noListConfig as { listConfig?: unknown }).listConfig
    mockGetFormSnapshotDefinition.mockResolvedValue({
      ...snapshot,
      definition: JSON.stringify(noListConfig),
    })
    const wrapper = await mountViewer()
    // 列配置在字段清单承接（同布局限制说明）；编号设置承接冻结编号规则（无数据 → 空态）
    await openSection(wrapper, '字段清单')
    expect(wrapper.text()).toContain('该历史版本未保存列表配置，无法展示。')
    await openSection(wrapper, '编号设置')
    expect(wrapper.text()).toContain('该版本未冻结编号规则，无法展示。')
  })

  it('脚本区展示字段脚本、表单事件、监听脚本和审批人表达式', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '字段清单')

    expect(wrapper.text()).toContain('return #获取字段值("title");')
    expect(wrapper.text()).toContain('提交前检查')
    expect(wrapper.text()).toContain('return #获取流程变量("var_ok");')
    expect(wrapper.text()).toContain('return ["2"];')

    await openSection(wrapper, '流程设置')
    // 审查23 S14-E：表单事件监听表与冻结触发器独立投影；触发器脚本经「查看」呈现
    await wrapper.findAll('.snapshot-settings__nav button')[1].trigger('click') // 监听
    expect(wrapper.find('.snapshot-listener-table').text()).toContain('提交前检查')
    expect(wrapper.find('.snapshot-listener-table').text()).not.toContain('节点开始前检查')
    await wrapper.find('[data-testid="snapshot-trigger-open"]').trigger('click')
    const triggerView = wrapper.find('[data-testid="snapshot-trigger-script-view"]')
    expect(triggerView.exists()).toBe(true)
    await triggerView.trigger('click')
    expect(wrapper.text()).toContain('return 1;')
    await wrapper.findAll('.snapshot-settings__nav button')[3].trigger('click') // 审批人脚本
    expect(wrapper.text()).toContain('return ["2"];')
  })

  it('节点、高级配置、变量和触发器均来自冻结流程版本', async () => {
    const wrapper = await mountViewer()

    await openSection(wrapper, '流程设计')
    expect(wrapper.text()).toContain('部门审批')
    expect(wrapper.text()).toContain('approvalMode')
    expect(wrapper.text()).toContain('assetStartListener')

    await openSection(wrapper, '流程设置')
    // 审查23 S14-E：左导航分 通知/监听/变量/审批人脚本 分支
    const navButtons = wrapper.findAll('.snapshot-settings__nav button')
    await navButtons[2].trigger('click') // 变量
    expect(wrapper.text()).toContain('var_ok')
    expect(wrapper.text()).toContain('是否通过')
    await navButtons[1].trigger('click') // 监听
    await wrapper.find('[data-testid="snapshot-trigger-open"]').trigger('click')
    expect(wrapper.text()).toContain('节点开始前检查')
    expect(wrapper.text()).toContain('节点开始前')
  })

  it('Q24 冻结 TABLE 从现有只读属性进入 1100 明细列窗，列值取同一冻结 schema', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '表单设计')
    const cells = wrapper.findAll('.snapshot-design__cell')
    await cells[1].trigger('click')

    const props = wrapper.find('.snapshot-side--props')
    const detailRow = props
      .findAll('.snapshot-props-surface__rule')
      .find((row) => row.text().includes('明细列'))
    expect(detailRow).toBeTruthy()
    expect(detailRow!.text()).toContain('1 列')

    await detailRow!.find('button').trigger('click')
    const table = wrapper.find('[data-testid="snapshot-detail-columns"]')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('金额')
    expect(table.text()).toContain('数字')
    expect(table.text()).toContain('amount')
    // 冻结子列没有宽度配置：明确未配置，不填充演示值
    expect(table.text()).toContain('未配置')
    expect(table.text()).toContain('是')
    expect(table.text()).not.toContain('device_name')
  })

  it('Q28 冻结触发器只投影真实 trigger 记录，展示编排方式与判断脚本', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设置')
    await wrapper.findAll('.snapshot-settings__nav button')[1].trigger('click')
    // 509:19394：触发器 1100 内容宿主到遮罩只读弹窗，页内入口卡片打开
    await wrapper.find('[data-testid="snapshot-trigger-open"]').trigger('click')

    const table = wrapper.find('[data-testid="snapshot-trigger-table"]')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('节点开始前检查')
    expect(table.text()).toContain('节点开始前')
    expect(table.text()).toContain('部门审批')
    // 表单事件监听不得混入触发器表
    expect(table.text()).not.toContain('提交前检查')

    const detail = wrapper.find('[data-testid="snapshot-trigger-detail"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('编排方式')
    expect(detail.text()).toContain('判断脚本')
    const inputs = detail.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('未配置')
    expect((inputs[1].element as HTMLInputElement).value).toBe('return 1;')
  })

  it('Q30 下拉/日期/部门/上传只读专属项读取冻结值，未配置明确显示', async () => {
    const typeDefinition = {
      title: '类型专属属性',
      fields: [
        {
          name: 'kind',
          label: '类型',
          type: 'DICT',
          source: 'custom',
          options: [
            { key: 'desktop', value: '桌面演练' },
            { key: 'live', value: '实战演练' },
          ],
        },
        { name: 'when', label: '时间', type: 'DATE', format: 'datetime' },
        { name: 'dept', label: '部门', type: 'DEPT' },
        { name: 'files', label: '附件', type: 'ATTACHMENT' },
      ],
    }
    mockGetFormSnapshotDefinition.mockResolvedValue({
      ...snapshot,
      definition: JSON.stringify(typeDefinition),
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '表单设计')

    const cells = wrapper.findAll('.snapshot-design__cell')
    const propRow = (label: string) =>
      wrapper
        .find('.snapshot-side--props')
        .findAll('.snapshot-props-surface__rule')
        .find((row) => row.find('.snapshot-props-surface__rule-label').text() === label)

    await cells[0].trigger('click')
    expect(propRow('选项来源')?.text()).toContain('自定义')
    expect(propRow('选项')?.text()).toContain('桌面演练 / 实战演练')
    expect(propRow('选择方式')?.text()).toContain('单选')
    expect(propRow('默认值')?.text()).toContain('未配置')

    await cells[1].trigger('click')
    expect(propRow('日期格式')?.text()).toContain('YYYY-MM-DD HH:mm:ss')
    expect(propRow('默认值')?.text()).toContain('未配置')

    await cells[2].trigger('click')
    expect(propRow('选择范围')?.text()).toContain('部门，单选')

    await cells[3].trigger('click')
    expect(propRow('文件类型')?.text()).toContain('未配置')
    expect(propRow('文件大小')?.text()).toContain('未配置')
    expect(propRow('数量上限')?.text()).toContain('未配置')
    const propsText = wrapper.find('.snapshot-side--props').text()
    expect(propsText).not.toMatch(/pdf|20\s?MB|20 ?MB/)
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
    // 流程空态在流程设计页签左列承接（同布局空态，不回退当前数据）
    await openSection(wrapper, '流程设计')
    expect(wrapper.text()).toContain('没有找到与该表单版本匹配的冻结流程版本')
  })

  it('Q31 冻结审批节点按真实 config 展示审批来源/审批人/条件/意见表单/字段权限/高级脚本', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    expect(node).toBeTruthy()
    await node!.trigger('click')

    const valueOf = (key: string) =>
      (wrapper.find(`[data-testid="node-config-${key}"]`).find('input').element as HTMLInputElement)
        .value
    expect(valueOf('participant-source')).toBe('表达式（EXPRESSION）')
    expect(valueOf('participant-value')).toBe('return ["2"];')
    expect(valueOf('condition')).toBe('未配置')
    expect(valueOf('opinion-form')).toBe('未配置')
    expect(valueOf('node-form')).toBe('未配置')
    expect(valueOf('field-permissions')).toBe('未配置')
    expect(valueOf('advanced-scripts')).toBe('已配置 · 1 处')
    expect(valueOf('before-script')).toBe('已绑定 · 1 条')
    expect(valueOf('advanced-config')).toContain('已配置')
    // 共同五属性仍取真实节点值，并按 295×32 只读框承接
    const commonValues = wrapper
      .findAll('.snapshot-props-surface__input')
      .slice(0, 5)
      .map((input) => (input.element as HTMLInputElement).value)
    expect(commonValues.slice(0, 3)).toEqual(['部门审批', 'APPROVAL', 'approve'])
    expect(
      wrapper
        .findAll('.snapshot-props-surface__input')
        .every((input) => input.attributes('readonly') !== undefined),
    ).toBe(true)
  })

  it('Q31 无节点配置的冻结事件节点明确显示未配置，不造审批属性', async () => {
    mockLoadGraph.mockResolvedValue({
      ...processGraph,
      elements: [
        ...processGraph.elements,
        { id: 'end', kind: 'node', type: 'END', config: {}, x: 300, y: 360 },
      ],
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const end = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('end'))
    expect(end).toBeTruthy()
    await end!.trigger('click')

    expect(
      (wrapper.find('[data-testid="node-config-node-config"] input').element as HTMLInputElement)
        .value,
    ).toBe('未配置')
    expect(wrapper.find('[data-testid="node-config-participant-source"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="node-config-condition"]').exists()).toBe(false)
  })

  it('Q25 冻结节点字段三态进入 1100 只读权限面；无字段权限节点显示未配置且不凑空表', async () => {
    mockLoadGraph.mockResolvedValue({
      ...processGraph,
      elements: processGraph.elements.map((element) =>
        element.id === 'approve'
          ? {
              ...element,
              config: {
                ...element.config,
                fieldStates: { title: { required: true, editable: false, hidden: false } },
              },
            }
          : element,
      ),
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await node!.trigger('click')

    const row = wrapper.find('[data-testid="node-config-field-permissions"]')
    expect((row.find('input').element as HTMLInputElement).value).toBe('1 个字段')
    await row.find('button').trigger('click')

    const dialogs = wrapper.findAllComponents(detailDialogStub)
    const dialog = dialogs.find((candidate) => candidate.props('title') === '节点字段权限')
    expect(dialog).toBeTruthy()
    expect(dialog!.props('width')).toBe('1100px')
    const table = wrapper.find('[data-testid="snapshot-node-field-states"]')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('title')
    expect(table.text()).toContain('是')
    expect(table.text()).toContain('否')
  })

  it('Q25 无字段权限的冻结审批节点不显示查看入口，明确未配置', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await node!.trigger('click')

    const row = wrapper.find('[data-testid="node-config-field-permissions"]')
    expect((row.find('input').element as HTMLInputElement).value).toBe('未配置')
    expect(row.find('button').exists()).toBe(false)
  })

  it('Q26 冻结节点高级/操作配置进入 1000 只读面，操作与监听器取真实值', async () => {
    mockLoadGraph.mockResolvedValue({
      ...processGraph,
      elements: processGraph.elements.map((element) =>
        element.id === 'approve'
          ? {
              ...element,
              config: {
                ...element.config,
                allowedActions: ['APPROVE', 'REJECT'],
                returnTargets: ['start'],
              },
            }
          : element,
      ),
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await node!.trigger('click')

    const row = wrapper.find('[data-testid="node-config-advanced-config"]')
    expect((row.find('input').element as HTMLInputElement).value).toContain('已配置')
    await row.find('button').trigger('click')

    const dialogs = wrapper.findAllComponents(detailDialogStub)
    const dialog = dialogs.find((candidate) => candidate.props('title') === '节点高级与操作配置')
    expect(dialog).toBeTruthy()
    expect(dialog!.props('width')).toBe('1000px')
    const content = wrapper.find('[data-testid="snapshot-node-advanced"]')
    expect(content.exists()).toBe(true)
    expect(content.text()).toContain('通过')
    expect(content.text()).toContain('驳回')
    expect(content.text()).toContain('start')
    expect(content.text()).toContain('审批完成监听')
    expect(content.text()).toContain('approvalMode')
  })

  it('Q20 节点开始前绑定合并到既有 1200 只读代码窗；无节点绑定不拿全局监听冒充', async () => {
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await node!.trigger('click')

    const row = wrapper.find('[data-testid="node-config-before-script"]')
    expect((row.find('input').element as HTMLInputElement).value).toBe('已绑定 · 1 条')
    await row.find('button').trigger('click')
    const vm = wrapper.vm as unknown as {
      scriptDetailMode: string
      scriptDetailCode: string
      scriptDetailVisible: boolean
    }
    expect(vm.scriptDetailVisible).toBe(true)
    expect(vm.scriptDetailMode).toBe('code')
    expect(vm.scriptDetailCode).toContain('return 1;')
    expect(vm.scriptDetailCode).toContain('节点开始前')
    const codeDialog = wrapper
      .findAllComponents(detailDialogStub)
      .find((candidate) => candidate.props('title') === '节点开始前脚本')
    expect(codeDialog!.props('width')).toBe('1200px')

    // 只有全局流程发起监听：该节点明确未配置，且没有查看入口
    mockLoadGraph.mockResolvedValue({
      ...processGraph,
      triggers: [
        {
          triggerId: 'global_start',
          name: '流程发起标记',
          enabled: true,
          event: 'PROCESS_START',
          nodeKey: null,
          script: '设置流程变量("x", 1)',
        },
      ],
    })
    const second = await mountViewer()
    await openSection(second, '流程设计')
    const secondNode = second
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await secondNode!.trigger('click')
    const secondRow = second.find('[data-testid="node-config-before-script"]')
    expect((secondRow.find('input').element as HTMLInputElement).value).toBe('未配置')
    expect(secondRow.find('button').exists()).toBe(false)
  })

  it('Q20 冻结 NODE_BEFORE 记录同样按 nodeKey 绑定所选节点', async () => {
    mockLoadGraph.mockResolvedValue({
      ...processGraph,
      triggers: [
        {
          triggerId: 'before_node',
          name: '节点前置脚本',
          enabled: true,
          event: 'NODE_BEFORE',
          nodeKey: 'approve',
          script: 'return true;',
        },
      ],
    })
    const wrapper = await mountViewer()
    await openSection(wrapper, '流程设计')
    const node = wrapper
      .findAll('.snapshot-frozen-graph__node')
      .find((candidate) => candidate.text().includes('部门审批'))
    await node!.trigger('click')

    const row = wrapper.find('[data-testid="node-config-before-script"]')
    expect((row.find('input').element as HTMLInputElement).value).toBe('已绑定 · 1 条')
    await row.find('button').trigger('click')
    const vm = wrapper.vm as unknown as { scriptDetailCode: string }
    expect(vm.scriptDetailCode).toContain('return true;')
  })

  it('只读结构不引入保存、发布或恢复冻结定义的回写路径', async () => {
    const source = await import('./PublishedSnapshotViewer.vue?raw')
    expect(source.default).not.toMatch(
      /saveFormConfig|publishFormDef|publishNewFormVersion|updateFormSnapshot/,
    )
  })
})
