import { request } from '@/foundation/request'
import { getAccessToken, getCurrentUsername, setTokenResponse, clearToken } from './token'
import { encryptPassword } from './rsa'
import type { LoginChallengeDTO } from './rsa'

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
  /** RSA-OAEP 加密前的明文密码（仅在内存中存在，加密后提交） */
  password: string
  /** 用户输入的验证码内容 */
  captcha: string
  /** 登录页展示的挑战（含 captchaId 与 publicKey） */
  challenge: LoginChallengeDTO
}

export type { LoginChallengeDTO }

/** 获取一次性登录挑战（验证码 + RSA 公钥 + 服务器时间，服务端 5 分钟 TTL） */
export async function fetchChallenge(): Promise<LoginChallengeDTO> {
  return request<LoginChallengeDTO>({ method: 'GET', url: '/auth/challenge' })
}

export { getAccessToken, getCurrentUsername }

export async function login(payload: LoginPayload): Promise<void> {
  // 密码在离开浏览器前用挑战公钥加密（RSA-OAEP/SHA-256）；明文不进入请求
  const encryptedPassword = await encryptPassword(payload.challenge.publicKey, payload.password)
  const data = await request<TokenResponseDTO>({
    method: 'POST',
    url: '/auth/login',
    data: {
      username: payload.username,
      password: encryptedPassword,
      captcha: payload.captcha,
      captchaId: payload.challenge.captchaId,
      // 客户端 Unix epoch 毫秒（机器时间校验用）
      timestamp: Date.now().toString(),
    },
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
    fetchChallenge,
    login,
    logout,
    refresh,
  }
}
