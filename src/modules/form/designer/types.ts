import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * 画布内字段的包装对象。
 *
 * 红线：`id` 仅供画布 UI 做 v-for key / 选中 / 拖拽追踪，**绝不进入表单定义对象**。
 * 保存/发布导出的 definition 只取 `field`（纯 FormSchemaField），不带 id —— 以此保证
 * 「除字段定义外不引入新键」，console.log 出去的 JSON 与后端契约同形。
 */
export interface DesignerItem {
  id: string
  field: FormSchemaField
}

let seq = 0
/** 生成画布项的临时 UI id（非业务键，不入库）。 */
export function nextDesignerItemId(): string {
  seq += 1
  return `di_${seq}`
}
