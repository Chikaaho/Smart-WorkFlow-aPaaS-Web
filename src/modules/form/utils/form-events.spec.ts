import { describe, expect, it, vi } from 'vitest'
import type { FormEventAction, FormSchema } from '@/contracts/form-schema'
import { normalizeFormEvents } from '@/contracts/form-schema'
import { createFormEvents, validateFormEvents } from './form-events'

function action(id: string, order: number, script: string, enabled = true): FormEventAction {
  return { id, name: id, order, enabled, script }
}

function schema(events: FormSchema['events']): FormSchema {
  return {
    title: '事件测试',
    fields: [{ name: 'count', type: 'NUMBER', required: false }],
    events,
  }
}

describe('form events', () => {
  it('normalizes old and new definitions without adding implicit actions', () => {
    expect(normalizeFormEvents(undefined)).toBeUndefined()
    expect(
      normalizeFormEvents({
        onLoad: [{ id: 'load', script: 'return true', enabled: false }],
        unknown: [{ id: 'ignored', script: '' }],
      }),
    ).toEqual({
      onLoad: [{ id: 'load', name: 'load', enabled: false, order: 0, script: 'return true' }],
    })
  })

  it('runs enabled actions by order and rejects duplicate ids', async () => {
    const calls: string[] = []
    const runtime = createFormEvents({
      getSchema: () =>
        schema({
          onLoad: [
            action('second', 2, 'return #提示消息("second")'),
            action('disabled', 0, 'return #提示消息("disabled")', false),
            action('first', 1, 'return #提示消息("first")'),
          ],
        }),
      model: {},
      notify: (_kind, message) => calls.push(message),
    })
    expect(await runtime.runOnLoad()).toMatchObject({ ok: true, event: 'onLoad' })
    expect(calls).toEqual(['first', 'second'])
    expect(
      validateFormEvents({
        onLoad: [action('same', 0, 'return true'), action('same', 1, 'return true')],
      }),
    ).toContain('onLoad: 动作 ID 重复「same」')
  })

  it('blocks submit when an action returns false', async () => {
    const after = vi.fn()
    const runtime = createFormEvents({
      getSchema: () =>
        schema({
          beforeSubmitHandler: [
            action('stop', 0, 'return false'),
            action('unreachable', 1, 'return #提示消息("unreachable")'),
          ],
        }),
      model: {},
      notify: after,
    })
    const result = await runtime.runBeforeSubmit()
    expect(result.ok).toBe(false)
    expect(result.actionId).toBe('stop')
    expect(after).not.toHaveBeenCalled()
  })

  it('retries only failed post-submit actions for the same submission', async () => {
    const model = { count: 0 }
    const events = schema({
      afterSubmitHandler: [
        action('increment', 0, '#设置字段值(count, #获取字段值(count) + 1)'),
        action('missing', 1, 'return #获取字段值(not_exists)'),
      ],
    })
    const runtime = createFormEvents({ getSchema: () => events, model })
    expect(await runtime.runAfterSubmit('record-1')).toMatchObject({
      ok: false,
      actionId: 'missing',
    })
    expect(model.count).toBe(1)

    events.events!.afterSubmitHandler![1].script = 'return true'
    expect(await runtime.runAfterSubmit('record-1', true)).toMatchObject({ ok: true })
    expect(model.count).toBe(1)
  })

  it('rejects write effects in a read-only view', async () => {
    const model = { count: 0 }
    const runtime = createFormEvents({
      getSchema: () => schema({ onLoad: [action('write', 0, '#设置字段值(count, 1)')] }),
      model,
      writable: () => false,
    })
    const result = await runtime.runOnLoad()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('只读')
    expect(model.count).toBe(0)
  })

  it('allows authorized integration after submit while field writes stay locked', async () => {
    const integration = vi.fn(() => 'ok')
    const runtime = createFormEvents({
      getSchema: () =>
        schema({ afterSubmitHandler: [action('audit', 0, 'return #调用集成(sync_audit)')] }),
      model: { count: 1 },
      writable: () => false,
      sideEffectsAllowed: () => true,
      allowedIntegrations: () => ['sync_audit'],
      callIntegration: integration,
    })
    expect(await runtime.runAfterSubmit('record-1')).toMatchObject({ ok: true })
    expect(integration).toHaveBeenCalledWith('sync_audit', {})
  })
})
