import { describe, it, expect } from 'vitest'
import { dispatchMock } from './index'

/**
 * G7: 管理页 → 图设计器 TOOL 下拉数据流验证。
 *
 * 证明 listToolOptions() 的底层 dispatch 链在 CRUD 后返回最新数据：
 * - 新增启用工具后 TOOL 下拉可见
 * - 停用工具后 TOOL 下拉不再包含（enabled=true 过滤）
 * - 重新启用后恢复可选
 * - 删除工具后 TOOL 下拉不再包含
 *
 * 通过 dispatchMock 直接执行 handler，不 mock API 函数。
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

/** 模拟 listToolOptions() 的 enabled=true 过滤行为 */
async function listEnabledToolNames(): Promise<{ internal: string[]; external: string[] }> {
  const [internalRaw, externalRaw] = await Promise.all([
    mock<{ records: { name: string; enabled: boolean }[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '1000', enabled: 'true' },
    ),
    mock<{ records: { name: string; enabled: boolean }[]; total: number }>(
      'GET',
      '/agent/tool/external',
      { pageNum: '1', pageSize: '1000', enabled: 'true' },
    ),
  ])
  return {
    internal: internalRaw!.data.records.map((t) => t.name),
    external: externalRaw!.data.records.map((t) => t.name),
  }
}

describe('G7: TOOL 下拉数据流（管理页 CRUD → 下拉可见性）', () => {
  it('新增启用内部工具后，TOOL 下拉包含该工具', async () => {
    const before = await listEnabledToolNames()
    expect(before.internal).not.toContain('g7_new_internal')

    // 新增启用
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'g7_new_internal',
        description: 'G7 测试工具',
        beanName: 'bean',
        methodName: 'method',
        enabled: true,
      },
    )
    expect(created!.code).toBe(0)

    // 验证下拉可见
    const after = await listEnabledToolNames()
    expect(after.internal).toContain('g7_new_internal')
  })

  it('新增启用外部工具后，TOOL 下拉包含该工具', async () => {
    const before = await listEnabledToolNames()
    expect(before.external).not.toContain('g7_new_external')

    const created = await mock<number>(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'g7_new_external',
        description: 'G7 外部工具',
        url: 'https://g7.test.com/api',
        httpMethod: 'GET',
        timeoutSeconds: 10,
        enabled: true,
      },
    )
    expect(created!.code).toBe(0)

    const after = await listEnabledToolNames()
    expect(after.external).toContain('g7_new_external')
  })

  it('停用内部工具后，TOOL 下拉不再包含该工具（enabled 过滤）', async () => {
    // 先启用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'true' })

    // 停用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'false' })

    // 下拉不再包含停用的工具
    const after = await listEnabledToolNames()
    expect(after.internal).not.toContain('get_weather')
  })

  it('重新启用内部工具后，TOOL 恢复可选', async () => {
    // 停用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'false' })
    const disabled = await listEnabledToolNames()
    expect(disabled.internal).not.toContain('get_weather')

    // 重新启用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'true' })
    const reEnabled = await listEnabledToolNames()
    expect(reEnabled.internal).toContain('get_weather')
  })

  it('删除内部工具后，TOOL 下拉不再包含该工具', async () => {
    // 先创建
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'g7_to_delete',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    const id = created!.data

    // 确认存在
    const before = await listEnabledToolNames()
    expect(before.internal).toContain('g7_to_delete')

    // 删除
    await mock('DELETE', `/agent/tool/internal/${id}`)

    // 下拉不再包含
    const after = await listEnabledToolNames()
    expect(after.internal).not.toContain('g7_to_delete')
  })

  it('删除外部工具后，TOOL 下拉不再包含该工具', async () => {
    const created = await mock<number>(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'g7_to_delete_ext',
        url: 'https://g7-delete.test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      },
    )
    const id = created!.data

    const before = await listEnabledToolNames()
    expect(before.external).toContain('g7_to_delete_ext')

    await mock('DELETE', `/agent/tool/external/${id}`)

    const after = await listEnabledToolNames()
    expect(after.external).not.toContain('g7_to_delete_ext')
  })

  it('TOOL 下拉数据来自 handler（非静态副本）', async () => {
    // 新增一个唯一名称的启用工具
    const uniqueName = `g7_fresh_${Date.now()}`
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: uniqueName,
        beanName: 'bean',
        methodName: 'method',
        enabled: true,
      },
    )
    expect(created!.code).toBe(0)

    // 下拉返回的是 handler 处理后的实时数据（enabled=true 过滤）
    const options = await mock<{ records: { name: string }[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '1000', enabled: 'true' },
    )
    expect(options!.data.records.some((t) => t.name === uniqueName)).toBe(true)
  })
})
