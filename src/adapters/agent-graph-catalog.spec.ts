import { describe, it, expect, vi, beforeEach } from 'vitest'

// 0.2.4：iot 规则页跨模块取已发布 Agent 图的唯一出口——钉死过滤与展示形状
vi.mock('@/modules/agent/api', () => ({
  pageGraphDefs: vi.fn(),
}))

import { pageGraphDefs } from '@/modules/agent/api'
import { listPublishedGraphOptions } from './agent-graph-catalog'

const mockedPage = vi.mocked(pageGraphDefs)

describe('agent-graph-catalog adapter', () => {
  beforeEach(() => {
    mockedPage.mockReset()
  })

  it('仅返回已发布图，value 为 graphKey，label 含名称', async () => {
    mockedPage.mockResolvedValue({
      list: [
        {
          id: 1,
          graphKey: 'agent_gate_judge',
          name: '大门流量研判',
          defVersion: 2,
          status: 'PUBLISHED',
          createTime: '2026-11-06T00:00:00Z',
          updateTime: '2026-11-06T00:00:00Z',
        },
        {
          id: 2,
          graphKey: 'agent_draft_one',
          name: '草稿图',
          defVersion: 1,
          status: 'DRAFT',
          createTime: '2026-11-06T00:00:00Z',
          updateTime: '2026-11-06T00:00:00Z',
        },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 100,
    })

    const options = await listPublishedGraphOptions()

    expect(options).toEqual([
      { label: '大门流量研判 (agent_gate_judge)', value: 'agent_gate_judge' },
    ])
  })

  it('目录加载失败时抛出，由调用方按空列表退化（不吞错）', async () => {
    mockedPage.mockRejectedValue(new Error('network'))
    await expect(listPublishedGraphOptions()).rejects.toThrow('network')
  })
})
