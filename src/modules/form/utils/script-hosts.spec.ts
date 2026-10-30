import { describe, expect, it } from 'vitest'
import {
  createSupplementalHostFunctions,
  type ScriptOrgContext,
  type ScriptSchemaFieldLike,
} from './script-hosts'

/* DR06 缺口（direction-ui-completion-020）：
 * 组织关联查询（已授权快照）/ 日期计算 / 明细控件选项，同步宿主、语义明确。 */

const schema: { fields: ScriptSchemaFieldLike[] } = {
  fields: [
    { name: 'title', label: '标题', type: 'TEXT' },
    {
      name: 'items',
      label: '明细',
      type: 'TABLE',
      subFields: [
        {
          name: 'status',
          label: '状态',
          type: 'DICT',
          options: [
            { value: 'open', key: 'open' },
            { value: 'done', key: 'done' },
          ],
        },
        { name: 'qty', label: '数量', type: 'NUMBER' },
      ],
    },
  ],
}

const org: ScriptOrgContext = {
  users: [
    { id: '1001', name: '张三', deptId: '10', roleIds: ['100'], postIds: ['200'] },
    { id: '1002', name: '李四', deptId: '11', roleIds: ['101'], postIds: ['201'] },
  ],
  depts: [
    { id: '10', name: '总部', parentId: null },
    { id: '11', name: '研发部', parentId: '10' },
  ],
  roles: [
    { id: '100', code: 't100_admin', name: '租户管理员' },
    { id: '101', code: 't100_reader', name: '查看员' },
  ],
  posts: [
    { id: '200', code: 'post_lead', name: '负责人' },
    { id: '201', code: 'post_staff', name: '经办人' },
  ],
}

function hosts(context: ScriptOrgContext | null = org) {
  return createSupplementalHostFunctions(
    () => schema,
    () => context,
  ) as Record<string, (...args: unknown[]) => unknown>
}

describe('script-hosts 组织关联查询', () => {
  it('用户信息按稳定ID命中，未命中返回 null', () => {
    const h = hosts()
    expect(h['获取用户信息']('1001')).toEqual({ id: '1001', name: '张三' })
    expect(h['获取用户信息']('9999')).toBeNull()
    expect(h['getUserInfo']('1002')).toEqual({ id: '1002', name: '李四' })
  })

  it('查询用户按姓名/ID过滤，无匹配返回空数组', () => {
    const h = hosts()
    expect(h['查询用户']('张')).toEqual(['1001'])
    expect(h['查询用户']('1002')).toEqual(['1002'])
    expect(h['查询用户']('王五')).toEqual([])
    expect(h['searchUsers']('')).toEqual(['1001', '1002'])
  })

  it('部门成员按主部门过滤，无成员返回空数组', () => {
    const h = hosts()
    expect(h['获取部门成员']('10')).toEqual(['1001'])
    expect(h['获取部门成员']('11')).toEqual(['1002'])
    expect(h['获取部门成员']('99')).toEqual([])
    expect(() => hosts(null)['获取部门成员']('10')).toThrow('组织目录未装载')
  })

  it('部门信息/上级部门/部门列表来自授权部门树快照', () => {
    const h = hosts()
    expect(h['获取部门信息']('11')).toEqual({ id: '11', name: '研发部', parentId: '10' })
    expect(h['获取部门信息']('99')).toBeNull()
    expect(h['获取上级部门']('11')).toBe('10')
    expect(h['获取上级部门']('10')).toBeNull()
    expect(h['获取部门列表']()).toEqual(['10', '11'])
  })

  it('角色目录按 ID/编码查询，成员关系来自有效快照', () => {
    const h = hosts()
    expect(h['获取角色信息']('t100_admin')).toEqual({
      id: '100',
      code: 't100_admin',
      name: '租户管理员',
    })
    expect(h['获取角色名称']('101')).toBe('查看员')
    expect(h['获取角色成员']('t100_admin')).toEqual(['1001'])
    expect(h['查询角色']('查看')).toEqual(['101'])
    expect(h['获取角色列表']()).toEqual(['100', '101'])
    expect(h['获取用户角色']('1002')).toEqual(['101'])
    expect(h['获取用户角色编码']('1002')).toEqual(['t100_reader'])
    expect(h['获取角色信息']('missing')).toBeNull()
  })

  it('岗位目录按 ID/编码查询，成员关系来自有效快照', () => {
    const h = hosts()
    expect(h['获取岗位信息']('post_lead')).toEqual({
      id: '200',
      code: 'post_lead',
      name: '负责人',
    })
    expect(h['获取岗位名称']('201')).toBe('经办人')
    expect(h['获取岗位成员']('post_staff')).toEqual(['1002'])
    expect(h['查询岗位']('负责')).toEqual(['200'])
    expect(h['获取岗位列表']()).toEqual(['200', '201'])
    expect(h['获取用户岗位']('1001')).toEqual(['200'])
    expect(h['获取用户岗位编码']('1001')).toEqual(['post_lead'])
    expect(h['获取岗位信息']('missing')).toBeNull()
  })

  it('用户部门查询复用同一授权快照', () => {
    const h = hosts()
    expect(h['获取用户部门']('1001')).toBe('10')
    expect(h['获取用户部门名称']('1002')).toBe('研发部')
    expect(h['获取用户部门']('missing')).toBeNull()
  })

  it('组织快照未装载时明确报错，不返回猜测数据', () => {
    const h = hosts(null)
    expect(() => h['获取用户信息']('1001')).toThrow('组织目录未装载')
    expect(() => h['获取部门列表']()).toThrow('组织目录未装载')
    expect(() => h['获取角色列表']()).toThrow('组织目录未装载')
    expect(() => h['获取岗位列表']()).toThrow('组织目录未装载')
  })

  it('旧快照缺少角色/岗位目录时，相关查询明确报错而不是返回空猜测', () => {
    const legacy = hosts({ users: org.users, depts: org.depts })
    expect(() => legacy['获取角色列表']()).toThrow('角色目录未装载')
    expect(() => legacy['获取岗位列表']()).toThrow('岗位目录未装载')
  })
})

describe('script-hosts 日期计算', () => {
  it('当前日期/当前时间使用稳定格式', () => {
    const h = hosts()
    expect(h['当前日期']()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(h['当前时间']()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('日期加减跨月跨年正确', () => {
    const h = hosts()
    expect(h['日期加减']('2026-01-31', 1)).toBe('2026-02-01')
    expect(h['日期加减']('2026-12-31', 1)).toBe('2027-01-01')
    expect(h['日期加减']('2026-03-01', -1)).toBe('2026-02-28')
    expect(h['addDays']('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('日期差返回整天数，非法输入明确报错', () => {
    const h = hosts()
    expect(h['日期差']('2026-01-01', '2026-01-08')).toBe(7)
    expect(h['dateDiff']('2026-01-08', '2026-01-01')).toBe(-7)
    expect(() => h['日期加减']('2026/01/01', 1)).toThrow('无效日期')
    expect(() => h['日期差']('2026-01-01', 'not-a-date')).toThrow('无效日期')
    expect(() => h['日期加减']('2026-01-01', 'abc')).toThrow('不是数字')
  })
})

describe('script-hosts 明细控件选项', () => {
  it('返回子表列选项值；无选项列返回空数组；列不存在报错', () => {
    const h = hosts()
    expect(h['获取子表字段选项']('items', 'status')).toEqual(['open', 'done'])
    expect(h['获取子表字段选项']('items', 'qty')).toEqual([])
    expect(() => h['获取子表字段选项']('items', 'missing')).toThrow('不存在列')
    expect(() => h['获取子表字段选项']('title', 'status')).toThrow('不是子表')
    expect(h['getTableColumnOptions']('items', 'status')).toEqual(['open', 'done'])
  })
})
