/**
 * 表单定义状态（FormDefStatus）中文映射 + 标签色。
 *
 * 可复用：列表页状态列、详情页标签、筛选下拉等均引用此映射。
 * 按页型规范使用语义 token，禁硬编颜色。
 *
 * 接缝：将来设计器可自定义状态映射时，只换此文件；消费方零改。
 */
import type { FormDefStatus } from '@/modules/form/api/form-def'

export interface StatusMapEntry {
  label: string
  /** el-tag type：success / warning / info / danger */
  type: 'success' | 'warning' | 'info' | 'danger'
}

/** 状态 → 中文 label + 标签色。 */
export const FORM_DEF_STATUS_MAP: Record<FormDefStatus, StatusMapEntry> = {
  DRAFT: { label: '草稿', type: 'info' },
  PUBLISHED: { label: '已发布', type: 'success' },
}

/** 取中文 label（兜底回退 key）。 */
export function getFormDefStatusLabel(status: FormDefStatus): string {
  return FORM_DEF_STATUS_MAP[status]?.label ?? status
}

/** 取标签色 type（兜底回退 info）。 */
export function getFormDefStatusType(status: FormDefStatus): StatusMapEntry['type'] {
  return FORM_DEF_STATUS_MAP[status]?.type ?? 'info'
}
