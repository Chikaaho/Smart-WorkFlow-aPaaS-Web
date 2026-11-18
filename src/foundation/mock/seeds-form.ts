/**
 * 表单种子：演示表单定义、提交记录、表单定义存储、应用种子与快照。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const DEMO_FORM_KEY = 'demo-form'

export const MOCK_DEMO_FORM_DEFINITION = {
  title: '请假申请单',
  fields: [
    { name: 'applicant', label: '申请人', type: 'TEXT', required: true },
    { name: 'department', label: '部门', type: 'DICT', required: true, dictType: 'dept' },
    { name: 'leaveType', label: '请假类型', type: 'DICT', required: true, dictType: 'leave_type' },
    { name: 'leaveDate', label: '请假日期', type: 'DATE', required: true },
    { name: 'days', label: '天数', type: 'NUMBER', required: true },
    { name: 'urgent', label: '是否加急', type: 'BOOL' },
    { name: 'reason', label: '事由', type: 'RICH_TEXT' },
    { name: 'relatedRecord', label: '关联单号', type: 'REFERENCE', targetFormId: 'demo-form' },
    {
      name: 'attachments',
      label: '附件',
      type: 'TABLE',
      subFields: [
        { name: 'fileName', type: 'TEXT' },
        { name: 'fileSize', type: 'TEXT' },
        { name: 'fileType', type: 'TEXT' },
      ],
    },
  ],
}

export const MOCK_DEMO_SUBMISSIONS = [
  {
    id: 'rec_001',
    applicant: '张三',
    department: 'TECH',
    leaveType: 'SICK',
    leaveDate: '2026-06-20',
    days: 2,
    urgent: false,
    reason: '感冒发烧，需要休息',
    attachments: JSON.stringify([{ fileName: '诊断书.jpg', fileSize: '2.3MB', fileType: '图片' }]),
  },
  {
    id: 'rec_002',
    applicant: '李四',
    department: 'PRODUCT',
    leaveType: 'ANNUAL',
    leaveDate: '2026-06-21',
    days: 5,
    urgent: true,
    reason: '年假出游，已安排工作交接',
    attachments: JSON.stringify([]),
  },
  {
    id: 'rec_003',
    applicant: '王五',
    department: 'DESIGN',
    leaveType: 'PERSONAL',
    leaveDate: '2026-06-25',
    days: 1,
    urgent: false,
    reason: '家里有事需要处理',
    attachments: JSON.stringify([
      { fileName: '申请说明.docx', fileSize: '0.5MB', fileType: '文档' },
    ]),
  },
  {
    id: 'rec_004',
    applicant: '赵六',
    department: 'TECH',
    leaveType: 'COMPENSATORY',
    leaveDate: '2026-06-28',
    days: 0.5,
    urgent: false,
    reason: '调休半天',
    attachments: JSON.stringify([]),
  },
  {
    id: 'rec_005',
    applicant: '陈七',
    department: 'HR',
    leaveType: 'MARRIAGE',
    leaveDate: '2026-07-01',
    days: 15,
    urgent: false,
    reason: '婚假申请',
    attachments: JSON.stringify([
      { fileName: '结婚证.jpg', fileSize: '3.1MB', fileType: '图片' },
      { fileName: '请假申请单.pdf', fileSize: '1.2MB', fileType: '文档' },
    ]),
  },
]

export const MOCK_FORM_DATA_RECORDS: Record<string, unknown>[] = [
  {
    id: 'fd_001',
    version: 1,
    applicant: '张三',
    department: 'TECH',
    leaveType: 'SICK',
    leaveDate: '2026-06-20',
    days: 2,
    urgent: 1,
    reason: '感冒发烧，需要休息',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([{ fileName: '诊断书.jpg', fileSize: '2.3MB', fileType: '图片' }]),
    create_time: '2026-06-20 08:30:00',
  },
  {
    id: 'fd_002',
    version: 1,
    applicant: '李四',
    department: 'PRODUCT',
    leaveType: 'ANNUAL',
    leaveDate: '2026-06-21',
    days: 5,
    urgent: 0,
    reason: '年假出游，已安排工作交接',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([]),
    create_time: '2026-06-21 09:15:00',
  },
  {
    id: 'fd_003',
    version: 1,
    applicant: '王五',
    department: 'DESIGN',
    leaveType: 'PERSONAL',
    leaveDate: '2026-06-25',
    days: 1,
    urgent: 0,
    reason: '家里有事需要处理',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([
      { fileName: '申请说明.docx', fileSize: '0.5MB', fileType: '文档' },
    ]),
    create_time: '2026-06-25 10:00:00',
  },
  {
    id: 'fd_004',
    version: 1,
    applicant: '赵六',
    department: 'TECH',
    leaveType: 'COMPENSATORY',
    leaveDate: '2026-06-28',
    days: 0.5,
    urgent: 0,
    reason: '调休半天',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([]),
    create_time: '2026-06-28 14:20:00',
  },
  {
    id: 'fd_005',
    version: 1,
    applicant: '陈七',
    department: 'HR',
    leaveType: 'MARRIAGE',
    leaveDate: '2026-07-01',
    days: 15,
    urgent: 1,
    reason: '婚假申请',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([
      { fileName: '结婚证.jpg', fileSize: '3.1MB', fileType: '图片' },
      { fileName: '请假申请单.pdf', fileSize: '1.2MB', fileType: '文档' },
    ]),
    create_time: '2026-07-01 07:45:00',
  },
]

export const MOCK_GENERIC_FORM_RECORDS: Record<string, unknown>[] = [
  {
    id: 'gen_001',
    version: 1,
    name: '张三',
    department: 'TECH',
    date: '2026-06-20',
    amount: 1500,
    remark: '通用记录一，用于测试关联选择器',
    create_time: '2026-06-20 08:30:00',
  },
  {
    id: 'gen_002',
    version: 1,
    name: '李四',
    department: 'PRODUCT',
    date: '2026-06-21',
    amount: 3200,
    remark: '通用记录二，用于测试关联选择器',
    create_time: '2026-06-21 09:15:00',
  },
  {
    id: 'gen_003',
    version: 1,
    name: '王五',
    department: 'DESIGN',
    date: '2026-06-22',
    amount: 800,
    remark: '通用记录三，用于测试关联选择器',
    create_time: '2026-06-22 10:00:00',
  },
]

export const MOCK_FORM_DEF_STORE: Map<
  string,
  {
    id: string
    formKey: string
    name: string
    status: 'DRAFT' | 'PUBLISHED'
    definition: string
    formVersion: number
  }
> = new Map()

export interface MockAppFormItem {
  formId: string
  formKey: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  dirId: string | null
}

export interface MockAppDir {
  id: string
  appId: string
  name: string
  sortNo: number
  forms: MockAppFormItem[]
}

export interface MockApp {
  id: string
  name: string
  icon: string | null
  color: string | null
  sortNo: number
  visibleScopeType: 'ALL' | 'SPECIFIED'
  visibleUserIds: Array<number | string> | null
  visibleDeptIds?: number[] | null
  visibleRoleCodes?: string[] | null
  visiblePostIds?: number[] | null
  visibleTenantIds?: number[] | null
  status: 'ENABLED' | 'DISABLED'
  source: 'MANUAL' | 'LEGACY_CATEGORY' | 'LEGACY_UNCATEGORIZED'
  legacyCategoryId?: number | null
  dirs: MockAppDir[]
  directForms: MockAppFormItem[]
}

export const MOCK_APP_SEEDS: MockApp[] = [
  {
    id: 'mock-app-001',
    name: '人事应用',
    icon: 'User',
    color: '#7e306b',
    sortNo: 1,
    visibleScopeType: 'ALL',
    visibleUserIds: null,
    status: 'ENABLED',
    source: 'MANUAL',
    dirs: [
      {
        id: 'mock-dir-001',
        appId: 'mock-app-001',
        name: '入职与请假',
        sortNo: 1,
        forms: [
          {
            formId: 'seed-def-001',
            formKey: 'leave-request',
            name: '请假申请单',
            status: 'PUBLISHED',
            dirId: 'mock-dir-001',
          },
        ],
      },
    ],
    directForms: [
      {
        formId: 'seed-def-002',
        formKey: 'onboarding-form',
        name: '入职登记表',
        status: 'PUBLISHED',
        dirId: null,
      },
    ],
  },
  {
    id: 'mock-app-002',
    name: '行政应用',
    icon: 'Tickets',
    color: '#409eff',
    sortNo: 2,
    visibleScopeType: 'SPECIFIED',
    visibleUserIds: [1],
    status: 'ENABLED',
    source: 'MANUAL',
    dirs: [],
    directForms: [],
  },
]

export const MOCK_APP_STORE: Map<string, MockApp> = new Map(
  MOCK_APP_SEEDS.map((item) => [item.id, JSON.parse(JSON.stringify(item)) as MockApp]),
)

export const MOCK_FORM_DEF_SEEDS: Array<{
  id: string
  formKey: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  definition: string
  formVersion: number
}> = [
  {
    id: 'seed-def-001',
    formKey: 'leave-request',
    name: '请假申请单',
    status: 'PUBLISHED',
    definition: JSON.stringify(MOCK_DEMO_FORM_DEFINITION),
    formVersion: 2,
  },
  {
    id: 'seed-def-002',
    formKey: 'expense-report',
    name: '费用报销单',
    status: 'DRAFT',
    definition: JSON.stringify({ title: '费用报销单', fields: [] }),
    formVersion: 1,
  },
  {
    id: 'seed-def-003',
    formKey: 'purchase-order',
    name: '采购订单',
    status: 'PUBLISHED',
    definition: JSON.stringify({ title: '采购订单', fields: [] }),
    formVersion: 1,
  },
  {
    id: 'seed-def-004',
    formKey: 'travel-reimbursement',
    name: '差旅报销',
    status: 'DRAFT',
    definition: JSON.stringify({ title: '差旅报销', fields: [] }),
    formVersion: 1,
  },
  {
    id: 'seed-def-005',
    formKey: 'contract-approval',
    name: '合同审批',
    status: 'PUBLISHED',
    definition: JSON.stringify({ title: '合同审批', fields: [] }),
    formVersion: 3,
  },
]

export const MOCK_FORM_SNAPSHOTS: Array<{
  formId: string
  formVersion: number
  definition: string
  createTime: string
}> = [
  {
    formId: 'seed-def-001',
    formVersion: 1,
    definition: JSON.stringify({ title: '请假申请单', fields: [] }),
    createTime: '2026-06-01 09:00:00',
  },
  {
    formId: 'seed-def-001',
    formVersion: 2,
    definition: JSON.stringify(MOCK_DEMO_FORM_DEFINITION),
    createTime: '2026-06-30 10:00:00',
  },
  {
    formId: 'seed-def-005',
    formVersion: 1,
    definition: JSON.stringify({ title: '合同审批', fields: [] }),
    createTime: '2026-05-11 14:00:00',
  },
  {
    formId: 'seed-def-005',
    formVersion: 2,
    definition: JSON.stringify({ title: '合同审批 V2', fields: [] }),
    createTime: '2026-06-02 11:30:00',
  },
  {
    formId: 'seed-def-005',
    formVersion: 3,
    definition: JSON.stringify({ title: '合同审批', fields: [] }),
    createTime: '2026-07-01 16:20:00',
  },
]

export function initFormDefStore(): void {
  if (MOCK_FORM_DEF_STORE.size === 0) {
    for (const seed of MOCK_FORM_DEF_SEEDS) {
      MOCK_FORM_DEF_STORE.set(seed.id, seed)
    }
  }
}

initFormDefStore()
