import { describe, expect, it } from 'vitest'
import { effectiveFieldState, setFieldState, type NodeFieldStates } from './node-field-states'

/**
 * BF20261013-013：节点字段三态（必填/编辑/隐藏）。
 * 未配置继承表单定义；任一维调整即三维固化；不就地修改入参。
 */
describe('node-field-states 节点字段三态', () => {
  it('未配置时继承表单定义：必填=表单必填、编辑=开、隐藏=关', () => {
    expect(effectiveFieldState(undefined, { name: 'a', required: true })).toEqual({
      required: true,
      editable: true,
      hidden: false,
    })
    expect(effectiveFieldState(undefined, { name: 'b' })).toEqual({
      required: false,
      editable: true,
      hidden: false,
    })
  })

  it('已配置字段用显式值覆盖表单默认', () => {
    const states: NodeFieldStates = {
      a: { required: false, editable: false, hidden: true },
    }
    expect(effectiveFieldState(states, { name: 'a', required: true })).toEqual({
      required: false,
      editable: false,
      hidden: true,
    })
  })

  it('调整某一维：三维一并固化且不修改入参', () => {
    const states: NodeFieldStates = { a: { required: true, editable: true, hidden: false } }
    const next = setFieldState(states, { name: 'a', required: true }, 'hidden', true)
    expect(next.a).toEqual({ required: true, editable: true, hidden: true })
    expect(states.a).toEqual({ required: true, editable: true, hidden: false })
  })

  it('对未配置字段调整某一维：其余维取表单默认值固化', () => {
    const next = setFieldState(undefined, { name: 'c', required: true }, 'editable', false)
    expect(next.c).toEqual({ required: true, editable: false, hidden: false })
  })

  it('多字段互不影响', () => {
    const first = setFieldState(undefined, { name: 'a' }, 'hidden', true)
    const second = setFieldState(first, { name: 'b' }, 'required', true)
    expect(Object.keys(second).sort()).toEqual(['a', 'b'])
    expect(second.a?.hidden).toBe(true)
    expect(second.b?.required).toBe(true)
  })
})
