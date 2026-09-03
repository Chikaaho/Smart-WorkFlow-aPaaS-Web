import type { BpmNodeCapability } from '@/contracts/bpm-node'

/**
 * P57 mock 能力清单：只放已完整贯通设计/保存/发布/运行的三类既有节点。
 * CONDITION/网关等预留节点不伪造成可用能力，待后续完整实现后再进入清单。
 */
export const MOCK_WORKFLOW_NODE_CAPABILITIES: BpmNodeCapability[] = [
  {
    type: 'START',
    displayName: '开始',
    description: '流程唯一入口节点。',
    category: 'EVENT',
    version: 'p57-v1',
    topology: { minIncoming: 0, maxIncoming: 0, minOutgoing: 1, maxOutgoing: 1 },
    configFields: [],
    supports: { design: true, save: true, publish: true, run: true },
  },
  {
    type: 'END',
    displayName: '结束',
    description: '流程唯一结束节点。',
    category: 'EVENT',
    version: 'p57-v1',
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
    version: 'p57-v1',
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
]
