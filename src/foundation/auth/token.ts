/**
 * 纯 token/用户名内存存储，不依赖 foundation/request，避免 auth ↔ request 循环依赖。
 * 安全约束：access token 仅存内存，禁止落 localStorage/sessionStorage。
 */

let accessToken: string | null = null
let expiresAt: number | null = null
let lastUsername: string | null = null

/** 提前刷新阈值：到期前 60 秒即触发刷新 */
const EXPIRY_BUFFER_MS = 60_000

// === 保留的已有导出（不改签名） ===

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getCurrentUsername(): string | null {
  return lastUsername
}

export function setCurrentUsername(username: string | null): void {
  lastUsername = username
}

// === 新增导出 ===

/** 获取 token 到期时间戳（毫秒），null 表示无 token */
export function getTokenExpiresAt(): number | null {
  return expiresAt
}

/** token 是否即将到期（到期前 60s 内或已到期） */
export function isTokenNearExpiry(): boolean {
  if (expiresAt === null) return false
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS
}

/** 一次性设置 token + 到期戳 + 用户名，用于 login 和 refresh 成功回调 */
export function setTokenResponse(token: string, expiresInSeconds: number, username?: string): void {
  accessToken = token
  expiresAt = Date.now() + expiresInSeconds * 1000
  if (username !== undefined) {
    lastUsername = username
  }
}

/** 清除全部 token 状态 */
export function clearToken(): void {
  accessToken = null
  expiresAt = null
  lastUsername = null
}
