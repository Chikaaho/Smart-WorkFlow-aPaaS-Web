import { describe, expect, it } from 'vitest'

import {
  buildActionConfig,
  buildTriggerConfig,
  buildVariableDef,
  canRetryActionRefStatus,
  childItemStatusKind,
  compatibleVariableTypes,
  emptyActionDraft,
  emptyBranchDraft,
  emptyTriggerDraft,
  emptyVariableDraft,
  toTriggerDraft,
  validateChildActionDraft,
  validateTriggerDraft,
  validateVariableDraft,
} from './p64-orchestration'

describe('p64-orchestration 变量草稿', () => {
  it('buildVariableDef：NODE_FORM 保留节点与字段，其余来源丢弃节点键', () => {
    const nodeForm = buildVariableDef({
      ...emptyVariableDraft(),
      varId: 'v_set',
      name: '处理人集合',
      type: 'USER_SET',
      source: 'NODE_FORM',
      sourceNodeKey: 'node_qc',
      sourceFormField: 'handlers',
      aggregation: 'UNION',
    })
    expect(nodeForm).toEqual({
      varId: 'v_set',
      name: '处理人集合',
      type: 'USER_SET',
      source: 'NODE_FORM',
      sourceField: undefined,
      sourceNodeKey: 'node_qc',
      sourceFormField: 'handlers',
      roundRule: 'CURRENT',
      aggregation: 'UNION',
      nullable: false,
    })

    const mainForm = buildVariableDef({
      ...emptyVariableDraft(),
      varId: 'v_title',
      type: 'STRING',
      source: 'MAIN_FORM',
      sourceField: 'title',
      sourceNodeKey: 'should-drop',
    })
    expect(mainForm.sourceNodeKey).toBeUndefined()
  })

  it('validateVariableDraft：重复 ID/空字段逐项拒绝；集合 UNION 由 buildVariableDef 自动对齐', () => {
    const errors = validateVariableDraft(
      {
        ...emptyVariableDraft(),
        varId: 'dup',
        type: 'USER_SET',
        source: 'NODE_FORM',
        aggregation: 'NONE',
      },
      ['dup'],
    )
    expect(errors).toContain('变量引用 ID 重复: dup')
    expect(errors).toContain('节点表单来源必须选择节点')
    expect(errors).toContain('节点表单来源必须选择字段')
    // 集合类型的 UNION 由 buildVariableDef 自动对齐（服务端发布校验仍为权威）
    expect(
      buildVariableDef({
        ...emptyVariableDraft(),
        varId: 'v2',
        type: 'USER_SET',
        aggregation: 'NONE',
      }).aggregation,
    ).toBe('UNION')
  })

  it('compatibleVariableTypes：USER 多选只能映射 USER_SET；TABLE 映射 ROWS', () => {
    expect(compatibleVariableTypes('USER', true)).toEqual(['USER_SET'])
    expect(compatibleVariableTypes('USER', false)).toEqual(['USER', 'USER_SET'])
    expect(compatibleVariableTypes('TABLE', false)).toEqual(['ROWS'])
    expect(compatibleVariableTypes('NUMBER', false)).toEqual(['NUMBER'])
    expect(compatibleVariableTypes('BOOL', false)).toEqual(['BOOLEAN'])
  })
})

describe('p64-orchestration 触发器草稿', () => {
  it('buildTriggerConfig：PROCESS_COMPLETED 丢弃 nodeKey；映射字面量按 JSON 解释', () => {
    const action = buildActionConfig({
      ...emptyActionDraft(),
      actionId: 'act-1',
      type: 'START_SINGLE',
      targetProcessDefKey: 'def_target',
      targetFormKey: 'target_form',
      mapping: [{ targetField: 'reason', sourceVarId: '', itemField: '', literal: '12' }],
    })
    expect(action.mapping).toEqual([{ targetField: 'reason', literal: 12 }])
    expect(action.sourceVariable).toBeUndefined()

    const config = buildTriggerConfig({
      ...emptyTriggerDraft(),
      triggerId: 'trg-1',
      event: 'PROCESS_COMPLETED',
      nodeKey: 'node_qc',
      branches: [
        { ...emptyBranchDraft(), branchId: 'b1', matchType: 'BOOLEAN', matchValue: 'true' },
      ],
    })
    expect(config.nodeKey).toBeUndefined()
    expect(config.branches[0]?.matchType).toBe('BOOLEAN')
  })

  it('validateTriggerDraft：重复分支/同类型同值重复/集合动作缺来源/未授权变量拒绝', () => {
    const base = emptyTriggerDraft()
    const errors = validateTriggerDraft(
      {
        ...base,
        triggerId: 'dup',
        event: 'TASK_SUBMITTED',
        nodeKey: '',
        script: 'const x = 1;',
        variables: ['ghost'],
        branches: [
          {
            ...emptyBranchDraft(),
            branchId: 'b1',
            matchType: 'NUMBER',
            matchValue: '1',
            actions: [
              {
                ...emptyActionDraft(),
                actionId: 'a1',
                type: 'START_EACH',
                sourceVariable: '',
                targetFormKey: '',
                targetProcessDefKey: '',
                maxDispatch: 0,
              },
            ],
          },
          {
            ...emptyBranchDraft(),
            branchId: 'b1',
            matchType: 'NUMBER',
            matchValue: '1',
            actions: [],
          },
        ],
      },
      ['dup'],
      ['v_real'],
      ['node_qc'],
    )
    expect(errors).toContain('触发器 ID 重复: dup')
    expect(errors).toContain('该事件必须绑定源节点')
    expect(errors).toContain('脚本体必须包含 return 语句')
    expect(errors).toContain('授权了未定义变量: ghost')
    expect(errors).toContain('分支 ID 重复: b1')
    expect(errors).toContain('存在同类型同值重复分支: NUMBER=1')
    expect(errors).toContain('动作 a1: 集合动作必须选择来源变量')
    expect(errors).toContain('动作 a1: 必须选择目标流程与表单')
    expect(errors).toContain('动作 a1: 派发上限必须在 1—200 内')
  })
})

describe('canRetryActionRefStatus 恢复入口可见性（复审06/提示05 P1-08a-W）', () => {
  it('合法恢复窗口：FAILED / INTENT_SUBMITTED / STARTING（含新增 STARTING 窗口）', () => {
    expect(canRetryActionRefStatus('FAILED')).toBe(true)
    expect(canRetryActionRefStatus('INTENT_SUBMITTED')).toBe(true)
    expect(canRetryActionRefStatus('STARTING')).toBe(true)
  })

  it('已成功启动与其余终态不渲染恢复入口（后端按持久事实二次拒绝）', () => {
    expect(canRetryActionRefStatus('STARTED')).toBe(false)
    expect(canRetryActionRefStatus('COMPLETED')).toBe(false)
    expect(canRetryActionRefStatus('REJECTED')).toBe(false)
    expect(canRetryActionRefStatus('')).toBe(false)
    expect(canRetryActionRefStatus('starting')).toBe(false)
  })
})

describe('P64 阶段Ⅱ：CHILD 子流程配置校验（与后端发布校验同口径）', () => {
  it('非 CHILD 动作零校验（阶段Ⅰ零行为）', () => {
    expect(validateChildActionDraft({ actionId: 'a', type: 'START_EACH' } as never)).toEqual([])
  })

  it('等待策略枚举与 COUNT K 正整数校验', () => {
    expect(
      validateChildActionDraft({ actionId: 'a', orchestration: 'CHILD', waitPolicy: 'SOMETIMES' }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({ actionId: 'a', orchestration: 'CHILD', waitPolicy: 'COUNT' }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({
        actionId: 'a',
        orchestration: 'CHILD',
        waitPolicy: 'COUNT',
        waitCount: 5,
        maxDispatch: 3,
      }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({ actionId: 'a', orchestration: 'CHILD', waitPolicy: 'NONE' }),
    ).toEqual([])
  })

  it('回写结构校验：行级回写三件套与字段映射非空', () => {
    expect(
      validateChildActionDraft({
        actionId: 'a',
        orchestration: 'CHILD',
        waitPolicy: 'ALL',
        writeBack: {},
      }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({
        actionId: 'a',
        orchestration: 'CHILD',
        waitPolicy: 'ALL',
        writeBack: { resultNodeKey: 'node_result', tableField: 'result_table' },
      }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({
        actionId: 'a',
        orchestration: 'CHILD',
        waitPolicy: 'ALL',
        writeBack: {
          resultNodeKey: 'node_result',
          tableField: 'result_table',
          rowKeyField: 'id',
          parentTableField: 'parent_table',
          fields: [],
        },
      }),
    ).toHaveLength(1)
    expect(
      validateChildActionDraft({
        actionId: 'a',
        orchestration: 'CHILD',
        waitPolicy: 'ALL',
        writeBack: {
          resultNodeKey: 'node_result',
          tableField: 'result_table',
          rowKeyField: 'id',
          parentTableField: 'parent_table',
          fields: [{ fromField: 'feedback', toField: 'feedback' }],
        },
      }),
    ).toEqual([])
  })

  it('批次项状态语义分组（等待/成功/挂起/失败/留痕）', () => {
    expect(childItemStatusKind('DISPATCHED')).toBe('pending')
    expect(childItemStatusKind('WRITTEN')).toBe('success')
    expect(childItemStatusKind('CONFLICT')).toBe('suspended')
    expect(childItemStatusKind('FAILED')).toBe('failed')
    expect(childItemStatusKind('REFUSED')).toBe('failed')
    expect(childItemStatusKind('LATE')).toBe('recorded')
  })
})

describe('P64 阶段Ⅱ：CHILD 动作构建与回读（设计器草稿往返）', () => {
  it('buildActionConfig：CHILD + COUNT + 行级/主记录回写序列化；非 CHILD 零字段', () => {
    const draft = emptyActionDraft()
    draft.actionId = 'act_child'
    draft.type = 'START_EACH'
    draft.sourceVariable = 'var_rows'
    draft.targetProcessDefKey = 'child_def'
    draft.targetFormKey = 'child_form'
    draft.orchestration = 'CHILD'
    draft.waitPolicy = 'COUNT'
    draft.waitCount = 2
    draft.wbEnabled = true
    draft.wbResultNodeKey = 'node_result'
    draft.wbTableField = 'result_table'
    draft.wbRowKeyField = 'id'
    draft.wbParentTableField = 'parent_table'
    draft.wbFields = [{ fromField: 'feedback', toField: 'feedback' }]
    draft.wbMainFields = [{ fromField: 'summary', toField: 'summary' }]
    const cfg = buildActionConfig(draft)
    expect(cfg.orchestration).toBe('CHILD')
    expect(cfg.waitPolicy).toBe('COUNT')
    expect(cfg.waitCount).toBe(2)
    expect(cfg.writeBack?.resultNodeKey).toBe('node_result')
    expect(cfg.writeBack?.fields).toEqual([{ fromField: 'feedback', toField: 'feedback' }])
    expect(cfg.writeBack?.mainFields).toEqual([{ fromField: 'summary', toField: 'summary' }])

    draft.orchestration = ''
    const plain = buildActionConfig(draft)
    expect(plain.orchestration).toBeUndefined()
    expect(plain.writeBack).toBeUndefined()
  })

  it('toTriggerDraft：CHILD 配置回读不丢（等待策略/回写映射）', () => {
    const trigger = emptyTriggerDraft()
    trigger.triggerId = 'trg_1'
    trigger.nodeKey = 'node_1'
    const draft = emptyActionDraft()
    draft.actionId = 'act_child'
    draft.orchestration = 'CHILD'
    draft.waitPolicy = 'ANY'
    draft.wbEnabled = true
    draft.wbResultNodeKey = 'node_result'
    draft.wbFields = [{ fromField: 'feedback', toField: 'feedback' }]
    draft.wbMainFields = [{ fromField: '', toField: '' }]
    trigger.branches = [
      { branchId: 'b1', name: '', matchType: 'STRING', matchValue: 'x', actions: [draft] },
    ]
    const round = toTriggerDraft({ ...buildTriggerConfig(trigger) })
    expect(round.branches[0].actions[0].orchestration).toBe('CHILD')
    expect(round.branches[0].actions[0].waitPolicy).toBe('ANY')
    expect(round.branches[0].actions[0].wbEnabled).toBe(true)
    expect(round.branches[0].actions[0].wbResultNodeKey).toBe('node_result')
    expect(round.branches[0].actions[0].wbFields[0]).toEqual({
      fromField: 'feedback',
      toField: 'feedback',
    })
  })
})
