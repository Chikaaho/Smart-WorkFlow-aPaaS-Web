/**
 * 流程定义目录接缝：form / job 模块访问 workflow 流程定义目录的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；需要跨模块流程
 * 定义能力时经本 adapter 收敛——运行时值走动态 import（保持懒加载、不建立静态跨模块
 * 依赖），同步纯函数与类型按具名契约转出（不放宽为整包转导出）。后续若沉淀正式 facade，
 * 仅换本文件数据源。
 */
import type { PageQuery, PageResult } from '@/contracts/common'
import type { ProcessDef } from '@/contracts/bpm'
import type { BpmNodeCapability } from '@/contracts/bpm-node'
import type { CreateProcessDefRequest } from '@/modules/workflow/api'

export type { ProcessDef }

/** 主题规则展示（同步纯函数：变量显示成 [文案]，固定文字原样；供关联流程列表行内用）。 */
export { themeRuleDisplay } from '@/modules/workflow/utils/theme-rule'

/**
 * 主题规则设置弹窗的异步加载器。
 * 用法：`const ThemeRuleDialog = defineAsyncComponent(themeRuleDialogLoader)`。
 */
export function themeRuleDialogLoader() {
  return import('@/modules/workflow/views/ThemeRuleDialog.vue')
}

/** 分页查询流程定义；formKey 由服务端按 form_key 列精确过滤（表单工作台「关联流程」）。 */
export async function pageProcessDefs(
  query: PageQuery,
  formKey?: string,
): Promise<PageResult<ProcessDef>> {
  const { pageProcessDefs: page } = await import('@/modules/workflow/api')
  return page(query, formKey)
}

/** 创建流程定义（携带 formKey 时由服务端校验表单存在并持久化关联，不靠路由参数伪关联）。 */
export async function createProcessDef(req: CreateProcessDefRequest): Promise<void> {
  const { createProcessDef: create } = await import('@/modules/workflow/api')
  await create(req)
}

/**
 * 节点能力目录（Q56：表单工作台零关联流程分支的节点库纯展示用）。
 * 与设计器同一服务端能力契约；只读 GET，不创建任何流程定义。
 */
export async function fetchNodeCapabilities(): Promise<BpmNodeCapability[]> {
  const { getProcessNodeCapabilities } = await import('@/modules/workflow/api')
  return getProcessNodeCapabilities()
}

/** 设计器节点面板的展示层投影（分组 + 图标字形）：空状态节点库与画布同源复用（Q56）。 */
export { groupPaletteCapabilities, nodeIconPaths } from '@/modules/workflow/utils/designer-palette'
export type { PaletteGroup } from '@/modules/workflow/utils/designer-palette'

// 0.1.7 #21：流程定义禁删，接缝层不提供删除。
