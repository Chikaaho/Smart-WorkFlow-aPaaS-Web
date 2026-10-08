import { describe, expect, it } from 'vitest'
import {
  buildActionConfig,
  buildTriggerConfig,
  buildVariableDef,
  compatibleVariableTypes,
  emptyActionDraft,
  emptyBranchDraft,
  emptyTriggerDraft,
  emptyVariableDraft,
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
