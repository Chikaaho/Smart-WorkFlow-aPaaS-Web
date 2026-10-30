import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPageProcessDefs = vi.fn()
const mockListDefVersions = vi.fn()
const mockGetDefVersionGraph = vi.fn()

vi.mock('@/modules/workflow/api', () => ({
  pageProcessDefs: (...args: unknown[]) => mockPageProcessDefs(...args),
  listDefVersions: (...args: unknown[]) => mockListDefVersions(...args),
  getDefVersionGraph: (...args: unknown[]) => mockGetDefVersionGraph(...args),
}))

import {
  loadSnapshotProcessVersionCandidates,
  loadSnapshotProcessVersionGraph,
} from './published-snapshot'

const defA = {
  id: 11,
  processKey: 'asset_a',
  name: '资产审批 A',
  formKey: 'asset-form',
  defVersion: 2,
  status: 'PUBLISHED' as const,
  createTime: '2026-09-01 09:00:00',
  updateTime: '2026-10-01 09:00:00',
}

const defB = {
  ...defA,
  id: 12,
  processKey: 'asset_b',
  name: '资产审批 B',
}

const versionA = {
  id: 101,
  defId: 11,
  graphVersion: 3,
  status: 'PUBLISHED' as const,
  name: '资产审批 A',
  formVersion: '4.1',
  publishedAt: '2026-10-01 09:00:00',
}

describe('adapters/published-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPageProcessDefs.mockResolvedValue({
      list: [defA, defB],
      total: 2,
      pageNum: 1,
      pageSize: 200,
    })
    mockListDefVersions.mockImplementation((defId: number) => {
      if (defId === 11) return Promise.resolve([versionA])
      return Promise.reject(new Error('version rows unavailable'))
    })
    mockGetDefVersionGraph.mockResolvedValue({ elements: [] })
  })

  it('只读取绑定到该表单的流程版本，并逐定义保留失败项', async () => {
    const result = await loadSnapshotProcessVersionCandidates('asset-form')

    expect(mockPageProcessDefs).toHaveBeenCalledWith({ pageNum: 1, pageSize: 200 }, 'asset-form')
    expect(mockListDefVersions).toHaveBeenCalledWith(11)
    expect(mockListDefVersions).toHaveBeenCalledWith(12)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ def: { id: 11 }, version: { graphVersion: 3 } })
    expect(result.failures).toEqual(['资产审批 B: version rows unavailable'])
  })

  it('跨页读取关联定义，不遗漏后续页的发布版本', async () => {
    mockPageProcessDefs
      .mockResolvedValueOnce({ list: [defA], total: 2, pageNum: 1, pageSize: 1 })
      .mockResolvedValueOnce({ list: [defB], total: 2, pageNum: 2, pageSize: 1 })
    mockListDefVersions.mockResolvedValue([versionA])
    const result = await loadSnapshotProcessVersionCandidates('asset-form')
    expect(mockPageProcessDefs).toHaveBeenNthCalledWith(
      2,
      { pageNum: 2, pageSize: 200 },
      'asset-form',
    )
    expect(result.items.map((item) => item.def.id)).toEqual([11, 12])
  })

  it('冻结图必须通过版本号端点读取', async () => {
    const graph = await loadSnapshotProcessVersionGraph(11, 3)

    expect(mockGetDefVersionGraph).toHaveBeenCalledWith(11, 3)
    expect(graph).toEqual({ elements: [] })
  })
})
