/**
 * OA 事项目录接缝：form 设计器按 formKey 反查所属分类（面包屑）的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；跨模块 join
 * 收敛在本接缝内完成，消费方只拿结果，不接触 workflow 目录内部结构。
 */
import type { CatalogCategory, CatalogItem } from '@/contracts/catalog'

/**
 * 按表单 formKey 反查其所属事项目录分类名；未分类 / 查询失败返回 null（面包屑不阻断设计器）。
 */
export async function findCategoryNameByFormKey(formKey: string): Promise<string | null> {
  try {
    const { listCategories, queryCatalogItems } = await import('@/modules/workflow/api/oa')
    const [categories, itemsPage] = await Promise.all([
      listCategories(),
      queryCatalogItems({ pageNum: 1, pageSize: 200 }),
    ])
    const item = itemsPage.list.find((it: CatalogItem) => it.formKey === formKey)
    if (!item?.categoryId) return null
    return (
      (categories as CatalogCategory[]).find((c: CatalogCategory) => c.id === item.categoryId)
        ?.name ?? null
    )
  } catch {
    return null
  }
}
