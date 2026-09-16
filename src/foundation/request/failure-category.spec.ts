import { describe, it, expect } from 'vitest'
import {
  classifyHttpStatus,
  classifyTransportFailure,
  categoryMessage,
  isRetryable,
  FAILURE_CATEGORY_SPECS,
  type FailureCategory,
} from './failure-category'

/**
 * P61 阶段 B：失败分类契约。
 *
 * 钉死方向 §3.5 的九类语义与 §7 验收标准 8：网络中断、超时、401、403、404、
 * 409/业务冲突、5xx 必须得到**互不混同**的分类，且可重试 / 不可重试不得写成同一句。
 */
describe('failure-category', () => {
  const NINE: FailureCategory[] = [
    'INPUT_CORRECTABLE',
    'AUTHENTICATION_REQUIRED',
    'PERMISSION_DENIED',
    'OBJECT_NOT_FOUND',
    'BUSINESS_CONFLICT',
    'IN_PROGRESS',
    'RETRYABLE_INFRASTRUCTURE',
    'NON_RETRYABLE_CONFIGURATION',
    'SYSTEM_FAULT',
  ]

  it('恰好提供九类失败语义，每类都有结论与恢复动作', () => {
    expect(Object.keys(FAILURE_CATEGORY_SPECS).sort()).toEqual([...NINE].sort())
    for (const category of NINE) {
      const spec = FAILURE_CATEGORY_SPECS[category]
      expect(spec.message.trim(), category).not.toBe('')
      expect(spec.recovery.trim(), category).not.toBe('')
    }
  })

  it('HTTP 状态码映射到互不相同的分类', () => {
    expect(classifyHttpStatus(400)).toBe('INPUT_CORRECTABLE')
    expect(classifyHttpStatus(401)).toBe('AUTHENTICATION_REQUIRED')
    expect(classifyHttpStatus(403)).toBe('PERMISSION_DENIED')
    expect(classifyHttpStatus(404)).toBe('OBJECT_NOT_FOUND')
    expect(classifyHttpStatus(409)).toBe('BUSINESS_CONFLICT')
    expect(classifyHttpStatus(503)).toBe('RETRYABLE_INFRASTRUCTURE')
    expect(classifyHttpStatus(500)).toBe('SYSTEM_FAULT')
  })

  it('4xx 客户端类失败与 5xx 服务类失败不混为一类', () => {
    const clientSide = [
      classifyHttpStatus(400),
      classifyHttpStatus(401),
      classifyHttpStatus(403),
      classifyHttpStatus(404),
      classifyHttpStatus(409),
    ]
    for (const category of clientSide) {
      expect(category).not.toBe('SYSTEM_FAULT')
    }
    expect(classifyHttpStatus(500)).toBe('SYSTEM_FAULT')
  })

  it('网络中断与超时可重试，且与 5xx 系统故障区分', () => {
    expect(classifyTransportFailure('ECONNABORTED')).toBe('RETRYABLE_INFRASTRUCTURE')
    expect(classifyTransportFailure('ERR_NETWORK')).toBe('RETRYABLE_INFRASTRUCTURE')
    expect(classifyTransportFailure(undefined)).toBe('SYSTEM_FAULT')
  })

  it('可重试标记与文案自洽：可重试类给出重试时机，不可重试类不写「稍后重试」', () => {
    for (const category of NINE) {
      const spec = FAILURE_CATEGORY_SPECS[category]
      if (spec.retryable) {
        expect(/重试|稍后|刷新/.test(spec.message), `${category} 可重试但未给出重试时机`).toBe(true)
      } else {
        expect(
          spec.message.includes('稍后重试'),
          `${category} 不可重试却写「稍后重试」会误导用户重复操作`,
        ).toBe(false)
      }
    }
  })

  it('权限与不存在分别给出「联系管理员」「刷新」的恢复动作', () => {
    expect(categoryMessage('PERMISSION_DENIED')).toContain('管理员')
    expect(categoryMessage('OBJECT_NOT_FOUND')).toContain('刷新')
    expect(isRetryable('PERMISSION_DENIED')).toBe(false)
    expect(isRetryable('BUSINESS_CONFLICT')).toBe(true)
  })
})
