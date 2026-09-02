import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { ApiResponse } from '@/contracts/common'
import { getAccessToken, isTokenNearExpiry } from '@/foundation/auth/token'
import { getErrorMessage } from './error-code-map'

/**
 * 业务层唯一 HTTP 入口。axios 只允许在本文件出现（ESLint 边界规则强制）。
 */
const client: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10_000,
})

// /auth/login、/auth/refresh、/auth/logout 自身的 401/未授权响应不走全局跳登录处理，
// 否则登录页的"账密错误"提示会被误判成会话失效并清态跳转。
const AUTH_ENDPOINTS_EXCLUDED_FROM_401_HANDLING = ['/auth/login', '/auth/refresh', '/auth/logout']

type UnauthorizedHandler = (redirectPath: string) => void

let unauthorizedHandler: UnauthorizedHandler | null = null

/**
 * 由 router 层在创建 router 后注入（依赖反转），避免 foundation/request 直接依赖 router 造成循环依赖。
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

// ========== refreshHandler 依赖注入（避免 request ↔ auth/index 循环依赖） ==========

type RefreshHandler = () => Promise<void>
let refreshHandler: RefreshHandler | null = null

export function setRefreshHandler(handler: RefreshHandler): void {
  refreshHandler = handler
}

/** 后端业务层错误(HTTP 200 + code≠0),上层按 code 映射可读提示。 */
export class ApiError extends Error {
  readonly code: number
  readonly msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'ApiError'
    this.code = code
    this.msg = msg
  }
}

client.interceptors.request.use(async (config) => {
  const url = config.url ?? ''
  const isAuthEndpoint = AUTH_ENDPOINTS_EXCLUDED_FROM_401_HANDLING.some((path) =>
    url.includes(path),
  )

  // 到期前刷新：只在非 auth 端点、有 token、即将到期时触发
  if (!isAuthEndpoint && getAccessToken() && isTokenNearExpiry()) {
    if (refreshHandler) {
      try {
        await refreshHandler()
      } catch {
        // refresh 失败 → 不清除 token（让响应拦截器的 401 统一处理跳登录）
      }
    }
  }

  // 注入 Bearer token（可能是 refresh 后的新 token，或旧/过期 token）
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? ''
    const isAuthEndpoint = AUTH_ENDPOINTS_EXCLUDED_FROM_401_HANDLING.some((path) =>
      url.includes(path),
    )
    if (error.response?.status === 401 && !isAuthEndpoint) {
      unauthorizedHandler?.(window.location.pathname + window.location.search)
    } else if (!isAuthEndpoint) {
      // TODO(skeleton): 5xx / 网络层基础设施异常分级处理，对齐后端「过滤层异常分级」原则
    }
    return Promise.reject(error)
  },
)

export async function request<T>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  // ── dev-only 全 mock 开关 ──
  // 双重 gate + 动态 import 保证 tree-shake 安全：prod 构建时 import.meta.env.DEV 恒为 false，
  // 整个 if 块被 DCE，foundation/mock/ 不出现在 dist 中。
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true') {
    const { dispatchMock } = await import('@/foundation/mock/index')
    const mockResult = await dispatchMock<T>(
      config.method ?? 'GET',
      config.url ?? '',
      client.defaults.baseURL ?? '/api',
      (config.params as Record<string, string>) ?? {},
      config.data,
    )
    if (mockResult !== undefined) {
      // mock 响应流经与真实请求相同的错误归一管线（ApiError）
      if (mockResult.code !== 0) {
        throw new ApiError(mockResult.code, getErrorMessage(mockResult.code, mockResult.message))
      }
      return mockResult.data as T
    }
    // fallthrough: 无匹配 handler → 走真实 axios
  }

  const response = await client.request<ApiResponse<T>>(config).catch((error: AxiosError) => {
    // 非 2xx（如 403/404 过滤器直出 R 结构）在 axios validateStatus 就已 reject，
    // 统一归一为 ApiError，让上层按业务码呈现明确拒绝态而不是裸 AxiosError
    const status = error.response?.status
    const payload = error.response?.data as Partial<ApiResponse<unknown>> | undefined
    const bodyCode = payload && typeof payload.code === 'number' ? payload.code : undefined
    if (bodyCode !== undefined && bodyCode !== 0) {
      const msg = (payload as { msg?: string } | undefined)?.msg ?? payload?.message
      throw new ApiError(bodyCode, getErrorMessage(bodyCode, msg))
    }
    if (status === 403) {
      throw new ApiError(403, getErrorMessage(403, '无权限'))
    }
    throw error
  })

  // blob 响应（文件下载/导出）：成功时数据是 Blob 而非 R 结构。
  // 后端业务错误对 blob 请求也返回 application/json 的 R 包，需解析并走统一 ApiError 管线。
  if (config.responseType === 'blob') {
    const blob = response.data as unknown as Blob
    const contentType = blob.type
    if (contentType.includes('application/json')) {
      const text = await blob.text()
      try {
        const payload = JSON.parse(text) as ApiResponse<T>
        throw new ApiError(payload.code, getErrorMessage(payload.code, payload.message))
      } catch (e) {
        if (e instanceof ApiError) throw e
        throw new ApiError(500, getErrorMessage(500, '下载响应解析失败'))
      }
    }
    return blob as T
  }

  if (response.data.code !== 0) {
    throw new ApiError(
      response.data.code,
      getErrorMessage(response.data.code, response.data.message),
    )
  }
  return response.data.data
}
