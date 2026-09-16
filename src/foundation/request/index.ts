import { i18n, currentLocale } from '@/locales'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { ApiResponse } from '@/contracts/common'
import { getAccessToken, isTokenNearExpiry } from '@/foundation/auth/token'
import { getErrorMessage } from './error-code-map'
import {
  categoryMessage,
  classifyHttpStatus,
  classifyTransportFailure,
  type FailureCategory,
} from './failure-category'

export type { FailureCategory }
export { getErrorMessage } from './error-code-map'
export {
  isRetryable,
  categoryMessage,
  categoryRecovery,
  classifyHttpStatus,
} from './failure-category'

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

/** 为真实浏览器请求生成可由服务端 ACCESS 日志回读的非秘密关联标识。 */
function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`
  }
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 后端业务层错误(HTTP 200 + code≠0),上层按 code 映射可读提示。 */
export class ApiError extends Error {
  readonly code: number
  readonly msg: string
  /** 失败类别（P61 §3.5）：页面据此区分可重试 / 需重登 / 需授权 / 对象不存在等。 */
  readonly category: FailureCategory
  /** 后端稳定语义标识；旧调用方忽略，新调用方据此分流（与数值码解耦）。 */
  readonly errorKey?: string
  /** 事件引用：用户可报出，服务端据此定位诊断记录。 */
  readonly eventRef?: string

  constructor(
    code: number,
    msg: string,
    category: FailureCategory = 'INPUT_CORRECTABLE',
    errorKey?: string,
    eventRef?: string,
  ) {
    super(msg)
    this.name = 'ApiError'
    this.code = code
    this.msg = msg
    this.category = category
    this.errorKey = errorKey
    this.eventRef = eventRef
  }
}

/**
 * 业务失败（HTTP 200 + code≠0）的默认类别。
 *
 * 后端专门语义（如数据版本冲突可刷新重试）由后端在响应中显式给出类别；
 * 未给出时取**不可重试且不归咎用户输入**的保守默认：文案仍由后端 `msg` 承载，
 * 类别只决定页面是否提供重试入口，误判的最坏后果是多一次手动刷新而非错误重试。
 */
const DEFAULT_BUSINESS_CATEGORY: FailureCategory = 'INPUT_CORRECTABLE'

/** HTTP 形态的业务码（400/401/403/404/409/429/5xx）可直接按状态码归类。 */
function categoryOfBusinessCode(code: number): FailureCategory {
  if (
    code === 400 ||
    code === 401 ||
    code === 403 ||
    code === 404 ||
    code === 409 ||
    code === 429 ||
    code >= 500
  ) {
    return classifyHttpStatus(code)
  }
  return DEFAULT_BUSINESS_CATEGORY
}

client.interceptors.request.use(async (config) => {
  const url = config.url ?? ''
  const isAuthEndpoint = AUTH_ENDPOINTS_EXCLUDED_FROM_401_HANDLING.some((path) =>
    url.includes(path),
  )

  // P61 §3.3：Server 用同一语言返回可本地化消息；errorKey/code/eventRef 不随语言变化
  if (!config.headers.get('Accept-Language')) {
    config.headers.set('Accept-Language', currentLocale())
  }
  if (!config.headers.get('X-Request-Id')) {
    config.headers.set('X-Request-Id', createRequestId())
  }
  if (import.meta.env.DEV) {
    console.info(
      `[requestId] request ${config.headers.get('X-Request-Id')} ${config.method?.toUpperCase() ?? 'GET'} ${config.url ?? ''}`,
    )
  }

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
  (response) => {
    if (import.meta.env.DEV) {
      console.info(
        `[requestId] response ${response.config.headers.get('X-Request-Id')} ${response.status}`,
      )
    }
    return response
  },
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
    if (import.meta.env.DEV && error.config) {
      console.info(
        `[requestId] response ${error.config.headers?.get('X-Request-Id') ?? 'missing'} ${error.response?.status ?? 'NETWORK_ERROR'}`,
      )
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
        throw new ApiError(
          mockResult.code,
          getErrorMessage(mockResult.code, mockResult.message),
          categoryOfBusinessCode(mockResult.code),
        )
      }
      return mockResult.data as T
    }
    // fallthrough: 无匹配 handler → 走真实 axios
  }

  const response = await client.request<ApiResponse<T>>(config).catch((error: AxiosError) => {
    // 非 2xx（如 403/404 过滤器直出 R 结构）在 axios validateStatus 就已 reject，
    // 统一归一为 ApiError，让上层按业务码呈现明确拒绝态而不是裸 AxiosError。
    const status = error.response?.status
    const payload = error.response?.data as Partial<ApiResponse<unknown>> | undefined
    const bodyCode = payload && typeof payload.code === 'number' ? payload.code : undefined
    // 后端新契约字段：稳定语义标识与事件引用（旧后端不返回时为 undefined，行为不变）
    const errorKey = (payload as { errorKey?: string } | undefined)?.errorKey
    const eventRef = (payload as { eventRef?: string } | undefined)?.eventRef
    if (bodyCode !== undefined && bodyCode !== 0) {
      const msg = (payload as { msg?: string } | undefined)?.msg ?? payload?.message
      throw new ApiError(
        bodyCode,
        getErrorMessage(bodyCode, msg),
        status !== undefined ? classifyHttpStatus(status) : categoryOfBusinessCode(bodyCode),
        errorKey,
        eventRef,
      )
    }
    if (status !== undefined) {
      // 有 HTTP 状态但无可解析 R 体：按状态码分类，给出该类别下的安全结论。
      // 网关/代理直出的非结构化错误也走此处，不再把原始 AxiosError 抛给页面。
      const category = classifyHttpStatus(status)
      throw new ApiError(status, categoryMessage(category), category)
    }
    // 无响应：网络中断 / 超时 / 请求被取消，与 5xx 系统故障区分。
    const category = classifyTransportFailure(error.code)
    throw new ApiError(0, categoryMessage(category), category)
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
        throw new ApiError(
          payload.code,
          getErrorMessage(payload.code, payload.message),
          categoryOfBusinessCode(payload.code),
        )
      } catch (e) {
        if (e instanceof ApiError) throw e
        throw new ApiError(
          500,
          getErrorMessage(500, i18n.global.t('foundation.downloadParseFailed')),
          'SYSTEM_FAULT',
        )
      }
    }
    return blob as T
  }

  if (response.data.code !== 0) {
    // 后端 R 包错误文案字段为 msg（部分历史端点为 message），两者都透传给兜底映射
    const body = response.data as unknown as { msg?: string; errorKey?: string; eventRef?: string }
    throw new ApiError(
      response.data.code,
      getErrorMessage(response.data.code, body.msg ?? response.data.message),
      categoryOfBusinessCode(response.data.code),
      body.errorKey,
      body.eventRef,
    )
  }
  return response.data.data
}
