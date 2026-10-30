import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import {
  listDatasourceGrants,
  listExtQueryContracts,
  pageManagedDatasources,
  replaceDatasourceGrants,
  setExtQueryContractEnabled,
  updateManagedDatasource,
  type ManagedDatasourcePayload,
} from './datasource'

const mockRequest = vi.mocked(request)

describe('modules/form/api/datasource — F020 受控数据源契约', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  it('分页读取使用带 /api 的管理端点并适配 records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [
        {
          id: '9',
          name: '资产库',
          type: 'postgresql',
          jdbcUrl: 'jdbc:postgresql://db:5432/asset',
          driverClass: 'org.postgresql.Driver',
          username: 'asset_reader',
          readOnly: 1,
          enabled: 1,
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 20,
    })

    const page = await pageManagedDatasources({ pageNum: 1, pageSize: 20 }, {})

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/external-datasource/page',
      params: { pageNum: 1, pageSize: 20 },
    })
    expect(page.list[0]?.name).toBe('资产库')
  })

  it('更新数据源走管理端点，密码留空时请求体不带 password', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    const payload: ManagedDatasourcePayload = {
      name: '资产库',
      type: 'postgresql',
      jdbcUrl: 'jdbc:postgresql://db:5432/asset',
      driverClass: 'org.postgresql.Driver',
      username: 'asset_reader',
      readOnly: 1,
      enabled: 1,
    }

    await updateManagedDatasource('9', payload)

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'PUT',
      url: '/workflow/external-datasource/9',
      data: expect.not.objectContaining({ password: expect.anything() }),
    })
  })

  it('读取并整集合替换授权主体', async () => {
    mockRequest.mockResolvedValueOnce([{ subjectType: 'ROLE', subjectKey: 'designer' }])
    const grants = await listDatasourceGrants('9')
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/external-datasource/9/grants',
    })
    expect(grants).toEqual([{ subjectType: 'ROLE', subjectKey: 'designer' }])

    mockRequest.mockResolvedValueOnce(undefined)
    await replaceDatasourceGrants('9', [
      { subjectType: 'ROLE', subjectKey: 'designer' },
      { subjectType: 'USER', subjectKey: '2113516345554395137' },
    ])
    expect(mockRequest).toHaveBeenLastCalledWith({
      method: 'PUT',
      url: '/workflow/external-datasource/9/grants',
      data: {
        grants: [
          { subjectType: 'ROLE', subjectKey: 'designer' },
          { subjectType: 'USER', subjectKey: '2113516345554395137' },
        ],
      },
    })
  })

  it('查询契约清单使用不带 /api 的表单端点并透传筛选', async () => {
    mockRequest.mockResolvedValueOnce([
      {
        queryKey: 'asset_list',
        queryVersion: 2,
        datasourceId: '9',
        outputFields: [
          { name: 'value', type: 'string' },
          { name: 'display', type: 'string' },
        ],
        enabled: 1,
      },
    ])

    const contracts = await listExtQueryContracts({ queryKey: 'asset', enabled: 1 })

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/form/ext/query-contracts',
      params: { queryKey: 'asset', enabled: 1 },
    })
    expect(contracts[0]?.queryKey).toBe('asset_list')
  })

  it('按 queryKey 启停最新契约版本', async () => {
    mockRequest.mockResolvedValueOnce(undefined)

    await setExtQueryContractEnabled('asset_list', false)

    expect(mockRequest).toHaveBeenCalledWith({
      method: 'PUT',
      url: '/form/ext/query-contract/asset_list/status',
      data: { enabled: false },
    })
  })
})
