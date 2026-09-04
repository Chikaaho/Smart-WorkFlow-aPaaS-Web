import type { BpmNodeCapability } from '@/contracts/bpm-node'

/**
 * P58 mock 能力清单：与后端统一节点注册结果同构，供隔离前端测试使用。
 * Mock 不改变真实后端能力权威，正式页面优先消费 /workflow/defs/node-capabilities。
 */
export const MOCK_WORKFLOW_NODE_CAPABILITIES: BpmNodeCapability[] = [
  {
    type: 'START',
    displayName: '开始',
    description: '流程唯一入口节点。',
    category: 'EVENT',
    version: '1',
    topology: { minIncoming: 0, maxIncoming: 0, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'END',
    displayName: '结束',
    description: '流程唯一结束节点。',
    category: 'EVENT',
    version: '1',
    topology: {
      minIncoming: 1,
      maxIncoming: 2147483647,
      minOutgoing: 0,
      maxOutgoing: 0,
    },
    configFields: [],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'APPROVAL',
    displayName: '审批',
    description: '由指定审批人处理的人工审批节点。',
    category: 'TASK',
    version: '2',
    topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [
      {
        key: 'name',
        label: '节点名称',
        type: 'TEXT',
        required: false,
      },
      {
        key: 'approver',
        label: '审批人',
        type: 'APPROVER',
        required: true,
        validation: { approverTypes: ['DESIGNATED'] },
      },
    ],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'CONSENSUS',
    displayName: '会签',
    description: '多人并行审批并按结算方式结束节点。',
    category: 'TASK',
    version: 'p58-v1',
    topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [
      { key: 'participant', label: '参与人', type: 'PARTICIPANT', required: true },
      {
        key: 'mode',
        label: '结算方式',
        type: 'SELECT',
        required: true,
        validation: { values: ['ALL', 'ANY', 'RATIO'] },
      },
      {
        key: 'ratio',
        label: '通过比例',
        type: 'NUMBER',
        required: false,
        validation: { min: 1, max: 100 },
      },
    ],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'CONDITION',
    displayName: '条件分支',
    description: '按受控条件选择一条出口。',
    category: 'GATEWAY',
    version: 'p58-v1',
    topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 2, maxOutgoing: 2147483647 },
    configFields: [{ key: 'name', label: '节点名称', type: 'TEXT', required: false }],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'COPY',
    displayName: '抄送',
    description: '向命中的全部参与人发送站内信并记录收件快照。',
    category: 'TASK',
    version: 'p58-v1',
    topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [{ key: 'participant', label: '参与人', type: 'PARTICIPANT', required: true }],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'NOTIFICATION',
    displayName: '通知',
    description: '经统一通知门面发送站内信或预留渠道消息。',
    category: 'TASK',
    version: 'p58-v1',
    topology: { minIncoming: 1, maxIncoming: 1, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [{ key: 'participant', label: '参与人', type: 'PARTICIPANT', required: true }],
    supports: { design: true, save: true, publish: true, run: true },
  },
]
