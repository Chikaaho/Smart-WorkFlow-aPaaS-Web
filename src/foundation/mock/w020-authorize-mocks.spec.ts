import { describe, expect, it } from 'vitest'
import { dispatchMock } from './index'

async function mock<T>(method: string, url: string, body?: unknown) {
  return dispatchMock<T>(method, url, '/api', {}, body)
}

describe('W020 authorization rule mocks', () => {
  it('cancels a pending sign by its exact record id', async () => {
    const before = await mock<Array<{ recordId: string }>>('GET', '/workflow/sign/pending')
    expect(before?.data?.[0]?.recordId).toBe('2100424929376403701')

    await mock('POST', '/workflow/sign/2100424929376403701/cancel')
    const after = await mock<Array<{ recordId: string }>>('GET', '/workflow/sign/pending')
    expect(after?.data).toEqual([])
  })

  it('creates a rule with exact long ids and reads it back', async () => {
    const before = await mock<Array<{ id: string }>>('GET', '/workflow/authorize-rules')
    const beforeCount = before?.data?.length ?? 0
    const created = await mock<string>('POST', '/workflow/authorize-rules', {
      targetUserId: '2100424929376403458',
      scopeType: 'PROCESS',
      processDefKey: 'leave_approval',
    })

    expect(created?.code).toBe(0)
    expect(created?.data).toBe('2100424929376403602')
    const after = await mock<Array<{ id: string; agentId: string; processDefKey?: string }>>(
      'GET',
      '/workflow/authorize-rules',
    )
    expect(after?.data).toHaveLength(beforeCount + 1)
    expect(after?.data?.at(-1)).toMatchObject({
      agentId: '2100424929376403458',
      processDefKey: 'leave_approval',
    })
  })
})
