/**
 * Mock 种子聚合入口 —— 各域种子在 seeds-<domain>.ts，本文件 re-export 保持既有
 * `from './seeds'` 导入路径不变（ES module live binding，可变状态仍是单例）。
 */
import { MOCK_SESSION_DATA_ADMIN, collectSessionPermissions } from './seeds-session'

export * from './seeds-session'
export * from './seeds-menu'
export * from './seeds-dict'
export * from './seeds-form'
export * from './seeds-workflow'
export * from './seeds-notify'
export * from './seeds-system'
export * from './seeds-job'
export * from './seeds-iot'
export * from './seeds-agent'
export * from './seeds-catalog'

// 跨组时序副作用：admin 会话的按钮权限需在角色-菜单绑定（system 组）声明后补齐，避免 TDZ。
MOCK_SESSION_DATA_ADMIN.permissions = collectSessionPermissions(['admin'])
