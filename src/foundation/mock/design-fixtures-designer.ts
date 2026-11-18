/**
 * design-fixtures 设计器/图谱/目录 fixture 工厂（dev-only，随 mock 模块 tree-shake）。
 *
 * 从 design-fixtures.ts 原样搬移：仅注入数据/状态，不改变接口契约与执行时序；
 * 图谱 payload 中的坐标/锚点注释为设计稿实测记录，随代码一起维护。
 */

import { MOCK_WORKFLOW_NODE_CAPABILITIES } from './workflow-node-capabilities'
import { ok, type DesignMockHandler } from './design-fixtures-shared'

/** 设计节点03/09/12/13 共用的设计密度流程图（13 节点含网关分支；数据形状=真实 ProcessGraph 契约）。 */
function designProcessGraphPayload(): Record<string, unknown> {
  return {
    processKey: 'dr_drill',
    name: '资产采购审批',
    formName: '资产采购申请',
    formDefId: 'seed-def-001',
    formKey: 'dr-drill',
    version: 3,
    contractVersion: 2,
    // 节点13 高级配置弹窗的流程级元数据（只读展示；形状=扩展键，缺省不渲染）
    advancedConfig: {
      startListener: 'assetProcessStartListener',
      completeListener: 'assetProcessCompleteListener',
      notifyTargets: '发起人、当前审批人、流程管理员',
      notifyChannels: ['站内消息', '微信', '飞书', '钉钉'],
      notifyTemplate: 'ASSET_APPROVAL_NOTICE',
      preMode: 'Java Bean / 同步执行',
      preHandler: 'assetPreValidationHandler',
      prePurpose: '用途：预算校验、字段预处理、组织与权限验证',
      preFailure: '失败策略：阻止流程启动并返回校验信息',
      postMode: 'Java Bean / 异步执行',
      postHandler: 'assetPostSyncHandler',
      postPurpose: '用途：业务状态同步、数据回写、事件通知',
      postFailure: '失败策略：记录日志并按配置重试',
    },
    triggers: [
      {
        triggerId: 'node_enter_sign',
        name: '科技负责人会签开始前',
        event: 'NODE_ENTERING',
        nodeKey: 'tech',
        script: 'return true;',
        variables: [],
        branches: [],
        unmatchedDisposition: 'IGNORE',
        errorDisposition: 'IGNORE',
      },
    ],
    elements: [
      { id: 'start', kind: 'node', type: 'START', x: 416, y: 54, config: { name: '开始' } },
      {
        id: 'draft',
        kind: 'node',
        type: 'APPROVAL',
        x: 416,
        y: 145,
        config: {
          name: '起草',
          nodeClass: 'draft',
          approver: JSON.stringify({ type: 'DESIGNATED', value: ['2', '103'] }),
        },
      },
      {
        id: 'dept',
        kind: 'node',
        type: 'APPROVAL',
        x: 416,
        y: 236,
        config: {
          name: '部门负责人审批',
          approver: JSON.stringify({ type: 'DESIGNATED', value: ['2', '103'] }),
        },
      },
      {
        id: 'tech',
        kind: 'node',
        type: 'CONSENSUS',
        x: 416,
        y: 327,
        config: {
          name: '科技负责人会签',
          participant: { type: 'DESIGNATED', value: ['2', '103'] },
          mode: 'RATIO',
          ratio: 75,
          nodeForm: { formKey: 'form_approval_comment' },
          allowedActions: [
            'APPROVE',
            'DISAPPROVE',
            'REJECT',
            'RETURN',
            'TRANSFER',
            'DELEGATE',
            'COMMUNICATE',
            'ADD_SIGN',
          ],
          listeners: [
            {
              phase: 'before',
              label: '节点进入前',
              bean: 'assetApprovalListener',
              note: 'Bean 调用 · 已启用',
            },
            { phase: 'after', label: '审批完成后', note: '同步采购状态 / 发送业务事件' },
          ],
        },
      },
      {
        id: 'gateway',
        kind: 'node',
        type: 'GATEWAY',
        x: 416,
        y: 485,
        config: { name: '分支 / 汇聚' },
      },
      { id: 'risk', kind: 'node', type: 'APPROVAL', x: 211, y: 483, config: { name: '资产核价' } },
      {
        id: 'compliance',
        kind: 'node',
        type: 'APPROVAL',
        x: 211,
        y: 591,
        config: { name: '合规部负责人意见' },
      },
      { id: 'plan', kind: 'node', type: 'APPROVAL', x: 691, y: 254, config: { name: '资产采购' } },
      {
        id: 'branch',
        kind: 'node',
        type: 'APPROVAL',
        x: 828,
        y: 343,
        config: { name: '分公司领导审核' },
      },
      {
        id: 'divide',
        kind: 'node',
        type: 'APPROVAL',
        x: 828,
        y: 451,
        config: { name: '分管领导审批' },
      },
      {
        id: 'finance',
        kind: 'node',
        type: 'APPROVAL',
        x: 828,
        y: 559,
        config: { name: '财务部审核' },
      },
      {
        id: 'sign',
        kind: 'node',
        type: 'APPROVAL',
        x: 828,
        y: 667,
        config: { name: '会签部门意见' },
      },
      { id: 'end', kind: 'node', type: 'END', x: 416, y: 748, config: { name: '结束' } },
      { id: 'e1', kind: 'edge', source: 'start', target: 'draft' },
      { id: 'e2', kind: 'edge', source: 'draft', target: 'dept' },
      { id: 'e3', kind: 'edge', source: 'dept', target: 'tech' },
      { id: 'e4', kind: 'edge', source: 'tech', target: 'gateway' },
      { id: 'e5', kind: 'edge', source: 'tech', target: 'plan' },
      { id: 'e6', kind: 'edge', source: 'tech', target: 'branch' },
      { id: 'e16', kind: 'edge', source: 'tech', target: 'divide' },
      { id: 'e17', kind: 'edge', source: 'tech', target: 'finance' },
      { id: 'e18', kind: 'edge', source: 'tech', target: 'sign' },
      { id: 'e7', kind: 'edge', source: 'gateway', target: 'risk' },
      { id: 'e8', kind: 'edge', source: 'risk', target: 'compliance' },
      // 设计稿回流边：出 tech 左缘中点，经 x=79.5 竖线入 compliance 左缘中点
      {
        id: 'e15',
        kind: 'edge',
        source: 'tech',
        target: 'compliance',
        config: { sourceAnchor: [336, 327], targetAnchor: [131, 591] },
        waypoints: [
          { x: 79.5, y: 327 },
          { x: 79.5, y: 591 },
        ],
      },
      // 设计稿网关扇出：入 plan 底边中点与右列节点左下角（锁定 SVG 端点实测）
      {
        id: 'e9',
        kind: 'edge',
        source: 'gateway',
        target: 'plan',
        config: { sourceAnchor: [438, 485], targetAnchor: [691, 279] },
      },
      {
        id: 'e10',
        kind: 'edge',
        source: 'gateway',
        target: 'branch',
        config: { sourceAnchor: [438, 485], targetAnchor: [748, 368] },
      },
      {
        id: 'e11',
        kind: 'edge',
        source: 'gateway',
        target: 'divide',
        config: { sourceAnchor: [438, 485], targetAnchor: [748, 476] },
      },
      {
        id: 'e12',
        kind: 'edge',
        source: 'gateway',
        target: 'finance',
        config: { sourceAnchor: [438, 485], targetAnchor: [748, 584] },
      },
      {
        id: 'e13',
        kind: 'edge',
        source: 'gateway',
        target: 'sign',
        config: { sourceAnchor: [438, 485], targetAnchor: [748, 692] },
      },
      { id: 'e14', kind: 'edge', source: 'gateway', target: 'end' },
    ],
    canvas: {},
  }
}

/** 流程设计器（节点09/12/13）数据：按 id 读取设计密度流程图；仅视觉测试注入数据。 */
export function processDesignerGraphFixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/workflow/defs/:id': () => ok(designProcessGraphPayload()),
    // 设计稿保留未纳入正式注册表的能力足迹；这些条目在设计夹具中不可拖拽，
    // 正式后端能力清单仍只返回 MOCK_WORKFLOW_NODE_CAPABILITIES。
    'GET /api/workflow/defs/node-capabilities': () =>
      ok(
        [
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'START'),
          {
            type: 'DRAFT',
            displayName: '起草',
            description: '设计参考项',
            category: 'TASK',
            version: 'design-only',
            topology: { minIncoming: 0, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
            configFields: [],
            supports: { design: false, save: false, publish: false, run: false },
          },
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'APPROVAL'),
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'CONSENSUS'),
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'DYNAMIC_PARALLEL'),
          {
            ...MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'CONDITION'),
            displayName: '条件网关',
          },
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'NOTIFICATION'),
          {
            type: 'IOT_COMMAND',
            displayName: 'IoT 指令',
            description: '设计参考项',
            category: 'TASK',
            version: 'design-only',
            topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
            configFields: [],
            supports: { design: false, save: false, publish: false, run: false },
          },
          {
            type: 'AGENT',
            displayName: 'Agent',
            description: '设计参考项',
            category: 'TASK',
            version: 'design-only',
            topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
            configFields: [],
            supports: { design: false, save: false, publish: false, run: false },
          },
          MOCK_WORKFLOW_NODE_CAPABILITIES.find((cap) => cap.type === 'END'),
        ].filter(Boolean),
      ),
  }
}

/**
 * 表单设计器（节点07/11/14）数据：资产采购申请演示 schema 与草稿版本记录。
 * 仅注入数据/状态；页面、组件树与交互路径全部为生产实现。
 */
const DESIGNER_FORM_DEFINITION = JSON.stringify({
  title: '资产采购申请',
  description: '深圳中心 · 采购信息与计划',
  schemaVersion: 1,
  fields: [
    {
      name: 'drill_name',
      label: '演练名称',
      type: 'TEXT',
      required: true,
      length: 200,
      placeholder: '请输入演练名称',
      colSpan: 12,
    },
    {
      name: 'request_no',
      label: '申请编号',
      type: 'TEXT',
      required: false,
      length: 64,
      placeholder: '系统自动生成',
      colSpan: 12,
    },
    {
      name: 'drill_start_time',
      label: '演练开始时间',
      type: 'DATE',
      required: true,
      placeholder: '请选择日期与时间',
      colSpan: 12,
    },
    {
      name: 'drill_end_time',
      label: '演练结束时间',
      type: 'DATE',
      required: true,
      placeholder: '请选择日期与时间',
      colSpan: 12,
    },
    {
      name: 'department_id',
      label: '牵头部门',
      type: 'DEPT',
      required: true,
      placeholder: '选择所属部门',
      colSpan: 12,
    },
    {
      name: 'risk_level',
      label: '风险等级',
      type: 'DICT',
      required: true,
      dictType: 'risk_level',
      placeholder: '选择风险等级',
      colSpan: 12,
    },
    {
      name: 'description',
      label: '演练说明',
      type: 'RICH_TEXT',
      required: false,
      placeholder: '请输入演练范围、执行计划及预期目标',
      colSpan: 24,
    },
    {
      name: 'attachments',
      label: '方案附件',
      type: 'ATTACHMENT',
      required: false,
      placeholder: '点击上传或将文件拖拽到此处',
      colSpan: 24,
    },
    {
      name: 'drill_resources',
      label: '演练资源',
      type: 'TABLE',
      required: false,
      colSpan: 24,
      subFields: [
        { name: 'resource_name', label: '资源名称', type: 'TEXT', required: true },
        { name: 'quantity', label: '数量', type: 'NUMBER', required: false },
        { name: 'owner', label: '负责人', type: 'USER', required: false },
      ],
    },
  ],
})

/** 节点14 草稿版本卡片记录（作者/说明为快照元数据的演示值）。 */
const DESIGNER_FORM_SNAPSHOTS = [
  {
    formVersion: 3,
    versionLabel: '3.3',
    createTime: '2026-09-16 10:32:00',
    status: 'DRAFT',
    author: '陈曦',
    note: '修改采购事项长度，调整审批人规则。',
  },
  {
    formVersion: 2,
    versionLabel: '2.1',
    createTime: '2026-09-16 10:18:00',
    status: 'DRAFT',
    author: '陈曦',
    note: '增加统一监听器和后置状态同步。',
  },
  {
    formVersion: 1,
    versionLabel: '1.4',
    createTime: '2026-09-15 17:40:00',
    status: 'DRAFT',
    author: '林悦',
    note: '新增合约审批侧枝及条件连线。',
  },
  {
    formVersion: 0,
    versionLabel: '3.2',
    createTime: '2026-09-14 09:20:00',
    status: 'PUBLISHED',
    author: '陈曦',
    note: '发布资产采购表单和关联流程。',
  },
]

export function designerFormFixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/form/def/:id': () =>
      ok({
        id: 'seed-def-001',
        formKey: 'asset-purchase',
        name: '资产采购申请',
        status: 'DRAFT',
        formVersion: 3,
        versionLabel: '3.3',
      }),
    'GET /api/form/def/:id/definition': () => ok(DESIGNER_FORM_DEFINITION),
  }
}

export function designerHistoryFixtures(): Record<string, DesignMockHandler> {
  return {
    ...designerFormFixtures(),
    'GET /api/form/def/:id/snapshots': () => ok(DESIGNER_FORM_SNAPSHOTS),
  }
}

/**
 * 任务详情流程图（节点10/19）数据：世界坐标=设计19 画布相对布局（画布原点左上），
 * 配合 ProcessGraphView 锚定适配（fitMargins left137/top27/right243/bottom15、ratio≤1）按设计位渲染。
 * 仅视觉测试注入数据；数据形状=真实 ProcessGraph 契约。
 */
export function taskGraphPayload(): Record<string, unknown> {
  return {
    processKey: 'dr_drill',
    name: '灾备演练申请',
    formKey: 'dr-drill',
    version: 3,
    contractVersion: 2,
    elements: [
      // 节点19 画布实测：world = 设计PNG坐标 - (258,718)；设计19 SVG 边线端点同系换算。
      { id: 'start', kind: 'node', type: 'START', x: 419, y: 48, config: { name: '开始节点' } },
      { id: 'draft', kind: 'node', type: 'APPROVAL', x: 419, y: 139, config: { name: '起草节点' } },
      {
        id: 'dept',
        kind: 'node',
        type: 'APPROVAL',
        x: 419,
        y: 230,
        config: { name: '部门负责人审批' },
      },
      {
        id: 'tech',
        kind: 'node',
        type: 'APPROVAL',
        x: 419,
        y: 321,
        config: { name: '科技运营负责人意见' },
      },
      {
        id: 'gateway',
        kind: 'node',
        type: 'GATEWAY',
        x: 419,
        y: 479,
        config: { name: '分支汇聚' },
      },
      { id: 'risk', kind: 'node', type: 'APPROVAL', x: 214, y: 477, config: { name: '风险核查' } },
      {
        id: 'compliance',
        kind: 'node',
        type: 'APPROVAL',
        x: 214,
        y: 585,
        config: { name: '合规负责人意见' },
      },
      {
        id: 'plan',
        kind: 'node',
        type: 'APPROVAL',
        x: 694,
        y: 248,
        config: { name: '灾备方案审核' },
      },
      {
        id: 'branch',
        kind: 'node',
        type: 'APPROVAL',
        x: 831,
        y: 337,
        config: { name: '分公司领导审核' },
      },
      {
        id: 'divide',
        kind: 'node',
        type: 'APPROVAL',
        x: 831,
        y: 445,
        config: { name: '分管领导审批' },
      },
      {
        id: 'finance',
        kind: 'node',
        type: 'APPROVAL',
        x: 831,
        y: 553,
        config: { name: '财务部审核' },
      },
      {
        id: 'sign',
        kind: 'node',
        type: 'APPROVAL',
        x: 831,
        y: 661,
        config: { name: '科技负责人会签' },
      },
      { id: 'end', kind: 'node', type: 'END', x: 419, y: 742, config: { name: '结束节点' } },
      // 真实流程尾部（设计20 右栏『后一节点』）：仅逻辑后继；边不渲染（设计19 无会签出线）。
      {
        id: 'gm',
        kind: 'node',
        type: 'APPROVAL',
        x: 830,
        y: 990,
        config: { name: '总公司科技部审批' },
      },
      { id: 'e1', kind: 'edge', source: 'start', target: 'draft' },
      { id: 'e2', kind: 'edge', source: 'draft', target: 'dept' },
      { id: 'e3', kind: 'edge', source: 'dept', target: 'tech' },
      { id: 'e4', kind: 'edge', source: 'tech', target: 'gateway' },
      { id: 'e5', kind: 'edge', source: 'tech', target: 'plan' },
      { id: 'e6', kind: 'edge', source: 'tech', target: 'branch' },
      { id: 'e16', kind: 'edge', source: 'tech', target: 'divide' },
      { id: 'e17', kind: 'edge', source: 'tech', target: 'finance' },
      { id: 'e18', kind: 'edge', source: 'tech', target: 'sign' },
      { id: 'e7', kind: 'edge', source: 'gateway', target: 'risk' },
      { id: 'e19', kind: 'edge', source: 'risk', target: 'compliance' },
      {
        id: 'e20',
        kind: 'edge',
        source: 'compliance',
        target: 'tech',
        waypoints: [
          { x: 83, y: 585 },
          { x: 83, y: 321 },
        ],
      },
      {
        id: 'e9',
        kind: 'edge',
        source: 'gateway',
        target: 'plan',
        waypoints: [{ x: 694, y: 273 }],
      },
      {
        id: 'e10',
        kind: 'edge',
        source: 'gateway',
        target: 'branch',
        waypoints: [{ x: 751, y: 362 }],
      },
      {
        id: 'e11',
        kind: 'edge',
        source: 'gateway',
        target: 'divide',
        waypoints: [{ x: 751, y: 470 }],
      },
      {
        id: 'e12',
        kind: 'edge',
        source: 'gateway',
        target: 'finance',
        waypoints: [{ x: 751, y: 578 }],
      },
      {
        id: 'e13',
        kind: 'edge',
        source: 'gateway',
        target: 'sign',
        waypoints: [{ x: 751, y: 686 }],
      },
      { id: 'e14', kind: 'edge', source: 'gateway', target: 'end' },
      { id: 'e15', kind: 'edge', source: 'sign', target: 'gm', config: { visible: false } },
    ],
    canvas: {},
  }
}

/** 设计演示目录条目（节点01 收藏与节点21—26 共用）；语料与设计演示内容一致，仅视觉测试注入。 */
export function catalogItemRows(): Array<Record<string, unknown>> {
  return [
    {
      itemKey: 'DR_DRILL',
      name: '灾备演练申请',
      formKey: 'dr-drill',
      categoryId: 103,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '统一组织灾备切换演练，支持多部门审批、并行会签与回流复核。',
      version: 'v3.2',
      lastUsedAt: '09-16',
    },
    {
      itemKey: 'ASSET_PURCHASE',
      name: '资产采购申请',
      formKey: 'asset-purchase',
      categoryId: 101,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '提交资产需求与采购预算，按金额和归口部门流转审批。',
      version: 'v3.3',
      lastUsedAt: '09-14',
    },
    {
      itemKey: 'PURCHASE_PAY',
      name: '采购付款申请',
      formKey: 'purchase-pay',
      categoryId: 102,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '提交采购付款信息与合同附件，完成财务复核与付款审批。',
      version: 'v2.8',
      lastUsedAt: '09-15',
    },
    {
      itemKey: 'IOT_ACCESS',
      name: 'IoT 设备接入',
      formKey: 'iot-access',
      categoryId: 104,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '申请设备接入、通信参数及设备权限，联动 IoT 指令节点。',
      version: 'v1.4',
      lastUsedAt: '09-12',
    },
    {
      itemKey: 'KB_PERMISSION',
      name: '知识库权限申请',
      formKey: 'kb-permission',
      categoryId: 105,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '申请知识库及 Agent 数据访问范围，由责任人确认授权。',
      version: 'v1.1',
      lastUsedAt: '09-10',
    },
    {
      itemKey: 'TRAVEL_EXPENSE',
      name: '差旅报销申请',
      formKey: 'travel-expense',
      categoryId: 101,
      status: 'PUBLISHED',
      formPublished: true,
      bindingActive: true,
      description: '填写差旅费用、行程和票据，完成部门及财务审批。',
      version: 'v4.0',
      lastUsedAt: '09-08',
    },
  ]
}

/** 流程中心 fixture：五个设计分类；activeIndex=null 表示「全部」视图（节点21）。 */
export function catalogFixtures(activeIndex: number | null): Record<string, DesignMockHandler> {
  const categories = [
    { id: 101, name: '行政办公', sortNo: 1 },
    { id: 102, name: '财务管理', sortNo: 2 },
    { id: 103, name: 'IT 运维', sortNo: 3 },
    { id: 104, name: '设备管理', sortNo: 4 },
    { id: 105, name: '平台权限', sortNo: 5 },
  ]
  const itemRows = catalogItemRows()
  const active = activeIndex === null ? null : categories[activeIndex]
  const visibleItems = active ? itemRows.filter((it) => it.categoryId === active.id) : itemRows
  const counts: Record<string, number> = {}
  for (const c of categories) {
    counts[String(c.id)] = itemRows.filter((it) => it.categoryId === c.id).length
  }
  return {
    'GET /api/workflow/catalog/categories': () => ok(categories),
    'GET /api/workflow/catalog/category-counts': () => ok(counts),
    // 视图消费 BackendPageResult 形状（adaptPage 读取 records/total），需回后端分页对象。
    'GET /api/workflow/catalog/items': () =>
      ok({ records: visibleItems, total: visibleItems.length, pageNum: 1, pageSize: 60 }),
  }
}

/**
 * 设计节点10：全屏流程图页（/workflow/task/:taskId/graph）。
 * 任务数据与节点03 同源；设计10 SVG 与设计19 同构（整图平移）：
 * world10 = world19 + (0,3)，边 waypoints 同步平移，保证连线相对几何一致。
 */
export function design10GraphPayload(): Record<string, unknown> {
  const base = taskGraphPayload()
  const elements = base.elements as Array<Record<string, unknown>>
  const move = (id: string, x: number, y: number) => {
    const el = elements.find((e) => e.id === id)
    if (el) {
      el.x = x
      el.y = y
    }
  }
  move('start', 419, 51)
  move('draft', 419, 142)
  move('dept', 419, 233)
  move('tech', 419, 324)
  move('gateway', 419, 482)
  move('risk', 214, 480)
  move('compliance', 214, 588)
  move('plan', 694, 251)
  move('branch', 831, 340)
  move('divide', 831, 448)
  move('finance', 831, 556)
  move('sign', 831, 664)
  move('end', 419, 745)
  move('gm', 830, 993)
  for (const el of elements) {
    if (el.kind === 'edge' && Array.isArray(el.waypoints)) {
      for (const waypoint of el.waypoints as Array<{ x: number; y: number }>) {
        waypoint.y += 3
      }
    }
  }
  return base
}
