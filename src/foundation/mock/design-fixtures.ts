/**
 * P53 设计还原测试专用 fixture 覆盖层（dev-only，随 mock 模块 tree-shake）。
 *
 * 仅用于 DESIGN_FIDELITY 视觉比较：把页面内容密度/状态固定到设计节点形态。
 * 激活通道：capture 脚本在应用启动前经 addInitScript 把 fixture id 写入
 * sessionStorage('sw.design-fixture-id')；dispatchMock 命中同 KEY 覆盖时优先返回。
 * 生产构建不加载 mock 模块 ⇒ 本文件不进产物；不修改任何业务语义与真实数据。
 *
 * 拆分结构：共享类型/工具在 design-fixtures-shared（独立文件避免循环 import TDZ）、
 * 设计器/图谱/目录工厂在 design-fixtures-designer、内联节点对象在 design-fixtures-nodes；
 * 本文件保留壳层/管理端/任务详情工厂并聚合 OVERRIDES，键序与拆分前一致。
 */

import { mockRegistrations } from './handlers'
import { MOCK_SESSION_DATA } from './seeds'
import { activeDesignFixtureFlag } from '../design-fixture-flag'
import { historyRow, ok, type DesignMockHandler } from './design-fixtures-shared'
import {
  catalogFixtures,
  design10GraphPayload,
  designerFormFixtures,
  designerHistoryFixtures,
  processDesignerGraphFixtures,
} from './design-fixtures-designer'
import {
  node01Fixtures,
  node02Fixtures,
  node03Fixtures,
  node08Fixtures,
  node12Fixtures,
  node27Fixtures,
} from './design-fixtures-nodes'

export type { DesignMockHandler }

/** 读取当前激活的设计 fixture id（dev+mock 模块内才可能被调用）。 */
export function activeDesignFixtureId(): string | null {
  return activeDesignFixtureFlag()
}

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
  node01: node01Fixtures(),
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
      endTime: '2026-09-15 10:31:00',
      approvalResult: 'REJECTED',
      opinionData: { comment: '票据不合规，驳回。' },
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
  node02: node02Fixtures(),
  node03: node03Fixtures(),
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
  node12: node12Fixtures(),
  node13: processDesignerGraphFixtures(),
  node07: designerFormFixtures(),
  node08: node08Fixtures(),
  node11: designerFormFixtures(),
  node14: designerHistoryFixtures(),
  node21: catalogFixtures(null),
  node27: node27Fixtures(),
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

/** 按 fixture id 与请求 KEY 查覆盖 handler。 */
export function lookupDesignFixture(
  fixtureId: string,
  requestKey: string,
): DesignMockHandler | undefined {
  // 节点层优先，壳层（菜单/会话/未读）作为所有 fixture 会话的公共基础。
  return OVERRIDES[fixtureId]?.[requestKey] ?? OVERRIDES.shell?.[requestKey]
}

OVERRIDES['node10'] = {
  ...OVERRIDES.node03,
  'GET /api/workflow/defs/by-key/:processKey': () => ok(design10GraphPayload()),
}
