import { describe, it, expect } from 'vitest'
import { effectScope, ref } from 'vue'
import { useClientList } from './useClientList'

interface Row {
  id: number
  name: string
  code: string
}

function setup(rows: Row[], pageSize = 2) {
  const source = ref<Row[]>(rows)
  const scope = effectScope()
  const api = scope.run(() =>
    useClientList(source, {
      pageSize,
      searchFields: (row) => [row.name, row.code],
    }),
  )!
  return { source, ...api }
}

describe('useClientList', () => {
  it('无关键词时按页大小切片，total 为原始条数', () => {
    const list = setup([
      { id: 1, name: 'A', code: 'a' },
      { id: 2, name: 'B', code: 'b' },
      { id: 3, name: 'C', code: 'c' },
    ])
    expect(list.total.value).toBe(3)
    expect(list.pagedRows.value.map((r) => r.id)).toEqual([1, 2])
    list.handlePageNumChange(2)
    expect(list.pagedRows.value.map((r) => r.id)).toEqual([3])
  })

  it('查询仅在点击后生效，大小写不敏感并回到第一页', () => {
    const list = setup([
      { id: 1, name: 'Alpha', code: 'a1' },
      { id: 2, name: 'Beta', code: 'b1' },
      { id: 3, name: 'Alpine', code: 'a2' },
    ])
    list.pageNum.value = 2
    list.keyword.value = 'alpha'
    // 输入过程中不改变结果
    expect(list.total.value).toBe(3)

    list.handleQuery()
    expect(list.pageNum.value).toBe(1)
    expect(list.total.value).toBe(1)
    expect(list.pagedRows.value.map((r) => r.id)).toEqual([1])

    list.keyword.value = 'a1'
    list.handleQuery()
    expect(list.pagedRows.value.map((r) => r.id)).toEqual([1])
  })

  it('重置清空关键词并回到第一页', () => {
    const list = setup([
      { id: 1, name: 'Alpha', code: 'a1' },
      { id: 2, name: 'Beta', code: 'b1' },
    ])
    list.keyword.value = 'beta'
    list.handleQuery()
    list.pageNum.value = 2

    list.handleReset()

    expect(list.keyword.value).toBe('')
    expect(list.currentKeyword.value).toBe('')
    expect(list.pageNum.value).toBe(1)
    expect(list.total.value).toBe(2)
  })

  it('修改页大小回到第一页', () => {
    const list = setup([
      { id: 1, name: 'A', code: 'a' },
      { id: 2, name: 'B', code: 'b' },
      { id: 3, name: 'C', code: 'c' },
    ])
    list.handlePageNumChange(2)
    list.handlePageSizeChange(3)

    expect(list.pageSize.value).toBe(3)
    expect(list.pageNum.value).toBe(1)
    expect(list.pagedRows.value).toHaveLength(3)
  })
})
