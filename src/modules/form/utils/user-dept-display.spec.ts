import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildUserDeptDisplays, fallbackValueDisplay } from './user-dept-display'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

vi.mock('@/modules/form/api/i2-choices', () => ({
  loadUserChoices: vi.fn(),
  loadDeptChoices: vi.fn(),
}))

import { loadUserChoices, loadDeptChoices } from '@/modules/form/api/i2-choices'

const userField: FormSchemaField = {
  name: 'owner',
  type: 'USER',
  label: '负责人',
} as unknown as FormSchemaField
const userMultiField: FormSchemaField = {
  name: 'watchers',
  type: 'USER',
  label: '关注人',
  multiple: true,
} as unknown as FormSchemaField
const deptMultiField: FormSchemaField = {
  name: 'dept_list',
  type: 'DEPT',
  label: '参与部门',
  multiple: true,
} as unknown as FormSchemaField
const textField: FormSchemaField = {
  name: 'topic',
  type: 'TEXT',
  label: '主题',
} as unknown as FormSchemaField

const schema: FormSchema = {
  title: 't',
  fields: [textField, userField, userMultiField, deptMultiField],
}

describe('user-dept-display（P63 G01 保存回读可读显示）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadUserChoices).mockResolvedValue([
      { id: '1', label: '系统管理员' },
      { id: '2', label: '张三' },
    ])
    vi.mocked(loadDeptChoices).mockResolvedValue([
      { id: '1', label: '　研发部' },
      { id: '2', label: '　市场部' },
    ])
  })

  it('单选 USER 显示姓名；多选 USER 顿号连接', async () => {
    const displays = await buildUserDeptDisplays(schema, {
      owner: 1,
      watchers: '["2","1"]',
      topic: 'x',
    })
    expect(displays.owner).toBe('系统管理员')
    expect(displays.watchers).toBe('张三、系统管理员')
  })

  it('多选 DEPT 显示部门名（去缩进）；未解析 ID 回退 #id', async () => {
    const displays = await buildUserDeptDisplays(schema, { dept_list: '["1","2"]' })
    expect(displays.dept_list).toBe('研发部、市场部')
    expect(displays.owner).toBeUndefined()
  })

  it('候选外 ID 回退；非 USER/DEPT 字段不解析', async () => {
    vi.mocked(loadUserChoices).mockResolvedValue([{ id: '1', label: '系统管理员' }])
    const displays = await buildUserDeptDisplays(schema, { owner: 999, watchers: '["1"]' })
    expect(displays.owner).toBe('#999')
    expect(displays.watchers).toBe('系统管理员')
  })

  it('无 USER/DEPT 字段时不请求候选且返回空映射', async () => {
    const only: FormSchema = { title: 't2', fields: [textField] }
    await buildUserDeptDisplays(only, { topic: 'x' })
    expect(loadUserChoices).not.toHaveBeenCalled()
    expect(loadDeptChoices).not.toHaveBeenCalled()
  })

  it('候选接口失败时码表为空，全部回退原值不阻断', async () => {
    vi.mocked(loadUserChoices).mockRejectedValue(new Error('boom'))
    vi.mocked(loadDeptChoices).mockRejectedValue(new Error('boom'))
    const displays = await buildUserDeptDisplays(schema, { owner: 1, dept_list: '["2"]' })
    expect(displays.owner).toBe('#1')
    expect(displays.dept_list).toBe('#2')
  })

  it('fallbackValueDisplay：空为 -,其余原样', () => {
    expect(fallbackValueDisplay(null)).toBe('-')
    expect(fallbackValueDisplay('["1","2"]')).toBe('["1","2"]')
  })
})
