/**
 * P53 设计还原测试专用 fixture 覆盖层（dev-only，随 mock 模块 tree-shake）。
 *
 * 仅用于 DESIGN_FIDELITY 视觉比较：把页面内容密度/状态固定到设计节点形态。
 * 激活通道：capture 脚本在应用启动前经 addInitScript 把 fixture id 写入
 * sessionStorage('sw.design-fixture-id')；dispatchMock 命中同 KEY 覆盖时优先返回。
 * 生产构建不加载 mock 模块 ⇒ 本文件不进产物；不修改任何业务语义与真实数据。
 */

import { mockRegistrations } from './handlers'
import { MOCK_SESSION_DATA } from './seeds'
import { MOCK_WORKFLOW_NODE_CAPABILITIES } from './workflow-node-capabilities'
import { activeDesignFixtureFlag } from '../design-fixture-flag'

type ApiResponseLike = { code: number; message: string; data: unknown }

export type DesignMockHandler = (
  params: Record<string, string>,
  query: Record<string, string>,
  body: unknown,
) => ApiResponseLike | Promise<ApiResponseLike>

/** 读取当前激活的设计 fixture id（dev+mock 模块内才可能被调用）。 */
export function activeDesignFixtureId(): string | null {
  return activeDesignFixtureFlag()
}

const ok = (data: unknown): ApiResponseLike => ({ code: 0, message: 'ok', data })

function historyRow(partial: Record<string, unknown>): Record<string, unknown> {
  historyRowSeed += 1
  return {
    taskId: 'fx-task-' + String(historyRowSeed),
    assignee: '',
    approvalResult: 'APPROVED',
    ...partial,
  }
}
let historyRowSeed = 0

/** 设计壳层（顶栏/侧栏）fixture 菜单：复用原叶子节点注册路由，仅重组分组与标题。 */
function designMenuTree(): unknown {
  const menus = mockRegistrations.find(
    (r) => r.method === 'GET' && r.pattern === '/api/system/auth/menus',
  )
  const original = (menus ? menus.handler({}, {}, undefined) : { code: 0, data: [] }) as {
    code: number
    data: Array<Record<string, unknown>>
  }
  const flat: Array<Record<string, unknown>> = []
  const walk = (nodes: Array<Record<string, unknown>>) => {
    for (const n of nodes) {
      if (n.menuType !== 2) flat.push(n)
      if (Array.isArray(n.children)) walk(n.children as Array<Record<string, unknown>>)
    }
  }
  walk(original.data ?? [])
  const byPath = new Map(flat.map((n) => [String(n.path), n]))
  const leaf = (path: string, title: string, icon?: string, sort = 1) => {
    const base = byPath.get(path)
    if (base)
      return {
        ...base,
        title,
        parentId: null,
        icon: icon ?? base.icon,
        sort,
        children: undefined,
        // name 脱离 NODE_TITLE_KEYS 语义键映射，保证设计标题不被 i18n 覆盖
        name: 'design:' + path,
      }
    // 静态注册路由（如 workflow/catalog-admin）不在下发树中：合成最小叶子，路由仍为真实注册路径。
    return {
      id: 'design-leaf-' + path,
      parentId: null,
      name: 'design-leaf-' + path,
      title,
      path,
      component: null,
      icon,
      sort,
      menuType: 1,
    }
  }
  const group = (
    id: string,
    title: string,
    icon: string,
    children: Array<Record<string, unknown> | null>,
    sort = 1,
    topbar?: number,
  ) => ({
    id,
    parentId: null,
    name: 'design-group-' + id,
    title,
    path: 'design-' + id,
    component: null,
    icon,
    sort,
    menuType: 0,
    topbar,
    children: children.filter(Boolean),
  })
  // 设计 IA（节点01/02/04/21/28/29）：顶栏与侧栏是同一份菜单数据的两种投影——
  // 节点带 topbar 序号时进入顶栏主导航（hidden 项仅投影顶栏、不出现在侧栏）；
  // 区域归属仍由 foundation/area 按真实页面路径过滤，不引入第二事实源。
  // 子项 sort 按设计顺序重排（原真实 sort 会导致渲染顺序偏离设计节点）。
  return [
    group(
      '9901',
      '流程协同',
      'design:process',
      [
        { ...leaf('workflow/catalog', '流程中心', undefined, 1), topbar: 1 },
        leaf('workflow/todo', '我的待办', undefined, 2),
        leaf('workflow/my-instances', '我发起的', undefined, 3),
        leaf('workflow/my-cc', '抄送我的', undefined, 4),
      ],
      1,
    ),
    // 顶栏铃铛可见性依赖菜单树含收件箱入口；hidden 使其不进侧栏。
    { ...leaf('notify/inbox', '收件箱'), hidden: true },
    // 顶栏快捷投影（真实门户可达页；hidden = 仅顶栏，不重复出现在侧栏）。
    { ...leaf('portal', '我的门户'), hidden: true, topbar: 2, topbarArea: 'portal' },
    { ...leaf('form/form-def-list', '应用中心'), hidden: true, topbar: 4, topbarArea: 'portal' },
    { ...leaf('workflow/analytics', '数据中心'), hidden: true, topbar: 5, topbarArea: 'portal' },
    {
      ...leaf('agent/conversations/list', '智能助手'),
      hidden: true,
      topbar: 6,
      topbarArea: 'portal',
    },
    { ...leaf('workflow/my-processed', '已办记录'), hidden: true },
    { ...leaf('workflow/my-drafts', '我的草稿'), hidden: true },
    group(
      '9902',
      '业务配置',
      'Tickets',
      [
        leaf('workflow/catalog-admin', '事项管理', undefined, 1),
        { ...leaf('form/form-def-list', '表单管理', undefined, 2), topbar: 1 },
        { ...leaf('workflow/defs', '流程管理', undefined, 3), topbar: 2 },
        leaf('notify/template', '通知管理', undefined, 4),
      ],
      2,
    ),
    group(
      '9903',
      '平台能力',
      'Cpu',
      [
        leaf('agent/graph-def', 'Agent 编排', undefined, 1),
        leaf('agent/model', 'IoT 设备', undefined, 2),
        leaf('job/list', '定时任务', undefined, 3),
      ],
      3,
    ),
    group(
      '9904',
      '系统管理',
      'Setting',
      [
        leaf('system/user', '用户与组织', undefined, 1),
        leaf('system/role', '角色权限', undefined, 2),
        leaf('system/dept', '菜单管理', undefined, 3),
        leaf('system/dict', '数据字典', undefined, 4),
      ],
      4,
    ),
    { ...leaf('workflow/catalog-admin', '应用管理'), hidden: true, topbar: 3, topbarArea: 'admin' },
    { ...leaf('workflow/templates', '门户管理'), hidden: true, topbar: 4, topbarArea: 'admin' },
    { ...leaf('system/user', '系统管理'), hidden: true, topbar: 5, topbarArea: 'admin' },
    { ...leaf('workflow/monitor', '运行监控'), hidden: true, topbar: 6, topbarArea: 'admin' },
    // Portal cards use the same real routes but remain hidden from the shell sidebar.
    { ...leaf('iot', '设备中心'), hidden: true },
    { ...leaf('notify/inbox', '通知中心'), hidden: true },
  ]
}

/** 壳层 fixture：设计菜单树 + 会话显示名 + 零未读。 */
function shellFixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/system/auth/menus': () => ok(designMenuTree()),
    'GET /api/system/auth/me': () =>
      ok({ ...MOCK_SESSION_DATA, user: { ...MOCK_SESSION_DATA.user, displayName: '陈曦' } }),
    'GET /api/notify/inbox/unread-count': () => ok(0),
  }
}

/** 节点29 管理端流程定义演示数据；仅用于锁定参考帧的数据密度。 */
function adminDefsFixtures(): Record<string, DesignMockHandler> {
  const records = [
    {
      id: 101,
      processKey: 'dr_drill',
      name: '灾备演练审批',
      formKey: 'dr-drill',
      defVersion: 3,
      versionLabel: '3.2',
      status: 'PUBLISHED' as const,
      createTime: '2026-07-05 10:00:00',
      updateTime: '2026-09-16 09:20:00',
      categoryName: 'IT 运维',
      instanceCount: 46,
      updatedBy: '陈曦',
      p53Stats: { total: 32, published: 24, draft: 6, disabled: 2 },
    },
    {
      id: 102,
      processKey: 'purchase_pay',
      name: '采购付款流程',
      formKey: 'purchase-pay',
      defVersion: 2,
      versionLabel: '2.8',
      status: 'PUBLISHED' as const,
      createTime: '2026-07-08 14:20:00',
      updateTime: '2026-09-15 17:40:00',
      categoryName: '财务管理',
      instanceCount: 183,
      updatedBy: '林悦',
    },
    {
      id: 103,
      processKey: 'iot_access',
      name: 'IoT 设备接入',
      formKey: 'iot-access',
      defVersion: 1,
      versionLabel: '1.4',
      status: 'DRAFT' as const,
      createTime: '2026-07-06 16:30:00',
      updateTime: '2026-09-14 13:06:00',
      categoryName: '设备管理',
      instanceCount: 12,
      updatedBy: '王海',
    },
    {
      id: 104,
      processKey: 'kb_permission',
      name: '知识库权限申请',
      formKey: 'kb-permission',
      defVersion: 1,
      versionLabel: '1.1',
      status: 'PUBLISHED' as const,
      createTime: '2026-07-09 13:45:00',
      updateTime: '2026-09-12 16:18:00',
      categoryName: '平台权限',
      instanceCount: 68,
      updatedBy: '赵辰',
    },
    {
      id: 105,
      processKey: 'travel_expense',
      name: '差旅报销流程',
      formKey: 'travel-expense',
      defVersion: 4,
      versionLabel: '4.0',
      status: 'DISABLED' as const,
      createTime: '2026-07-12 08:00:00',
      updateTime: '2026-09-10 11:32:00',
      categoryName: '行政办公',
      instanceCount: 321,
      updatedBy: '周明',
    },
  ]
  return {
    'GET /api/workflow/defs': (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const start = (pageNum - 1) * pageSize
      return ok({
        records: records.slice(start, start + pageSize),
        total: records.length,
        pageNum,
        pageSize,
      })
    },
  }
}

function taskDetailWithHistory(history: unknown[]): Record<string, DesignMockHandler> {
  const handler: DesignMockHandler = async (params) => {
    const base = mockRegistrations.find(
      (r) => r.method === 'GET' && r.pattern === '/api/workflow/tasks/:taskId',
    )
    const response = base
      ? await base.handler(params, {}, undefined)
      : { code: 404, message: 'missing', data: null }
    if (response.code !== 0 || response.data == null) return response
    const data = response.data as Record<string, unknown>
    return ok({ ...data, approvalHistory: history })
  }
  return { 'GET /api/workflow/tasks/:taskId': handler }
}

/** fixture 覆盖注册表：fixtureId → METHOD+PATH → handler。 */
const OVERRIDES: Record<string, Record<string, DesignMockHandler>> = {
  // 设计节点01：工作台设计密度（布局组件显隐 + 待办/已办/发起演示行与徽标计数）。
  // 仅注入数据/状态；生产工作台按同一接口形状渲染。
  node01: {
    'GET /api/system/workspace/layout': () =>
      ok({
        custom: true,
        cardTypes: [
          {
            id: 9401,
            typeCode: 'todo',
            displayName: '我的待办',
            rendererKey: 'todo',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 2,
            status: 0,
          },
          {
            id: 9402,
            typeCode: 'stats',
            displayName: '统计概览',
            rendererKey: 'stats',
            metadataJson: '{}',
            defaultSpan: 2,
            defaultOrder: 1,
            status: 0,
          },
          {
            id: 9403,
            typeCode: 'favoriteItems',
            displayName: '快捷发起',
            rendererKey: 'favorites',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 3,
            status: 0,
          },
          {
            id: 9404,
            typeCode: 'activity',
            displayName: '业务动态',
            rendererKey: 'activity',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 4,
            status: 0,
          },
          {
            id: 9405,
            typeCode: 'efficiency',
            displayName: '流程效能',
            rendererKey: 'efficiency',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 5,
            status: 0,
          },
          {
            id: 9406,
            typeCode: 'drafts',
            displayName: '草稿',
            rendererKey: 'drafts',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 6,
            status: 0,
          },
          {
            id: 9407,
            typeCode: 'messages',
            displayName: '消息',
            rendererKey: 'messages',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 7,
            status: 0,
          },
        ],
        layout: {
          cards: [
            { typeCode: 'stats', visible: true, order: 1, span: 2 },
            { typeCode: 'todo', visible: true, order: 2 },
            { typeCode: 'favoriteItems', visible: true, order: 3 },
            { typeCode: 'activity', visible: true, order: 4 },
            { typeCode: 'efficiency', visible: true, order: 5 },
            { typeCode: 'drafts', visible: false, order: 6 },
            { typeCode: 'messages', visible: false, order: 7 },
          ],
          favoriteItemKeys: [
            'TRAVEL_EXPENSE',
            'ASSET_PURCHASE',
            'DR_DRILL',
            'IOT_ACCESS',
            'KB_PERMISSION',
          ],
        },
      }),
    'GET /api/workflow/tasks/todo': () =>
      ok({
        records: [
          {
            taskId: 'fx-todo-1',
            name: '灾备演练申请',
            nodeName: '科技负责人会签',
            assigneeName: '林悦',
            dueText: '09-16 09:28',
          },
          {
            taskId: 'fx-todo-2',
            name: '采购付款申请',
            nodeName: '财务复核',
            assigneeName: '周明',
            dueText: '09-15 17:40',
          },
          {
            taskId: 'fx-todo-3',
            name: 'IoT 设备接入',
            nodeName: '设备接入审批',
            assigneeName: '王海',
            dueText: '09-14 13:06',
          },
        ],
        total: 6,
        pageNum: 1,
        pageSize: 5,
        badge: '2 项临期',
        urgentTotal: 2,
      }),
    'GET /api/workflow/my/processed': () =>
      ok({
        records: [
          {
            taskId: 'fx-p-3',
            taskName: '灾备演练申请进入「科技负责人会签」',
            action: '流程审批 · 林悦',
            endTime: '2026-09-16 09:32:00',
            createTime: '2026-09-16 09:32:00',
          },
          {
            taskId: 'fx-p-1',
            taskName: '采购付款申请已通过财务复核',
            action: '审批完成 · 周明',
            endTime: '2026-09-15 18:20:00',
            createTime: '2026-09-15 18:20:00',
          },
          {
            taskId: 'fx-p-2',
            taskName: 'IoT 设备接入申请已完成会签',
            action: '设备管理 · 智慧校园',
            endTime: '2026-09-14 11:06:00',
            createTime: '2026-09-14 11:06:00',
          },
        ],
        total: 27,
        pageNum: 1,
        pageSize: 5,
        badge: '较上周 +12%',
      }),
    'GET /api/workflow/my/copies': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fx-copy-1',
            processDefKey: 'p1_incident',
            formKey: 'p1-incident',
            businessKey: 'SW202609150901',
            taskName: '校园北门异常流量工单抄送给你',
            action: '抄送消息 · P1 工单',
            createTime: '2026-09-15 16:05:00',
          },
        ],
        total: 4,
        pageNum: 1,
        pageSize: 5,
      }),
    'GET /api/workflow/drafts': () =>
      ok({
        records: [
          {
            id: 1,
            formKey: 'travel-expense',
            title: '差旅报销申请',
            status: 'DRAFT',
            updateTime: '2026-09-15 10:12:00',
          },
          {
            id: 2,
            formKey: 'asset-purchase',
            title: '资产采购申请',
            status: 'DRAFT',
            updateTime: '2026-09-14 16:40:00',
          },
          {
            id: 3,
            formKey: 'kb-permission',
            title: '知识库权限申请',
            status: 'DRAFT',
            updateTime: '2026-09-13 09:05:00',
          },
        ],
        total: 3,
        pageNum: 1,
        pageSize: 5,
        badge: '继续编辑',
      }),
    'GET /api/workflow/monitor/analytics/summary': () =>
      ok({
        launched: 12,
        completed: 7,
        running: 3,
        rejected: 2,
        avgDurationMs: 23040000,
        p50DurationMs: 5400000,
        p90DurationMs: 10800000,
        durationSample: 7,
        handlerWorkload: { '2': 5, '3': 3 },
        nodeStats: {
          dept_approve: { count: 12, avgStayMs: 7200000, p90StayMs: 9000000 },
          finance_review: { count: 7, avgStayMs: 5760000, p90StayMs: 8100000 },
        },
      }),
    'GET /api/workflow/catalog/items': () =>
      ok({ records: catalogItemRows(), total: 6, pageNum: 1, pageSize: 60 }),
    'GET /api/workflow/my/instances': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fi-1',
            processDefKey: 'dr_drill',
            processName: '灾备演练申请',
            businessKey: 'SW202609160018',
            formKey: 'dr-drill',
            status: 'RUNNING',
            currentNode: '科技负责人会签',
            createTime: '2026-09-16T09:28:00',
          },
        ],
        total: 18,
        pageNum: 1,
        pageSize: 5,
        badge: '3 项进行中',
      }),
  },
  node15: taskDetailWithHistory([
    historyRow({
      nodeKey: 'dept-head',
      taskName: '部门负责人审批',
      assigneeName: '陈建国',
      createTime: '2026-09-15 09:24:00',
      endTime: '2026-09-15 09:40:00',
      opinionData: {
        comment: '情况属实，同意按差旅标准执行。',
        紧急程度: '普通',
        值守负责人: '陈建国',
        已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
        附件: '2 份',
      },
    }),
  ]),
  node16: taskDetailWithHistory([
    historyRow({
      nodeKey: 'joint-sign',
      taskName: '会签审批',
      assigneeName: '林悦',
      createTime: '2026-09-15 09:24:00',
      endTime: '2026-09-15 10:02:00',
      opinionData: { comment: '预算内同意。' },
    }),
    historyRow({
      nodeKey: 'joint-sign',
      taskName: '会签审批',
      assigneeName: '王振',
      createTime: '2026-09-15 09:24:00',
      endTime: '2026-09-15 10:14:00',
      opinionData: { comment: '同意，注意票据合规。' },
    }),
    historyRow({
      nodeKey: 'joint-sign',
      taskName: '会签审批',
      assigneeName: '赵敏',
      createTime: '2026-09-15 09:24:00',
      endTime: '2026-09-15 10:31:00',
      opinionData: { comment: '已复核，同意。' },
    }),
    historyRow({
      nodeKey: 'joint-sign',
      taskName: '会签审批',
      assigneeName: '赵辰',
      createTime: '2026-09-15 09:24:00',
      endTime: null,
      opinionData: { comment: '' },
    }),
  ]),
  node17: taskDetailWithHistory([
    historyRow({
      nodeKey: 'dept-head',
      taskName: '部门负责人审批',
      assigneeName: '周敏',
      createTime: '2026-09-14 16:02:00',
      endTime: '2026-09-14 16:18:00',
      opinionData: {
        comment: '设备确已到货验收，同意入账。',
        验收单号: 'YS-2026-0914-07',
        值守负责人: '周敏',
        已确认检查项: ['到货验收', '入账确认', '值守安排确认'],
        附件: '验收单_Y S.pdf',
      },
    }),
  ]),
  node18: taskDetailWithHistory([
    historyRow({
      nodeKey: 'joint-sign-li-ning',
      taskName: '会签审批',
      assigneeName: '李宁',
      createTime: '2026-09-13 11:05:00',
      endTime: '2026-09-13 11:26:00',
      opinionData: {
        comment: '按合同条款执行，请财务复核付款节点。',
        合同编号: 'HT-2026-0331',
        值守负责人: '李宁',
        已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
        附件: '会签检查单.pdf',
      },
    }),
  ]),
  // 设计节点02：我发起的列表（六行演示数据；currentNode 为列表契约可选展示字段）
  node02: {
    'GET /api/workflow/my/instances': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fi-1',
            processDefKey: 'dr_drill',
            processName: '灾备演练申请',
            businessKey: 'SW202609160018',
            formKey: 'dr-drill',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'RUNNING',
            createTime: '2026-09-16T09:28:00',
            currentNode: '科技负责人会签',
          },
          {
            id: 2,
            processInstanceId: 'fi-2',
            processDefKey: 'purchase_pay',
            processName: '采购付款申请',
            businessKey: 'SW202609150097',
            formKey: 'purchase-pay',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'RUNNING',
            createTime: '2026-09-15T16:42:00',
            currentNode: '财务复核',
          },
          {
            id: 3,
            processInstanceId: 'fi-3',
            processDefKey: 'iot_access',
            processName: 'IoT 设备接入申请',
            businessKey: 'SW202609140065',
            formKey: 'iot-access',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'APPROVED',
            createTime: '2026-09-14T11:08:00',
            currentNode: '已完成',
          },
          {
            id: 4,
            processInstanceId: 'fi-4',
            processDefKey: 'kb_permission',
            processName: '知识库权限申请',
            businessKey: 'SW202609120041',
            formKey: 'kb-permission',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'REJECTED',
            createTime: '2026-09-12T14:18:00',
            currentNode: '部门负责人审批',
          },
          {
            id: 5,
            processInstanceId: 'fi-5',
            processDefKey: 'travel_expense',
            processName: '差旅报销申请',
            businessKey: 'SW202609100025',
            formKey: 'travel-expense',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'APPROVED',
            createTime: '2026-09-10T10:32:00',
            currentNode: '归档',
          },
          {
            id: 6,
            processInstanceId: 'fi-6',
            processDefKey: 'room_change',
            processName: '机房变更申请',
            businessKey: 'SW202609080009',
            formKey: 'room-change',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'REJECTED',
            createTime: '2026-09-08T09:05:00',
            currentNode: '信息安全审核',
          },
        ],
        total: 18,
        pageNum: 1,
        pageSize: 10,
      }),
  },
  // 设计节点03：数据详情（灾备演练申请演示实例；表单 KV + 五行流转记录）
  node03: {
    'GET /api/workflow/tasks/:taskId': () =>
      ok({
        taskId: 'mock-task-001',
        taskName: '灾备演练申请审批',
        nodeKey: 'joint-sign',
        assigneeName: '王海',
        initiatorName: '林悦',
        processInstanceId: 'fi-dr-001',
        processDefinitionKey: 'dr_drill',
        processName: '灾备演练申请',
        formKey: 'dr-drill',
        businessKey: 'SW202609160018',
        assignee: '2',
        initiatorId: 1,
        createTime: '2026-09-16T09:28:00',
        processVariables: { formKey: 'dr-drill' },
        approvalHistory: [
          {
            taskId: 'h-0',
            taskName: '提交申请',
            assignee: '',
            assigneeName: '林悦',
            createTime: '2026-09-16 09:28:00',
            endTime: '2026-09-16 09:28:00',
            approvalResult: null,
            opinionData: { comment: '提交灾备演练申请，进入部门负责人审批' },
          },
          {
            taskId: 'h-1',
            nodeKey: 'dept-head',
            taskName: '部门负责人审批',
            assignee: '',
            assigneeName: '周明',
            createTime: '2026-09-16 09:28:00',
            endTime: '2026-09-16 10:06:00',
            approvalResult: 'APPROVED',
            assigneeDept: '科技运营部',
            opinionFormId: '部门审批意见表单',
            opinionFormVersion: '1.0',
            opinionData: {
              comment:
                '同意按计划开展灾备演练。请科技负责人会签确认技术方案，并落实演练期间的值守与回退安排。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '周明',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '部门审核清单.pdf',
            },
          },
          {
            taskId: 'h-2',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '系统',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:12:00',
            approvalResult: null,
            opinionData: { comment: '并行送达陈曦、李宁、王海、赵辰' },
          },
          {
            taskId: 'h-3',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '陈曦',
            assigneeDept: '科技运营部',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:24:00',
            approvalResult: 'APPROVED',
            opinionFormId: '灾备会签意见表单',
            opinionFormVersion: '1.2',
            opinionData: {
              comment:
                '验证方案满足主备切换要求；建议演练前完成设备检查及回退验证，并确认所有值守人员到位。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '陈曦',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '灾备会签检查单.pdf',
            },
          },
          {
            taskId: 'h-4',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '李宁',
            assigneeDept: '基础设施部',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:38:00',
            approvalResult: 'APPROVED',
            opinionFormId: '灾备会签意见表单',
            opinionFormVersion: '1.2',
            opinionData: {
              comment:
                '基础设施检查已完成，主设备与机房电力状态正常。确认回退预案与值守安排，同意执行本次演练。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '李宁',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '基础设施会签检查单.pdf',
            },
          },
          {
            taskId: 'h-5',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '王海',
            assigneeDept: '网络运维部',
            createTime: '2026-09-16 10:12:00',
            endTime: null,
            approvalResult: null,
            opinionData: { comment: '已送达 · 09-16 10:12' },
          },
          {
            taskId: 'h-6',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '赵辰',
            assigneeDept: '信息安全部',
            createTime: '2026-09-16 10:12:00',
            endTime: null,
            approvalResult: null,
            opinionData: { comment: '已送达 · 09-16 10:12' },
          },
        ],
      }),
    'GET /api/form/data/:formKey/:recordId': () =>
      ok({
        演练名称: '深圳中心 2026 年度灾备切换演练',
        演练时间: '2026-09-20 02:00 — 06:00',
        牵头部门: '科技运营部',
        影响范围: '核心交易灾备链路、机房电力与告警系统',
        风险等级: 'P1 · 需多部门会签',
        说明: '验证主备切换、断电告警、MQTT 指令执行与回切能力。',
        附件: '灾备演练方案_v3.pdf',
      }),
    'GET /api/workflow/defs/by-key/:processKey': () => ok(taskGraphPayload()),
  },
  // 设计节点04：管理端流程定义列表，使用同一生产页面与扩展字段的 fixture 数据层。
  node04: {
    ...shellFixtures(),
    ...adminDefsFixtures(),
  },
  node05: {
    ...shellFixtures(),
    'GET /api/notify/inbox/unread-count': () => ok(3),
    'GET /api/workflow/catalog/items': () =>
      ok({ records: [], total: 32, pageNum: 1, pageSize: 1 }),
    'GET /api/workflow/my/instances': () =>
      ok({ records: [], total: 706, pageNum: 1, pageSize: 1 }),
    'GET /api/workflow/tasks/todo': () => ok({ records: [], total: 6, pageNum: 1, pageSize: 1 }),
    'GET /api/workflow/monitor/analytics/summary': () =>
      ok({
        launched: 706,
        completed: 695,
        running: 2,
        rejected: 9,
        avgDurationMs: 23040000,
        p50DurationMs: 5400000,
        p90DurationMs: 10800000,
        durationSample: 695,
        overdue: 14,
        deviceAlerts: 2,
        launchTrendPercent: 12.8,
        durationTrendPercent: -18,
        overdueTrendPercent: -6,
        handlerWorkload: { '2': 420, '3': 286 },
        nodeStats: {
          dept_approve: { count: 420, avgStayMs: 7200000, p90StayMs: 9000000 },
          finance_review: { count: 286, avgStayMs: 5760000, p90StayMs: 8100000 },
        },
        dailyTrend: [
          { date: '09-05', count: 42 },
          { date: '09-06', count: 68 },
          { date: '09-07', count: 54 },
          { date: '09-08', count: 96 },
          { date: '09-09', count: 82 },
          { date: '09-10', count: 118 },
          { date: '09-11', count: 103 },
          { date: '09-12', count: 142 },
          { date: '09-13', count: 126 },
          { date: '09-14', count: 168 },
          { date: '09-15', count: 151 },
          { date: '09-16', count: 176 },
        ],
      }),
  },
  node09: processDesignerGraphFixtures(),
  node12: {
    ...processDesignerGraphFixtures(),
    'GET /api/workflow/defs/approver-candidates': () =>
      ok([
        { id: 2, username: 'chika', realName: '陈曦', department: '资产管理员' },
        { id: 103, username: 'wanghai', realName: '王海', department: '资产管理员' },
        { id: 104, username: 'linyue', realName: '林悦', department: '综合管理部' },
        { id: 105, username: 'zhaochen', realName: '赵辰', department: '采购与合约部' },
        { id: 106, username: 'zhouming', realName: '周明', department: '综合管理部负责人' },
      ]),
    'GET /api/system/dept/tree': () =>
      ok([
        { id: '1', parentId: '0', name: '总部' },
        { id: '2', parentId: '1', name: '综合管理部' },
        { id: '3', parentId: '1', name: '资产管理部' },
        { id: '4', parentId: '1', name: '财务管理部' },
        { id: '5', parentId: '1', name: '科技运营部' },
        { id: '6', parentId: '1', name: '采购与合约部' },
        { id: '7', parentId: '0', name: '深圳分公司' },
        { id: '8', parentId: '0', name: '广州分公司' },
      ]),
  },
  node13: processDesignerGraphFixtures(),
  node07: designerFormFixtures(),
  // 设计节点08：关联流程列表。数据仍走 ProcessDef 列表契约，只补充该表单的真实绑定记录。
  node08: {
    ...designerFormFixtures(),
    'GET /api/workflow/defs': () =>
      ok({
        records: [
          {
            id: 801,
            processKey: 'PROC_ASSET_PURCHASE',
            name: '资产采购审批',
            formKey: 'asset-purchase',
            defVersion: 3,
            status: 'PUBLISHED',
            versionLabel: '3.2',
            createTime: '2026-09-10 09:20',
            updateTime: '2026-09-10 09:20',
            updatedBy: '陈曦',
          },
          {
            id: 802,
            processKey: 'PROC_ASSET_URGENT',
            name: '紧急采购审批',
            formKey: 'asset-purchase',
            defVersion: 2,
            status: 'PUBLISHED',
            versionLabel: '2.1',
            createTime: '2026-09-12 14:32',
            updateTime: '2026-09-12 14:32',
            updatedBy: '林悦',
          },
          {
            id: 803,
            processKey: 'PROC_ASSET_LARGE',
            name: '大额采购会签',
            formKey: 'asset-purchase',
            defVersion: 1,
            status: 'DISABLED',
            versionLabel: '1.4',
            createTime: '2026-09-14 11:06',
            updateTime: '2026-09-14 11:06',
            updatedBy: '王海',
          },
          {
            id: 804,
            processKey: 'PROC_ASSET_PURCHASE_DRAFT',
            name: '资产采购审批（草稿）',
            formKey: 'asset-purchase',
            defVersion: 3,
            status: 'DRAFT',
            versionLabel: '3.3-draft',
            createTime: '2026-09-16 10:18',
            updateTime: '2026-09-16 10:18',
            updatedBy: '陈曦',
          },
        ],
        total: 4,
        pageNum: 1,
        pageSize: 10,
      }),
  },
  node11: designerFormFixtures(),
  node14: designerHistoryFixtures(),
  node21: catalogFixtures(null),
  node27: {
    'GET /api/form/def/by-key/:formKey/definition': () =>
      ok(
        JSON.stringify({
          title: '灾备演练申请',
          fields: [
            {
              name: 'exerciseName',
              label: '演练名称',
              type: 'TEXT',
              required: true,
              placeholder: '请输入演练名称',
            },
            {
              name: 'exerciseTime',
              label: '演练时间',
              type: 'DATE',
              required: true,
              placeholder: '请选择演练时间段',
            },
            {
              name: 'leadDepartment',
              label: '牵头部门',
              type: 'DICT',
              dictType: 'dept',
              required: true,
              defaultValue: 'TECH_OPS',
              placeholder: '科技运营部',
            },
            {
              name: 'impactScope',
              label: '影响范围',
              type: 'TEXT',
              required: true,
              placeholder: '请选择影响范围',
            },
            {
              name: 'riskLevel',
              label: '风险等级',
              type: 'DICT',
              dictType: 'risk_level',
              required: true,
              defaultValue: 'P1',
              placeholder: 'P1 · 需多部门会签',
            },
            {
              name: 'description',
              label: '说明',
              type: 'TEXT',
              placeholder: '填写灾演练说明与回切计划',
            },
            {
              name: 'attachment',
              label: '附件',
              type: 'TEXT',
              placeholder: '上传附件 · PDF / Word · 单个不超过 20MB',
            },
          ],
        }),
      ),
  },
  node28: { ...shellFixtures(), ...catalogFixtures(null) },
  node29: { ...shellFixtures(), ...adminDefsFixtures() },
  shell: shellFixtures(),
  // 流程中心五分类（节点22-26）：设计演示密度；仅视觉测试使用。
  node22: catalogFixtures(0),
  node23: catalogFixtures(1),
  node24: catalogFixtures(2),
  node25: catalogFixtures(3),
  node26: catalogFixtures(4),
}

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
    elements: [
      { id: 'start', kind: 'node', type: 'START', x: 416, y: 54, config: { name: '开始节点' } },
      {
        id: 'draft',
        kind: 'node',
        type: 'APPROVAL',
        x: 416,
        y: 145,
        config: {
          name: '起草节点',
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
        type: 'APPROVAL',
        x: 416,
        y: 327,
        config: {
          name: '办公室资产管理员意见',
          nodeKey: 'NODE_ASSET_MANAGER',
          approveMode: '单人审批',
          approverName: '资产管理员',
          approver: JSON.stringify({ type: 'DESIGNATED', value: ['2', '103'] }),
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
      { id: 'end', kind: 'node', type: 'END', x: 416, y: 748, config: { name: '结束节点' } },
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
function processDesignerGraphFixtures(): Record<string, DesignMockHandler> {
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

function designerFormFixtures(): Record<string, DesignMockHandler> {
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

function designerHistoryFixtures(): Record<string, DesignMockHandler> {
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
function taskGraphPayload(): Record<string, unknown> {
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
function catalogItemRows(): Array<Record<string, unknown>> {
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
function catalogFixtures(activeIndex: number | null): Record<string, DesignMockHandler> {
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

/** 按 fixture id 与请求 KEY 查覆盖 handler。 */
export function lookupDesignFixture(
  fixtureId: string,
  requestKey: string,
): DesignMockHandler | undefined {
  // 节点层优先，壳层（菜单/会话/未读）作为所有 fixture 会话的公共基础。
  return OVERRIDES[fixtureId]?.[requestKey] ?? OVERRIDES.shell?.[requestKey]
}

/**
 * 设计节点10：全屏流程图页（/workflow/task/:taskId/graph）。
 * 任务数据与节点03 同源；设计10 SVG 与设计19 同构（整图平移）：
 * world10 = world19 + (0,3)，边 waypoints 同步平移，保证连线相对几何一致。
 */
function design10GraphPayload(): Record<string, unknown> {
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

OVERRIDES['node10'] = {
  ...OVERRIDES.node03,
  'GET /api/workflow/defs/by-key/:processKey': () => ok(design10GraphPayload()),
}
