import { setAccessToken } from './token'

const DEBUG_USER_ID_PATTERN = /^[1-9]\d*$/

/**
 * 仅由开发构建入口调用的 token 注入接缝。
 *
 * token 只进入既有的内存 access-token 槽位，后续请求仍统一由 request 层
 * 添加 Authorization: Bearer test_<userId>；不落 localStorage/sessionStorage。
 */
export function resolveDevDebugUserId(
  enabled = import.meta.env.VITE_DEBUG_AUTH_ENABLED === 'true',
  rawUserId = import.meta.env.VITE_DEBUG_AUTH_USER_ID,
): string | null {
  if (!import.meta.env.DEV || !enabled) return null
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : ''
  return DEBUG_USER_ID_PATTERN.test(userId) ? userId : null
}

/** 注入开发调试身份；返回用户 ID 便于启动证据记录，失败时不改变现有认证状态。 */
export function initializeDevDebugAuth(): string | null {
  const userId = resolveDevDebugUserId()
  if (!userId) return null
  setAccessToken(`test_${userId}`)
  return userId
}
