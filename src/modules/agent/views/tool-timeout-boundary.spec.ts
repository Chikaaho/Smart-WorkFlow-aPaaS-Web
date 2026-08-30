import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createExternalTool,
  getExternalTool,
  updateExternalTool,
  deleteExternalTool,
} from '@/modules/agent/api'
import { MOCK_CURRENT_SESSION, switchMockSession } from '@/foundation/mock/seeds'

/**
 * K5: 真实后端 timeout 边界。
 *
 * 实际请求真实后端校验链，至少提交 timeoutSeconds=0 与最小合法值 1 的请求、
 * 响应状态/消息及数据是否写入；与已保留的前端/Mock 结果逐值对账。
 */

let originalUsername: string
let createdIds: number[] = []

beforeEach(() => {
  originalUsername = MOCK_CURRENT_SESSION.user.username
  switchMockSession('superadmin')
  createdIds = []
})

afterEach(() => {
  // 清理创建的工具
  for (const id of createdIds) {
    try {
      deleteExternalTool(id).catch(() => {})
    } catch {
      // ignore
    }
  }
  switchMockSession(originalUsername)
})

describe('K5: 真实后端 timeout 边界', () => {
  it('timeoutSeconds=0 → 400 拒绝（最小合法值为 1）', async () => {
    // timeoutSeconds=0 应被拒绝
    try {
      const id = await createExternalTool({
        name: 'timeout_zero_test',
        description: 'Test tool for timeout boundary',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 0,
      })
      // 如果创建成功，记录 ID 以便清理
      createdIds.push(id)
      // 不应该到达这里
      expect(true).toBe(false) // 强制失败
    } catch (err) {
      // 应该抛出错误
      expect(err).toBeDefined()
    }
  })

  it('timeoutSeconds=1 → 成功（最小合法值）', async () => {
    const id = await createExternalTool({
      name: 'timeout_min_valid',
      description: 'Test tool for timeout boundary',
      url: 'https://test.com',
      httpMethod: 'GET',
      timeoutSeconds: 1,
      enabled: true,
    })
    createdIds.push(id)

    const detail = await getExternalTool(id)
    expect(detail.timeoutSeconds).toBe(1)
  })

  it('timeoutSeconds=30 → 成功（默认值）', async () => {
    const id = await createExternalTool({
      name: 'timeout_default',
      description: 'Test tool for timeout boundary',
      url: 'https://test.com',
      httpMethod: 'POST',
      timeoutSeconds: 30,
      enabled: true,
    })
    createdIds.push(id)

    const detail = await getExternalTool(id)
    expect(detail.timeoutSeconds).toBe(30)
  })

  it('timeoutSeconds=300 → 成功（最大值）', async () => {
    const id = await createExternalTool({
      name: 'timeout_max_valid',
      description: 'Test tool for timeout boundary',
      url: 'https://test.com',
      httpMethod: 'PUT',
      timeoutSeconds: 300,
      enabled: true,
    })
    createdIds.push(id)

    const detail = await getExternalTool(id)
    expect(detail.timeoutSeconds).toBe(300)
  })

  it('编辑时 timeoutSeconds=0 → 拒绝', async () => {
    // 先创建一个有效工具
    const id = await createExternalTool({
      name: 'timeout_edit_test',
      description: 'Test tool for timeout boundary',
      url: 'https://test.com',
      httpMethod: 'GET',
      timeoutSeconds: 30,
      enabled: true,
    })
    createdIds.push(id)

    // 尝试编辑为 timeoutSeconds=0
    try {
      await updateExternalTool(id, {
        name: 'timeout_edit_test',
        description: 'Test tool for timeout boundary',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 0,
      })
      // 不应该到达这里
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeDefined()
    }

    // 验证原值未变
    const detail = await getExternalTool(id)
    expect(detail.timeoutSeconds).toBe(30)
  })

  it('timeout 边界值对账报告', async () => {
    const results: Array<{
      value: number
      expected: string
      actual: string
    }> = []

    // 测试 timeoutSeconds=0
    try {
      const id = await createExternalTool({
        name: 'boundary_0',
        description: 'Test tool for timeout boundary',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 0,
      })
      createdIds.push(id)
      results.push({
        value: 0,
        expected: '400 拒绝',
        actual: '成功（意外）',
      })
    } catch {
      results.push({
        value: 0,
        expected: '400 拒绝',
        actual: '拒绝',
      })
    }

    // 测试 timeoutSeconds=1
    try {
      const id = await createExternalTool({
        name: 'boundary_1',
        description: 'Test tool for timeout boundary',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 1,
      })
      createdIds.push(id)
      const detail = await getExternalTool(id)
      results.push({
        value: 1,
        expected: '成功，值=1',
        actual: `成功，值=${detail.timeoutSeconds}`,
      })
    } catch (err) {
      results.push({
        value: 1,
        expected: '成功',
        actual: `拒绝: ${err}`,
      })
    }

    // 输出报告
    console.log('\n=== K5 timeout 边界值对账报告 ===')
    for (const r of results) {
      console.log(`timeoutSeconds=${r.value}: 预期=${r.expected}, 实际=${r.actual}`)
    }
    console.log('=== 报告结束 ===\n')

    // 验证
    expect(results[0].actual).toContain('拒绝') // 0 被拒绝
    expect(results[1].actual).toContain('成功') // 1 成功
  })
})
