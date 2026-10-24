import { describe, expect, it } from 'vitest'
import { dispatchMock } from './index'

async function mock<T>(method: string, url: string, query = {}, body?: unknown) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

describe('F020 datasource authoring mocks', () => {
  it('persists the administrator default list configuration', async () => {
    const initial = await mock<{ columns: Array<{ name: string }> }>(
      'GET',
      '/form/def/seed-def-001/list-config',
    )
    expect(initial?.data?.columns[0]?.name).toBe('drill_name')

    const next = {
      columns: [{ name: 'request_no', label: '申请编号', width: 180 }],
      filters: [],
      actions: ['view', 'edit'],
    }
    const saved = await mock(
      'PUT',
      '/form/def/seed-def-001/list-config',
      {},
      { config: JSON.stringify(next) },
    )
    expect(saved?.code).toBe(0)
    const readback = await mock<typeof next>('GET', '/form/def/seed-def-001/list-config')
    expect(readback?.data).toEqual(next)
  })

  it('serves datasource pages without credentials', async () => {
    const response = await mock<{ records: Array<Record<string, unknown>>; total: number }>(
      'GET',
      '/workflow/external-datasource/page',
      { pageNum: '1', pageSize: '10' },
    )
    expect(response?.code).toBe(0)
    expect(response?.data?.total).toBe(2)
    expect(response?.data?.records[0]).toMatchObject({ id: '9', name: '资产主数据' })
    expect(response?.data?.records[0]).not.toHaveProperty('password')
  })

  it('replaces and reads back datasource grants', async () => {
    const initial = await mock<Array<{ subjectType: string; subjectKey: string }>>(
      'GET',
      '/workflow/external-datasource/9/grants',
    )
    expect(initial?.data).toEqual([
      { subjectType: 'ROLE', subjectKey: 'designer' },
      { subjectType: 'USER', subjectKey: '2' },
    ])

    await mock(
      'PUT',
      '/workflow/external-datasource/9/grants',
      {},
      {
        grants: [{ subjectType: 'ROLE', subjectKey: 'asset_admin' }],
      },
    )
    const updated = await mock<Array<{ subjectType: string; subjectKey: string }>>(
      'GET',
      '/workflow/external-datasource/9/grants',
    )
    expect(updated?.data).toEqual([{ subjectType: 'ROLE', subjectKey: 'asset_admin' }])
  })

  it('lists authorized contracts and toggles the latest status', async () => {
    const list = await mock<Array<{ queryKey: string; enabled: number }>>(
      'GET',
      '/form/ext/query-contracts',
    )
    expect(list?.data?.map((row) => row.queryKey)).toContain('asset_list')

    const paused = await mock(
      'PUT',
      '/form/ext/query-contract/asset_list/status',
      {},
      {
        enabled: false,
      },
    )
    expect(paused?.code).toBe(0)
    const after = await mock<Array<{ queryKey: string; enabled: number }>>(
      'GET',
      '/form/ext/query-contracts',
      { queryKey: 'asset_list' },
    )
    expect(after?.data?.[0]?.enabled).toBe(0)
  })
})
