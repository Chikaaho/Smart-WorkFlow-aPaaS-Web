/**
 * 字典种子：字典数据与字典类型。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const MOCK_DICT_DATA: Record<string, { label: string; code: string }[]> = {
  sex: [
    { label: '男', code: 'MALE' },
    { label: '女', code: 'FEMALE' },
  ],
  status: [
    { label: '待审批', code: 'PENDING' },
    { label: '已通过', code: 'APPROVED' },
    { label: '已驳回', code: 'REJECTED' },
  ],
  dept: [
    { label: '技术部', code: 'TECH' },
    { label: '科技运营部', code: 'TECH_OPS' },
    { label: '产品部', code: 'PRODUCT' },
    { label: '设计部', code: 'DESIGN' },
    { label: '人事部', code: 'HR' },
  ],
  leave_type: [
    { label: '事假', code: 'PERSONAL' },
    { label: '病假', code: 'SICK' },
    { label: '年假', code: 'ANNUAL' },
    { label: '调休', code: 'COMPENSATORY' },
    { label: '婚假', code: 'MARRIAGE' },
  ],
  risk_level: [{ label: 'P1 · 需多部门会签', code: 'P1' }],
}

export const MOCK_DICT_TYPES: { code: string; name: string }[] = [
  { code: 'sex', name: '性别' },
  { code: 'status', name: '审批状态' },
  { code: 'dept', name: '部门' },
  { code: 'leave_type', name: '请假类型' },
]
