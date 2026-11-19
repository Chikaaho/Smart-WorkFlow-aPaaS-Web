/**
 * design-fixtures 共享类型与工具（dev-only，随 mock 模块 tree-shake）。
 *
 * 必须独立成文件：nodes/designer 文件从这里引工具；若并入入口 design-fixtures.ts，
 * nodes 文件循环 import 入口，OVERRIDES 顶层构造时会触发 TDZ，故单独存放。
 */

export type ApiResponseLike = { code: number; message: string; data: unknown }

export type DesignMockHandler = (
  params: Record<string, string>,
  query: Record<string, string>,
  body: unknown,
) => ApiResponseLike | Promise<ApiResponseLike>

export const ok = (data: unknown): ApiResponseLike => ({ code: 0, message: 'ok', data })

export function historyRow(partial: Record<string, unknown>): Record<string, unknown> {
  historyRowSeed += 1
  return {
    taskId: 'fx-task-' + String(historyRowSeed),
    assignee: '',
    approvalResult: 'APPROVED',
    ...partial,
  }
}
export let historyRowSeed = 0
