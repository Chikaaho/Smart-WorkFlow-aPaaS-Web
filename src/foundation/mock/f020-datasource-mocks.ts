import type { MockHandler, MockMethod } from './index'

interface Registration {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}

interface DatasourceRow {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'h2' | 'oracle'
  driverClass: string
  jdbcUrl: string
  username: string
  readOnly: number
  enabled: number
  updateTime: string
}

interface GrantRow {
  subjectType: 'ROLE' | 'USER'
  subjectKey: string
}

interface ContractRow {
  queryKey: string
  queryVersion: number
  datasourceId: string
  outputFields: Array<{ name: string; type: string }>
  enabled: number
}

const datasources: DatasourceRow[] = [
  {
    id: '9',
    name: '资产主数据',
    type: 'postgresql',
    driverClass: 'org.postgresql.Driver',
    jdbcUrl: 'jdbc:postgresql://asset-db.internal:5432/assets',
    username: 'asset_reader',
    readOnly: 1,
    enabled: 1,
    updateTime: '2026-10-24 10:20:00',
  },
  {
    id: '10',
    name: '采购只读库',
    type: 'mysql',
    driverClass: 'com.mysql.cj.jdbc.Driver',
    jdbcUrl: 'jdbc:mysql://purchase-db.internal:3306/purchase',
    username: 'purchase_reader',
    readOnly: 1,
    enabled: 1,
    updateTime: '2026-10-23 16:40:00',
  },
]

const grants = new Map<string, GrantRow[]>([
  [
    '9',
    [
      { subjectType: 'ROLE', subjectKey: 'designer' },
      { subjectType: 'USER', subjectKey: '2' },
    ],
  ],
  ['10', []],
])

const contracts: ContractRow[] = [
  {
    queryKey: 'asset_list',
    queryVersion: 2,
    datasourceId: '9',
    outputFields: [
      { name: 'asset_id', type: 'string' },
      { name: 'asset_name', type: 'string' },
    ],
    enabled: 1,
  },
  {
    queryKey: 'asset_owner_list',
    queryVersion: 1,
    datasourceId: '9',
    outputFields: [
      { name: 'user_id', type: 'string' },
      { name: 'display_name', type: 'string' },
    ],
    enabled: 1,
  },
  {
    queryKey: 'purchase_order_lookup',
    queryVersion: 1,
    datasourceId: '10',
    outputFields: [
      { name: 'order_id', type: 'string' },
      { name: 'order_label', type: 'string' },
    ],
    enabled: 0,
  },
]

let nextDatasourceId = 11
let listConfig: unknown = {
  columns: [
    { name: 'drill_name', label: '演练名称', width: 220 },
    { name: 'department_id', label: '牵头部门', width: 160 },
    { name: 'risk_level', label: '风险等级', width: 120 },
  ],
  filters: [{ name: 'drill_name', op: 'LIKE' }],
  defaultSort: { name: 'drill_start_time', desc: true },
  actions: ['view'],
}

function ok<T>(data: T) {
  return { code: 0, message: 'ok', data }
}

/** F020 数据源授权/查询契约的 dev:mock 数据；不进入生产构建。 */
export const f020DatasourceMockRegistrations: Registration[] = [
  {
    method: 'GET',
    pattern: '/api/form/def/:id/list-config',
    handler: () => ok(listConfig),
  },
  {
    method: 'PUT',
    pattern: '/api/form/def/:id/list-config',
    handler: (_params, _query, body) => {
      const payload = body as { config?: string }
      if (typeof payload?.config === 'string') {
        try {
          listConfig = JSON.parse(payload.config) as unknown
        } catch {
          return { code: 400, message: '列表配置不是合法 JSON', data: null }
        }
      }
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/external-datasource/page',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const name = String(query.name ?? '')
        .trim()
        .toLowerCase()
      const enabled = query.enabled === undefined ? null : Number(query.enabled)
      const filtered = datasources.filter(
        (row) =>
          (!name || row.name.toLowerCase().includes(name)) &&
          (enabled === null || row.enabled === enabled),
      )
      const start = (pageNum - 1) * pageSize
      return ok({
        records: filtered.slice(start, start + pageSize),
        total: filtered.length,
        pageNum,
        pageSize,
      })
    },
  },
  {
    method: 'POST',
    pattern: '/api/workflow/external-datasource',
    handler: (_params, _query, body) => {
      const payload = (body ?? {}) as Partial<DatasourceRow>
      const id = String(nextDatasourceId++)
      datasources.push({
        id,
        name: String(payload.name ?? '未命名数据源'),
        type: payload.type ?? 'postgresql',
        driverClass: String(payload.driverClass ?? 'org.postgresql.Driver'),
        jdbcUrl: String(payload.jdbcUrl ?? ''),
        username: String(payload.username ?? ''),
        readOnly: Number(payload.readOnly ?? 1),
        enabled: Number(payload.enabled ?? 1),
        updateTime: '2026-10-24 22:00:00',
      })
      grants.set(id, [])
      return ok(id)
    },
  },
  {
    method: 'PUT',
    pattern: '/api/workflow/external-datasource/:id',
    handler: (params, _query, body) => {
      const row = datasources.find((item) => item.id === params.id)
      if (!row) return { code: 404, message: '数据源不存在', data: null }
      const payload = (body ?? {}) as Partial<DatasourceRow>
      Object.assign(row, {
        ...payload,
        id: row.id,
        updateTime: '2026-10-24 22:00:00',
      })
      return ok(null)
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/workflow/external-datasource/:id',
    handler: (params) => {
      const index = datasources.findIndex((item) => item.id === params.id)
      if (index >= 0) datasources.splice(index, 1)
      grants.delete(params.id)
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/external-datasource/:id/grants',
    handler: (params) => ok(grants.get(params.id) ?? []),
  },
  {
    method: 'PUT',
    pattern: '/api/workflow/external-datasource/:id/grants',
    handler: (params, _query, body) => {
      const payload = body as { grants?: GrantRow[] }
      const next = Array.isArray(payload?.grants) ? payload.grants : []
      grants.set(
        params.id,
        next.map((item) => ({ ...item })),
      )
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: '/api/form/ext/query-contracts',
    handler: (_params, query) => {
      const queryKey = String(query.queryKey ?? '').trim()
      const enabled = query.enabled === undefined ? null : Number(query.enabled)
      return ok(
        contracts.filter(
          (row) =>
            (!queryKey || row.queryKey === queryKey) &&
            (enabled === null || row.enabled === enabled),
        ),
      )
    },
  },
  {
    method: 'PUT',
    pattern: '/api/form/ext/query-contract/:queryKey/status',
    handler: (params, _query, body) => {
      const row = contracts.find((item) => item.queryKey === params.queryKey)
      if (!row) return { code: 1212, message: '查询契约不存在', data: null }
      const payload = body as { enabled?: boolean }
      row.enabled = payload?.enabled ? 1 : 0
      return ok(null)
    },
  },
]
