/**
 * Mock handler 注册聚合入口 —— 各域 handler 文件导出纯数据（无副作用），
 * 由本文件聚合成 mockRegistrations，foundation/mock/index 在 registry 初始化后集中注册。
 *
 * ## 扩展指南
 * 在对应域的 *-handlers.ts 追加 handler，modules/* 与各 service 层零改动：
 *
 * ```ts
 * export const xxxMockRegistrations: MockRegistration[] = [
 *   ...,
 *   {
 *     method: 'GET',
 *     pattern: '/api/your/endpoint/:param',
 *     handler: (params, query, body) => ({ code: 0, message: 'ok', data: { ... } }),
 *   },
 * ]
 * ```
 *
 * 共享辅助（分页、权限装配等）位于 ./mock-shared；种子数据位于 ./seeds；
 * 专项文件：tenant / app-management / f020-datasource / w020-authorize /
 * i4-workbench / p62-txn-action。
 */
import type { MockRegistration } from './mock-shared'
import { f020DatasourceMockRegistrations } from './f020-datasource-mocks'
import { w020AuthorizeMockRegistrations } from './w020-authorize-mocks'
import { tenantMockRegistrations } from './tenant-handlers'
import { appManagementMockRegistrations } from './app-management-handlers'
import { i4MockRegistrations } from './i4-workbench-handlers'
import { p62TxnActionMockRegistrations } from './p62-txn-action-handlers'
import { workflowMockRegistrations } from './workflow-handlers'
import { iotMockRegistrations } from './iot-handlers'
import { authMockRegistrations } from './auth-handlers'
import { systemMockRegistrations } from './system-handlers'
import { formMockRegistrations } from './form-handlers'
import { notifyMockRegistrations } from './notify-handlers'
import { jobMockRegistrations } from './job-handlers'
import { agentMockRegistrations } from './agent-handlers'

export const mockRegistrations: MockRegistration[] = [
  ...(f020DatasourceMockRegistrations as MockRegistration[]),
  ...(w020AuthorizeMockRegistrations as MockRegistration[]),
  ...tenantMockRegistrations,
  ...appManagementMockRegistrations,
  // ── I4 编排/运营/工作台 mock ──
  ...i4MockRegistrations,
  // ── P62 事务动作 mock ──
  ...p62TxnActionMockRegistrations,
  ...workflowMockRegistrations,
  ...iotMockRegistrations,
  ...authMockRegistrations,
  ...systemMockRegistrations,
  ...formMockRegistrations,
  ...notifyMockRegistrations,
  ...jobMockRegistrations,
  ...agentMockRegistrations,
]

// 兼容旧导入路径：登录挑战状态原从本文件导出（部分 spec 直接 import）
export { MOCK_LOGIN_CHALLENGES } from './auth-handlers'
