import { request } from '@/foundation/request'
import { getAccessToken, getCurrentUsername, setTokenResponse, clearToken } from './token'

// ========== DTO（后端形状，不提升为 contract） ==========

interface TokenResponseDTO {
  accessToken: string
  expiresIn: number
}

// ========== 单飞锁 ==========

let refreshPromise: Promise<void> | null = null

// ========== 公开 API ==========

export interface LoginPayload {
  username: string
  password: string
}

export { getAccessToken, getCurrentUsername }

export async function login(payload: LoginPayload): Promise<void> {
  const data = await request<TokenResponseDTO>({
    method: 'POST',
    url: '/auth/login',
    data: payload,
  })
  setTokenResponse(data.accessToken, data.expiresIn, payload.username)
}

export async function logout(): Promise<void> {
  try {
    await request<null>({ method: 'POST', url: '/auth/logout' })
  } catch {
    // 网络断开 / 端点异常时静默吞掉，确保 finally 中的本地清除被执行
  } finally {
    clearToken()
  }
}

export async function refresh(): Promise<void> {
  // 单飞：如果已有 refresh 在进行中，等它完成
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const data = await request<TokenResponseDTO>({
        method: 'POST',
        url: '/auth/refresh',
      })
      setTokenResponse(data.accessToken, data.expiresIn)
    } finally {
      // 无论成败，释放单飞锁。失败时调用方（请求拦截器/guard）各自处理异常
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function useAuth() {
  return {
    getAccessToken,
    getCurrentUsername,
    login,
    logout,
    refresh,
  }
}
