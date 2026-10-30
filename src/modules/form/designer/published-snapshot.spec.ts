import { describe, expect, it } from 'vitest'
import {
  snapshotNodeAdvancedEntries,
  snapshotNodeConditionText,
  snapshotNodeFieldPermissions,
  snapshotNodeFieldStates,
  snapshotNodeFormOf,
  snapshotNodeInlineScripts,
  snapshotNodeOperations,
  snapshotNodeTriggerBindings,
  snapshotOpinionFormOf,
  snapshotParticipantOf,
  snapshotValueText,
} from './published-snapshot'

describe('published-snapshot 冻结节点配置投影', () => {
  it('参与人来源只读真实策略与值，旧 approver 回退保持原值', () => {
    expect(
      snapshotParticipantOf({ participant: { strategy: 'FIXED_USER', value: ['9001'] } }),
    ).toEqual({ strategy: 'FIXED_USER', value: ['9001'], adapterId: '' })
    expect(
      snapshotParticipantOf({ approver: { type: 'EXPRESSION', value: 'return ["2"];' } }),
    ).toEqual({ strategy: 'EXPRESSION', value: 'return ["2"];', adapterId: '' })
    expect(
      snapshotParticipantOf({
        participant: {
          strategy: 'FORM_FIELD',
          value: { objectType: 'USER', scope: 'MAIN', field: 'owner' },
        },
      }),
    ).toEqual({
      strategy: 'FORM_FIELD',
      value: { objectType: 'USER', scope: 'MAIN', field: 'owner' },
      adapterId: '',
    })
    expect(
      snapshotParticipantOf({ participant: { strategy: 'ADAPTER', adapterId: 'adp-1' } }),
    ).toEqual({
      strategy: 'ADAPTER',
      value: 'adp-1',
      adapterId: 'adp-1',
    })
  })

  it('条件只认真实条件键，缺值返回空串', () => {
    expect(snapshotNodeConditionText({ condition: 'amount > 100' })).toBe('amount > 100')
    expect(snapshotNodeConditionText({ expression: 'x == 1' })).toBe('x == 1')
    expect(
      snapshotNodeConditionText({ condition: { field: 'amount', op: 'GT', value: 100 } }),
    ).toBe('field=amount · op=GT · value=100')
    expect(snapshotNodeConditionText({ name: '审批' })).toBe('')
  })

  it('意见表单/节点表单只读真实冻结对象', () => {
    expect(
      snapshotOpinionFormOf({
        opinionForm: {
          formId: 'U020_OPINION',
          version: '1',
          fields: [
            { key: 'comment', label: '审批意见', type: 'TEXTAREA', required: true },
            { key: 'assignee', label: '指定人员', type: 'USER' },
          ],
        },
      }),
    ).toEqual({
      formId: 'U020_OPINION',
      version: '1',
      fields: [
        { key: 'comment', label: '审批意见', type: 'TEXTAREA', required: true },
        { key: 'assignee', label: '指定人员', type: 'USER', required: false },
      ],
    })
    expect(snapshotOpinionFormOf({})).toBeNull()
    expect(
      snapshotNodeFormOf({ nodeForm: { formKey: 'u020_opinion_business', formVersion: 3 } }),
    ).toEqual({
      formKey: 'u020_opinion_business',
      formVersion: '3',
    })
    expect(snapshotNodeFormOf({})).toBeNull()
  })

  it('字段权限读取节点字段三态与字段主体权限；无值返回空数组', () => {
    expect(
      snapshotNodeFieldStates({
        fieldStates: { title: { required: true, editable: false, hidden: false } },
      }),
    ).toEqual([{ field: 'title', required: true, editable: false, hidden: false }])
    expect(
      snapshotNodeFieldPermissions({
        fieldPermissions: { title: { view: ['role:buyer'], edit: ['role:purchaser'] } },
      }),
    ).toEqual([{ field: 'title', view: ['role:buyer'], edit: ['role:purchaser'] }])
    expect(snapshotNodeFieldStates({})).toEqual([])
    expect(snapshotNodeFieldPermissions({})).toEqual([])
  })

  it('节点内联脚本按真实 script/expression 键收集，含 listeners 条目', () => {
    const rows = snapshotNodeInlineScripts({
      name: '审批',
      participant: { strategy: 'EXPRESSION', value: 'return ["2"];' },
      participantScript: 'return ["3"];',
      listeners: [{ label: '审批完成监听', script: 'return true;' }],
    })
    expect(rows).toEqual([
      { key: 'participantScript', code: 'return ["3"];' },
      { key: 'listeners[0].script', code: 'return true;' },
    ])
  })

  it('节点开始前绑定只认指向该节点的 NODE_ENTERING/NODE_BEFORE，全局发起监听不冒充', () => {
    const graph = {
      triggers: [
        {
          triggerId: 'global_start',
          name: '流程发起标记',
          event: 'PROCESS_START',
          nodeKey: null,
          script: '设置流程变量("x", 1)',
        },
        {
          triggerId: 'node_enter',
          name: '节点开始前触发',
          event: 'NODE_ENTERING',
          nodeKey: 'node_1',
          script: 'return true;',
        },
        {
          triggerId: 'legacy_before',
          name: '旧节点前置',
          event: 'NODE_BEFORE',
          target: 'node_1',
          script: 'return 1;',
        },
        {
          triggerId: 'other_node',
          name: '其他节点',
          event: 'NODE_ENTERING',
          nodeId: 'node_2',
          script: 'return 2;',
        },
      ],
    }
    expect(snapshotNodeTriggerBindings(graph, 'node_1')).toEqual([
      {
        triggerId: 'node_enter',
        name: '节点开始前触发',
        event: 'NODE_ENTERING',
        script: 'return true;',
      },
      {
        triggerId: 'legacy_before',
        name: '旧节点前置',
        event: 'NODE_BEFORE',
        script: 'return 1;',
      },
    ])
    expect(snapshotNodeTriggerBindings(graph, 'node_3')).toEqual([])
    expect(
      snapshotNodeTriggerBindings({ triggers: [{ event: 'PROCESS_START' }] }, 'node_1'),
    ).toEqual([])
  })

  it('高级/操作配置取真实允许操作、退回目标与剩余冻结键', () => {
    expect(
      snapshotNodeOperations({
        allowedActions: ['APPROVE', 'REJECT'],
        returnTargets: ['start'],
      }),
    ).toEqual({ allowedActions: ['APPROVE', 'REJECT'], returnTargets: ['start'] })
    expect(
      snapshotNodeAdvancedEntries({
        name: '审批',
        participant: { strategy: 'FIXED_USER', value: ['9001'] },
        opinionForm: { formId: 'F' },
        allowedActions: ['APPROVE'],
        deadline: { dueMinutes: 30 },
        listeners: [{ label: '审批完成监听', script: 'return true;' }],
      }),
    ).toEqual([
      { key: 'deadline', value: { dueMinutes: 30 } },
      { key: 'listeners', value: [{ label: '审批完成监听', script: 'return true;' }] },
    ])
  })

  it('冻结值文本保持真实值，不把对象空壳当已配置', () => {
    expect(snapshotValueText(['9001', '9002'])).toBe('9001、9002')
    expect(snapshotValueText({ objectType: 'USER', scope: 'MAIN', field: 'owner' })).toBe(
      'objectType=USER · scope=MAIN · field=owner',
    )
    expect(snapshotValueText({})).toBe('')
    expect(snapshotValueText('')).toBe('')
    expect(snapshotValueText(0)).toBe('0')
  })
})
