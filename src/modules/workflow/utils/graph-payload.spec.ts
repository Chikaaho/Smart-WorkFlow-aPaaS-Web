import { describe, expect, it } from 'vitest'
import { buildDesignerGraphPayload } from './graph-payload'

const serialized = {
  processKey: 'bpm_demo',
  name: '演示流程',
  formKey: 'form_demo',
  elements: [{ id: 'START', type: 'START', name: '开始' }],
}

describe('buildDesignerGraphPayload', () => {
  it('保留 50:88 保存的结束通知，设计器保存/发布不覆盖为空', () => {
    const notification = {
      initiator: true,
      approvers: true,
      channels: ['IN_APP'],
      otherRecipientIds: [9101],
    }
    const payload = buildDesignerGraphPayload(serialized, {
      variables: [{ key: 'amount' }],
      triggers: [{ triggerId: 't1', event: 'NODE_ENTERING' }],
      notification,
    })

    expect(payload.notification).toBe(notification)
    expect(payload.variables).toEqual([{ key: 'amount' }])
    expect(payload.triggers).toEqual([{ triggerId: 't1', event: 'NODE_ENTERING' }])
    expect(payload.elements).toBe(serialized.elements)
  })

  it('旧定义没有通知配置时不新造 notification 字段', () => {
    const payload = buildDesignerGraphPayload(serialized, { variables: [], triggers: [] })
    expect('notification' in payload).toBe(false)
  })

  it('通知配置为 null 时同样不写入，避免把空值当成显式关闭', () => {
    const payload = buildDesignerGraphPayload(serialized, {
      variables: [],
      triggers: [],
      notification: null,
    })
    expect('notification' in payload).toBe(false)
  })
})
