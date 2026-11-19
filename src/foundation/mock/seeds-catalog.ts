/**
 * 目录种子：分类、目录项、我的复制、催办状态、工作台布局。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export interface MockCatalogCategory {
  id: number
  name: string
  sortNo: number
}

export interface MockCatalogItem {
  itemKey: string
  name: string
  formKey: string
  categoryId: number | null
  status: 'PUBLISHED' | 'DRAFT'
  formPublished: boolean
  bindingActive: boolean
  /** portal 可见性（mock 简化：false = 受限事项，普通视角不可见；管理视角仍展示） */
  portalVisible: boolean
}

export const MOCK_CATEGORIES: MockCatalogCategory[] = [
  { id: 1, name: '行政办公', sortNo: 1 },
  { id: 2, name: '人事财务', sortNo: 2 },
]

export const MOCK_CATALOG_ITEMS: MockCatalogItem[] = [
  {
    itemKey: 'bpm_leave01',
    name: '请假申请',
    formKey: 'leave_form',
    categoryId: 1,
    status: 'PUBLISHED',
    formPublished: true,
    bindingActive: true,
    portalVisible: true,
  },
  {
    itemKey: 'bpm_expense01',
    name: '报销申请',
    formKey: 'expense_form',
    categoryId: 2,
    status: 'PUBLISHED',
    formPublished: true,
    bindingActive: true,
    portalVisible: true,
  },
  {
    itemKey: 'bpm_supply01',
    name: '办公用品领用',
    formKey: 'supply_form',
    categoryId: null,
    status: 'PUBLISHED',
    formPublished: true,
    bindingActive: true,
    portalVisible: true,
  },
  {
    itemKey: 'bpm_secret01',
    name: '涉密事项（受限）',
    formKey: 'secret_form',
    categoryId: 1,
    status: 'PUBLISHED',
    formPublished: true,
    bindingActive: true,
    portalVisible: false,
  },
  {
    itemKey: 'bpm_draft01',
    name: '未发布流程',
    formKey: 'draft_form',
    categoryId: 1,
    status: 'DRAFT',
    formPublished: true,
    bindingActive: false,
    portalVisible: false,
  },
]

export interface MockCopyRecord {
  id: number
  processInstanceId: string
  nodeKey: string
  taskId: string
  recipientId: string
  deliveryStatus: string
  createTime: string
  formKey: string
  processDefKey: string
  businessKey: string
  initiatorId: number
  instanceStatus: string
}

export const MOCK_MY_COPIES: MockCopyRecord[] = [
  {
    id: 1,
    processInstanceId: 'pi-1001',
    nodeKey: 'node_copy',
    taskId: 'task-9001',
    recipientId: '1',
    deliveryStatus: 'SUCCESS',
    createTime: '2026-09-07 10:00:00',
    formKey: 'leave_form',
    processDefKey: 'bpm_leave01',
    businessKey: 'rec-1001',
    initiatorId: 1,
    instanceStatus: 'APPROVED',
  },
  {
    id: 2,
    processInstanceId: 'pi-1002',
    nodeKey: 'node_copy',
    taskId: 'task-9002',
    recipientId: '1',
    deliveryStatus: 'SUCCESS',
    createTime: '2026-09-07 11:30:00',
    formKey: 'expense_form',
    processDefKey: 'bpm_expense01',
    businessKey: 'rec-1002',
    initiatorId: 1,
    instanceStatus: 'RUNNING',
  },
]

export const MOCK_URGE_LAST_ACCEPTED: Record<string, number> = {}

export const MOCK_WORKSPACE_LAYOUTS: Record<string, { layout: unknown }> = {}
