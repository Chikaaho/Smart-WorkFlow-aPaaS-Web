import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import { useDict, listDictTypes } from './index'

describe('foundation/dict', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset()
  })

  it('maps backend code field to value (decision doc v2 §1 adapter)', async () => {
    vi.mocked(request).mockResolvedValueOnce([{ code: 'A', label: 'Alpha' }])
    const { items } = useDict('test_type_a')
    await vi.waitFor(() => expect(items.value).toEqual([{ label: 'Alpha', value: 'A' }]))
  })

  it('fails non-blocking: empty items, no throw, and allows retry on next call', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('network down'))
    const first = useDict('test_type_b')
    // 等待失败链路（loadDict -> catch -> finally）完全落地，确认 loadingDict 已清空，
    // 而不是只检查 request 被调用过（那一刻 in-flight promise 可能还没清，会让下面的重试复用旧的失败 promise）。
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(request).toHaveBeenCalledTimes(1)
    expect(first.items.value).toEqual([])

    vi.mocked(request).mockResolvedValueOnce([{ code: 'B', label: 'Beta' }])
    const second = useDict('test_type_b')
    await vi.waitFor(() => expect(second.items.value).toEqual([{ label: 'Beta', value: 'B' }]))
  })

  it('listDictTypes maps backend paged records to {code,name} (designer DICT 绑定)', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      records: [
        { code: 'dept', name: '部门', extra: 'ignored' },
        { code: 'leave_type', name: '请假类型' },
      ],
    })
    const types = await listDictTypes()
    expect(types).toEqual([
      { code: 'dept', name: '部门' },
      { code: 'leave_type', name: '请假类型' },
    ])
    // 走单一请求层，POST 分页端点，不直引 axios。
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: '/system/dict/type/page' }),
    )
  })
})
