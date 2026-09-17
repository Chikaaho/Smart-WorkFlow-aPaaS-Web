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
  const leaf = (path: string, title: string) => {
    const base = byPath.get(path)
    return base ? { ...base, title, parentId: null } : null
  }
  const group = (id: string, title: string, children: Array<Record<string, unknown> | null>) => ({
    id,
    parentId: null,
    name: 'design-group-' + id,
    title,
    path: 'design-' + id,
    component: null,
    icon: undefined,
    sort: 1,
    menuType: 0,
    children: children.filter(Boolean),
  })
  return [
    group('9901', '流程协同', [
      leaf('workflow/catalog', '流程中心'),
      leaf('workflow/todo', '我的待办'),
      leaf('workflow/my-instances', '我发起的'),
      leaf('workflow/my-cc', '抄送我的'),
    ]),
    // 顶栏铃铛可见性依赖菜单树含收件箱入口；hidden 使其不进侧栏。
    { ...leaf('notify/inbox', '收件箱'), hidden: true },
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
  node01: {},
  node15: taskDetailWithHistory([
    historyRow({
      nodeKey: 'dept-head',
      taskName: '部门负责人审批',
      assigneeName: '陈建国',
      createTime: '2026-09-15 09:24:00',
      endTime: '2026-09-15 09:40:00',
      opinionData: { comment: '情况属实，同意按差旅标准执行。', 紧急程度: '普通', 附件: '2 份' },
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
  ]),
  node17: taskDetailWithHistory([
    historyRow({
      nodeKey: 'dept-head',
      taskName: '部门负责人审批',
      assigneeName: '周敏',
      createTime: '2026-09-14 16:02:00',
      endTime: '2026-09-14 16:18:00',
      opinionData: { comment: '设备确已到货验收，同意入账。', 验收单号: 'YS-2026-0914-07' },
    }),
  ]),
  node18: taskDetailWithHistory([
    historyRow({
      nodeKey: 'joint-sign-li-ning',
      taskName: '会签审批',
      assigneeName: '李宁',
      createTime: '2026-09-13 11:05:00',
      endTime: '2026-09-13 11:26:00',
      opinionData: { comment: '按合同条款执行，请财务复核付款节点。', 合同编号: 'HT-2026-0331' },
    }),
  ]),
  node21: catalogFixtures(0),
  shell: shellFixtures(),
  // 流程中心五分类（节点22-26）：设计演示密度；仅视觉测试使用。
  node22: catalogFixtures(0),
  node23: catalogFixtures(1),
  node24: catalogFixtures(2),
  node25: catalogFixtures(3),
  node26: catalogFixtures(4),
}

/** 流程中心 fixture：五个设计分类；items 密度按设计节点搭建。 */
function catalogFixtures(activeIndex: number): Record<string, DesignMockHandler> {
  const categories = [
    { id: 101, name: '行政办公', sortNo: 1 },
    { id: 102, name: '财务管理', sortNo: 2 },
    { id: 103, name: 'IT 运维', sortNo: 3 },
    { id: 104, name: '设备管理', sortNo: 4 },
    { id: 105, name: '平台权限', sortNo: 5 },
  ]
  const itemsPerCategory: Record<number, Array<{ key: string; name: string; desc: string }>> = {
    101: [
      { key: 'leave', name: '请假申请', desc: '员工请假流程' },
      { key: 'business-trip', name: '出差申请', desc: '差旅审批流程' },
      { key: 'overtime', name: '加班申请', desc: '加班认定流程' },
      { key: 'official-seal', name: '用章申请', desc: '印章使用审批' },
      { key: 'meeting', name: '会议室预定', desc: '会议室资源协调' },
      { key: 'purchase', name: '办公用品采购', desc: '行政采购流程' },
    ],
    102: [
      { key: 'expense', name: '费用报销', desc: '日常费用报销' },
      { key: 'payment', name: '付款申请', desc: '对外付款审批' },
      { key: 'invoice', name: '开票申请', desc: '发票开具流程' },
      { key: 'budget', name: '预算调整', desc: '预算变更审批' },
    ],
    103: [],
    104: [],
    105: [],
  }
  const active = categories[activeIndex]
  const itemRows = (active ? (itemsPerCategory[active.id] ?? []) : []).map((it, idx) => ({
    processKey: it.key,
    name: it.name,
    description: it.desc,
    categoryId: active?.id ?? null,
    portalVisible: true,
    enabled: true,
    sortNo: idx + 1,
  }))
  const counts: Record<string, number> = {}
  for (const c of categories) counts[String(c.id)] = (itemsPerCategory[c.id] ?? []).length
  return {
    'GET /api/workflow/catalog/categories': () => ok(categories),
    'GET /api/workflow/catalog/category-counts': () => ok(counts),
    'GET /api/workflow/catalog/items': () => ok(itemRows),
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
